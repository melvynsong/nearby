import { NextRequest, NextResponse } from 'next/server'

type FoodSuggestResponse = {
  primarySuggestion: string | null
  alternativeSuggestions: string[]
  detectedTextHints: string[]
  containsMultipleFoods: boolean
  reasoningShort: string
}

const EMPTY_RESULT: FoodSuggestResponse = {
  primarySuggestion: null,
  alternativeSuggestions: [],
  detectedTextHints: [],
  containsMultipleFoods: false,
  reasoningShort: 'Not enough visual detail to identify a food with confidence.',
}

function normalizeResult(raw: unknown): FoodSuggestResponse {
  const obj = (raw ?? {}) as Partial<FoodSuggestResponse>
  const alternatives = Array.isArray(obj.alternativeSuggestions)
    ? obj.alternativeSuggestions.filter((x): x is string => typeof x === 'string').slice(0, 8)
    : []
  const hints = Array.isArray(obj.detectedTextHints)
    ? obj.detectedTextHints.filter((x): x is string => typeof x === 'string').slice(0, 12)
    : []
  return {
    primarySuggestion:
      typeof obj.primarySuggestion === 'string' && obj.primarySuggestion.trim()
        ? obj.primarySuggestion.trim()
        : null,
    alternativeSuggestions: alternatives,
    detectedTextHints: hints,
    containsMultipleFoods: Boolean(obj.containsMultipleFoods),
    reasoningShort:
      typeof obj.reasoningShort === 'string' && obj.reasoningShort.trim()
        ? obj.reasoningShort.trim()
        : EMPTY_RESULT.reasoningShort,
  }
}

function extractJson(content: string): FoodSuggestResponse | null {
  try {
    return normalizeResult(JSON.parse(content))
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return normalizeResult(JSON.parse(match[0]))
    } catch {
      return null
    }
  }
}

async function requestAiSuggestion(apiKey: string, imageUrl: string): Promise<FoodSuggestResponse> {
  const configuredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const prompt = `You are helping users classify food photos in a mobile app.
Analyze the image and return JSON only (no markdown).

Required schema:
{
  "primarySuggestion": string | null,
  "alternativeSuggestions": string[],
  "detectedTextHints": string[],
  "containsMultipleFoods": boolean,
  "reasoningShort": string
}

Rules:
- Use both visual cues and visible text (stall names, signage, menus).
- Keep reasoningShort under 22 words.
- Do NOT assign certainty language beyond what is visible.
- Include Singapore-relevant suggestions where plausible: Chicken Rice, Prawn Noodles, Laksa, Bak Kut Teh, Char Kway Teow, Hokkien Mee, Satay, Nasi Lemak, Wonton Mee, Fish Ball Noodles, Roti Prata.
- If unclear, set primarySuggestion to null.
- Do not include duplicate alternatives.`

  async function callOpenAi(model: string): Promise<{ ok: boolean; content: string; errorText?: string }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      return { ok: false, content: '', errorText: await response.text() }
    }

    const data = await response.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    return { ok: true, content }
  }

  const first = await callOpenAi(configuredModel)
  if (first.ok) {
    const parsed = extractJson(first.content)
    return parsed ?? EMPTY_RESULT
  }

  // If configured model is unavailable, fall back to a known lightweight vision model.
  const isModelNotFound = (first.errorText ?? '').includes('model_not_found') || (first.errorText ?? '').includes('does not exist')
  if (isModelNotFound && configuredModel !== 'gpt-4o-mini') {
    console.warn('[food/suggest] Falling back from unavailable model to gpt-4o-mini')
    const fallback = await callOpenAi('gpt-4o-mini')
    if (fallback.ok) {
      const parsed = extractJson(fallback.content)
      return parsed ?? EMPTY_RESULT
    }
    console.error('[food/suggest] OpenAI fallback error:', fallback.errorText)
    throw new Error('AI request failed')
  }

  console.error('[food/suggest] OpenAI error:', first.errorText)
  throw new Error('AI request failed')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 })
  }

  let imageUrl: string | null = null

  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const image = form.get('image')
      const providedUrl = form.get('imageUrl')

      if (typeof providedUrl === 'string' && providedUrl.trim()) {
        imageUrl = providedUrl.trim()
      } else if (image instanceof File) {
        const bytes = Buffer.from(await image.arrayBuffer())
        const mime = image.type || 'image/jpeg'
        imageUrl = `data:${mime};base64,${bytes.toString('base64')}`
      }
    } else {
      const body = await req.json()
      const providedUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() : ''
      const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
      const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg'

      if (providedUrl) {
        imageUrl = providedUrl
      } else if (imageBase64) {
        imageUrl = `data:${mimeType};base64,${imageBase64}`
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!imageUrl) {
    return NextResponse.json({ error: 'image or imageUrl is required' }, { status: 400 })
  }

  try {
    const suggestion = await requestAiSuggestion(apiKey, imageUrl)
    return NextResponse.json(suggestion)
  } catch (err) {
    console.error('[food/suggest] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
