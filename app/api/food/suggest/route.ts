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
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
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
    const errorText = await response.text()
    console.error('[food/suggest] OpenAI error:', response.status, errorText)
    throw new Error('AI request failed')
  }

  const data = await response.json()
  const content: string = data.choices?.[0]?.message?.content ?? ''
  const parsed = extractJson(content)
  return parsed ?? EMPTY_RESULT
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
