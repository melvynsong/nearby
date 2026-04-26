import { NextRequest, NextResponse } from 'next/server'

export type BeAChefClue = {
  label: string
  /** Normalized 0-1 coordinates within the photo. null if AI did not locate it. */
  x: number | null
  y: number | null
}

export type BeAChefAnalysis = {
  dish_name: string
  confidence: number
  key_visual_clues: BeAChefClue[]
  reasoning_summary: string
  ingredients: string[]
  steps: string[]
  local_tips?: string[]
}

const FALLBACK: BeAChefAnalysis = {
  dish_name: 'Home-style dish',
  confidence: 55,
  key_visual_clues: [
    { label: 'Main ingredient', x: null, y: null },
    { label: 'Sauce / broth', x: null, y: null },
    { label: 'Garnish', x: null, y: null },
    { label: 'Plating style', x: null, y: null },
  ],
  reasoning_summary:
    'Not enough visual detail for a confident identification, so this is a generic home-style guide.',
  ingredients: [
    '300g main protein or vegetable of choice',
    '2 cloves garlic, minced',
    '1 tbsp light soy sauce',
    '1 tsp sesame oil',
    'Salt and pepper to taste',
    'Spring onion for garnish',
  ],
  steps: [
    'Prep: wash and slice the main ingredient into bite-size pieces.',
    'Heat 1 tbsp oil in a wok over medium-high heat. Add garlic and cook 20 seconds.',
    'Add the main ingredient and stir-fry until just cooked.',
    'Season with light soy sauce, salt and pepper. Drizzle sesame oil.',
    'Plate, top with spring onion, and serve hot.',
  ],
  local_tips: [
    'Adjust seasoning to your taste — start light and add more.',
  ],
}

const SYSTEM_PROMPT = `You are a Singapore home-cooking chef and food recognition expert.
You look at a single dish photo and produce:
1) Your best guess at the actual dish name (specific, not a generic cuisine label).
2) The visual clues you used to identify it.
3) A short, friendly home-style recipe a beginner could attempt at home.

Always reply with strict JSON only — no markdown fences, no commentary outside the JSON object.`

function buildUserPrompt(placeName?: string | null, dishHint?: string | null) {
  return `Identify the dish in this image and produce a beginner-friendly home recipe.

Context:
- Country / region: Singapore
- Place name (optional): ${placeName ?? 'Unknown'}
- Dish name hint from listing (optional): ${dishHint ?? 'None'}

Rules:
- Prefer specific, well-known dish names (e.g., "Bak Chor Mee", "Chicken Rice", "Char Kway Teow", "Laksa", "Mee Rebus", "Hokkien Mee", "Roti Prata", "Nasi Lemak").
- Never reply with generic labels like "Asian Food" or "Noodles".
- key_visual_clues: EXACTLY 4 short visual cues (max 4 words each) describing what you saw. For each clue, ALSO point to where in the image it is using normalized coordinates: x in [0,1] left→right, y in [0,1] top→bottom. The coordinate must be the centre of the actual visible item (e.g. for "Prawn", x/y are on the prawn itself; for "Broth", x/y are on visible broth liquid). If you genuinely cannot locate the clue in the photo, return x=null and y=null for that clue.
- reasoning_summary: under 25 words, friendly and confident.
- ingredients: 6 to 10 items written like a home recipe (with quantities).
- steps: 4 to 7 numbered-style instructions (each one short sentence, no leading numbers).
- local_tips: 1 to 3 short tips a Singaporean home cook would share.
- confidence: integer 0-100.

Return STRICT JSON in this shape:
{
  "dish_name": "Bak Chor Mee",
  "confidence": 86,
  "key_visual_clues": [
    { "label": "Mee pok noodles", "x": 0.45, "y": 0.55 },
    { "label": "Minced pork", "x": 0.62, "y": 0.42 },
    { "label": "Dark vinegar sauce", "x": 0.30, "y": 0.65 },
    { "label": "Crispy ti poh", "x": 0.70, "y": 0.30 }
  ],
  "reasoning_summary": "Thin yellow noodles dressed in dark vinegar sauce with minced meat are classic Bak Chor Mee.",
  "ingredients": ["200g mee pok noodles", "150g minced pork", "1 tbsp black vinegar", "..."],
  "steps": ["Cook noodles per packet, drain, toss with sauce.", "..."],
  "local_tips": ["Add more vinegar at the end for that hawker tang."]
}`
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value <= 1) return Math.round(value * 100)
  return Math.max(0, Math.min(100, Math.round(value)))
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(0, max)
}

function clampCoord(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  // Some models occasionally return 0-100 instead of 0-1; auto-correct.
  let v = value
  if (v > 1) v = v / 100
  if (v < 0 || v > 1) return null
  return v
}

function normalizeClues(value: unknown, max: number): BeAChefClue[] {
  if (!Array.isArray(value)) return []
  const out: BeAChefClue[] = []
  for (const item of value) {
    if (out.length >= max) break
    if (typeof item === 'string') {
      const label = item.trim()
      if (label) out.push({ label, x: null, y: null })
      continue
    }
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>
      const label = typeof obj.label === 'string' ? obj.label.trim() : ''
      if (!label) continue
      out.push({
        label,
        x: clampCoord(obj.x),
        y: clampCoord(obj.y),
      })
    }
  }
  return out
}

function normalize(raw: unknown): BeAChefAnalysis {
  const obj = (raw ?? {}) as Record<string, unknown>
  const dishName =
    typeof obj.dish_name === 'string' && obj.dish_name.trim()
      ? obj.dish_name.trim()
      : FALLBACK.dish_name

  const clues = normalizeClues(obj.key_visual_clues, 4)

  return {
    dish_name: dishName,
    confidence: clampConfidence(obj.confidence) || FALLBACK.confidence,
    key_visual_clues: clues.length > 0 ? clues : FALLBACK.key_visual_clues,
    reasoning_summary:
      typeof obj.reasoning_summary === 'string' && obj.reasoning_summary.trim()
        ? obj.reasoning_summary.trim()
        : FALLBACK.reasoning_summary,
    ingredients:
      asStringArray(obj.ingredients, 12).length > 0
        ? asStringArray(obj.ingredients, 12)
        : FALLBACK.ingredients,
    steps:
      asStringArray(obj.steps, 10).length > 0
        ? asStringArray(obj.steps, 10)
        : FALLBACK.steps,
    local_tips: asStringArray(obj.local_tips, 4),
  }
}

function tryParseJson(content: string): unknown | null {
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function callOpenAi(
  apiKey: string,
  model: string,
  imageUrl: string,
  userPrompt: string,
): Promise<{ ok: boolean; content: string; errorText?: string }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
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

export async function POST(req: NextRequest) {
  let photoUrl: string | null = null
  let placeName: string | null = null
  let dishHint: string | null = null

  try {
    const body = await req.json()
    photoUrl = typeof body?.photoUrl === 'string' ? body.photoUrl.trim() : null
    placeName = typeof body?.placeName === 'string' ? body.placeName : null
    dishHint = typeof body?.dishHint === 'string' ? body.dishHint : null
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 },
    )
  }

  if (!photoUrl) {
    return NextResponse.json(
      { error: 'A photo URL is required.' },
      { status: 400 },
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[BeAChef] OPENAI_API_KEY missing — returning fallback recipe.')
    return NextResponse.json(FALLBACK satisfies BeAChefAnalysis)
  }

  const configuredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const userPrompt = buildUserPrompt(placeName, dishHint)

  console.log('[BeAChef] Analysis started', {
    placeName,
    dishHint,
    photoUrl: photoUrl.slice(0, 80),
  })

  let parsed: BeAChefAnalysis | null = null

  try {
    const first = await callOpenAi(apiKey, configuredModel, photoUrl, userPrompt)
    if (first.ok) {
      const json = tryParseJson(first.content)
      if (json) parsed = normalize(json)
    } else {
      const isModelNotFound =
        (first.errorText ?? '').includes('model_not_found') ||
        (first.errorText ?? '').includes('does not exist')
      if (isModelNotFound && configuredModel !== 'gpt-4o-mini') {
        const fallback = await callOpenAi(apiKey, 'gpt-4o-mini', photoUrl, userPrompt)
        if (fallback.ok) {
          const json = tryParseJson(fallback.content)
          if (json) parsed = normalize(json)
        } else {
          console.error('[BeAChef] Fallback model error:', fallback.errorText)
        }
      } else {
        console.error('[BeAChef] OpenAI error:', first.errorText)
      }
    }
  } catch (err) {
    console.error('[BeAChef] Unexpected error:', err)
  }

  const result = parsed ?? FALLBACK
  const locatedClues = result.key_visual_clues.filter((c) => c.x !== null && c.y !== null).length
  console.log('[BeAChef] Analysis complete', {
    dish: result.dish_name,
    confidence: result.confidence,
    clueCount: result.key_visual_clues.length,
    locatedClues,
    stepCount: result.steps.length,
  })

  return NextResponse.json(result)
}
