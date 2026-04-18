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

// Broad cuisine terms the AI must not return as the primary suggestion.
const GENERIC_BLACKLIST = new Set([
  'western food', 'asian food', 'chinese food', 'indian food', 'malay food',
  'chinese cuisine', 'indian cuisine', 'malay cuisine', 'asian cuisine',
  'southeast asian food', 'mixed food', 'food', 'meal', 'rice dish', 'noodle dish',
])

function isGeneric(name: string): boolean {
  return GENERIC_BLACKLIST.has(name.toLowerCase().trim())
}

// Maps the AI JSON (dish_name / top_suggestions / confidence / reasoning_summary)
// to the stable client-facing shape.
function normalizeResult(raw: unknown): FoodSuggestResponse {
  const obj = (raw ?? {}) as Record<string, unknown>

  const confidence =
    typeof obj.confidence === 'number' ? Math.min(1, Math.max(0, obj.confidence)) : null

  // Accept dish_name (new schema) or primaryDish / primarySuggestion (legacy)
  const rawPrimary =
    typeof obj.dish_name === 'string' ? obj.dish_name.trim() :
    typeof obj.primaryDish === 'string' ? obj.primaryDish.trim() :
    typeof obj.primarySuggestion === 'string' ? obj.primarySuggestion.trim() :
    null

  const primarySuggestion =
    rawPrimary && !isGeneric(rawPrimary) && (confidence === null || confidence >= 0.5)
      ? rawPrimary
      : null

  // Accept top_suggestions[].name (new schema) or alternatives / alternativeSuggestions (legacy)
  const topSuggestions: string[] = Array.isArray(obj.top_suggestions)
    ? (obj.top_suggestions as unknown[])
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => (typeof x.name === 'string' ? x.name.trim() : ''))
        .filter((n) => n.length > 0 && !isGeneric(n))
        .slice(0, 5)
    : []

  const legacyAlts: string[] = Array.isArray(obj.alternatives)
    ? (obj.alternatives as unknown[]).filter((x): x is string => typeof x === 'string' && !isGeneric(x)).slice(0, 5)
    : Array.isArray(obj.alternativeSuggestions)
    ? (obj.alternativeSuggestions as unknown[]).filter((x): x is string => typeof x === 'string' && !isGeneric(x)).slice(0, 5)
    : []

  const alternativeSuggestions = topSuggestions.length ? topSuggestions : legacyAlts

  const reasoning =
    typeof obj.reasoning_summary === 'string' ? obj.reasoning_summary.trim() :
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

const SYSTEM_PROMPT = `You are a food recognition expert specializing in Singapore and Southeast Asian dishes.

Your task is to analyze the food image and identify the EXACT dish, not broad cuisine categories.

Rules:
- Identify the specific dish name first.
- Do NOT return generic categories like "Western Food", "Asian Food", "Indian Food", "Malay Food".
- Only return "Drinks" or "Bubble Tea" if the image clearly shows a beverage.
- Consider Singapore hawker food, kopitiam food, zi char dishes, snacks, desserts, dim sum, Malay, Indian, Chinese, Peranakan, and Southeast Asian foods.
- Focus on visible ingredients, sauce color, texture, shape, plating, and serving style.
- If uncertain, give the best guess and include alternatives.
- Prefer dish-level labels over cuisine-level labels.
- Be careful not to confuse dark braised dishes, noodle dishes, rice dishes, dim sum dishes, and desserts.
- Common Singapore dish examples include but are not limited to: Hainanese Chicken Rice, Laksa, Char Kway Teow, Nasi Lemak, Roti Prata, Bak Kut Teh, Satay, Hokkien Mee, Fishball Noodles, Wanton Mee, Carrot Cake, Mee Rebus, Mee Siam, Murtabak, Biryani, Chwee Kueh, Popiah, Chee Cheong Fun, Curry Puff, Tau Huay, Ice Kachang, Cendol, Chicken Feet, Braised Chicken Feet, Dim Sum Chicken Feet.`

const USER_INSTRUCTIONS = `Analyze the food image and return ONLY valid JSON — no markdown, no text outside the JSON object.

Return STRICT JSON in this exact shape:
{
  "dish_name": "string",
  "alternate_names": ["string"],
  "cuisine": "string",
  "confidence": 0,
  "top_suggestions": [
    { "name": "string", "confidence": 0 },
    { "name": "string", "confidence": 0 },
    { "name": "string", "confidence": 0 }
  ],
  "key_visual_clues": ["string"],
  "reasoning_summary": "short string under 20 words"
}

Confidence scoring:
- 0.85–1.00: Very confident (clear visual match)
- 0.60–0.84: Likely but not certain
- < 0.60: Uncertain — be strict, do not overestimate

Do NOT use generic cuisine labels in dish_name or top_suggestions names. Always use specific dish names.`

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
        temperature: 0.0,
        max_tokens: 400,
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
