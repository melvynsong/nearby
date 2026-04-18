import { NextRequest, NextResponse } from 'next/server'

type FoodSuggestResponse = {
  primarySuggestion: string | null
  alternativeSuggestions: string[]
  detectedTextHints: string[]
  containsMultipleFoods: boolean
  reasoningShort: string
  confidence: number | null
}

const EMPTY_RESULT: FoodSuggestResponse = {
  primarySuggestion: null,
  alternativeSuggestions: [],
  detectedTextHints: [],
  containsMultipleFoods: false,
  reasoningShort: 'Not enough visual detail to identify a food with confidence.',
  confidence: null,
}

// Handles both old schema fields and the new Singapore-optimised schema from the AI.
function normalizeResult(raw: unknown): FoodSuggestResponse {
  const obj = (raw ?? {}) as Record<string, unknown>

  // New schema: primaryDish / alternatives / confidence / reasoning
  // Old schema: primarySuggestion / alternativeSuggestions / reasoningShort
  const primaryDish =
    typeof obj.primaryDish === 'string' ? obj.primaryDish.trim() : null
  const primarySuggestionLegacy =
    typeof obj.primarySuggestion === 'string' ? obj.primarySuggestion.trim() : null

  const confidence =
    typeof obj.confidence === 'number' ? Math.min(1, Math.max(0, obj.confidence)) : null

  // If confidence is present and below threshold, treat primary as uncertain
  const primary = primaryDish || primarySuggestionLegacy
  const primarySuggestion =
    primary && (confidence === null || confidence >= 0.6) ? primary : null

  const alternativesNew = Array.isArray(obj.alternatives)
    ? (obj.alternatives as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 5)
    : []
  const alternativesLegacy = Array.isArray(obj.alternativeSuggestions)
    ? (obj.alternativeSuggestions as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 5)
    : []
  const alternativeSuggestions = alternativesNew.length ? alternativesNew : alternativesLegacy

  const reasoning =
    typeof obj.reasoning === 'string' ? obj.reasoning.trim() :
    typeof obj.reasoningShort === 'string' ? obj.reasoningShort.trim() :
    EMPTY_RESULT.reasoningShort

  return {
    primarySuggestion,
    alternativeSuggestions,
    detectedTextHints: [],
    containsMultipleFoods: false,
    reasoningShort: reasoning,
    confidence,
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

const SYSTEM_PROMPT = `You are a highly trained food recognition assistant specialising in real-world dishes, especially in Singapore and Southeast Asia hawker and restaurant contexts.

Your job is to identify the exact dish shown in an image as accurately as possible.

You MUST prioritise:
- Specific dish names (e.g. "Hainanese Chicken Rice", NOT "Chinese food")
- Common real-world naming used by people in Singapore
- Visual evidence from the image only (do not hallucinate)`

const USER_INSTRUCTIONS = `Analyze the food image and return ONLY valid JSON — no markdown, no explanation outside JSON.

Instructions:
1. Identify the PRIMARY DISH (use specific dish names only).
2. If multiple items exist, choose the MAIN dish (largest or central item).
3. Assign a confidence score between 0 and 1:
   - 0.85–1.00: Very confident (clear visual match)
   - 0.60–0.84: Likely but not certain
   - < 0.60: Uncertain — be strict, do not overestimate
4. If uncertain, provide 2–3 closely related alternatives.
5. Prefer Singapore/local dish names (e.g. "Chicken Rice" over "Poached Chicken with Rice").

Good dish name examples: Hainanese Chicken Rice, Nasi Lemak, Char Kway Teow, Laksa, Roti Prata, Biryani, Fishball Noodles, Wanton Mee, Satay, Bak Kut Teh, Ramen, Sushi, Burger, Fish and Chips, Pasta Carbonara.
Bad examples (DO NOT USE): Western Food, Asian Food, Chinese Cuisine, Indian Cuisine, Mixed Food.

If the image is unclear: lower confidence, provide alternatives, do NOT invent a precise dish.

Required output schema (strict JSON):
{
  "primaryDish": "string",
  "confidence": number,
  "alternatives": ["string", "string"],
  "reasoning": "short visual explanation under 20 words"
}`

async function requestAiSuggestion(apiKey: string, imageUrl: string): Promise<FoodSuggestResponse> {
  const configuredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  async function callOpenAi(model: string): Promise<{ ok: boolean; content: string; errorText?: string }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_INSTRUCTIONS },
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
