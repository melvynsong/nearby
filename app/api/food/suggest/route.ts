import { NextRequest, NextResponse } from 'next/server'
import type { FoodSuggestResponse, DishSuggestion, DishAnalysisAiResult } from '@/lib/dish-analysis-types'
import { canonicalizeDishName } from '@/lib/dish-utils'
import {
  getPlaceDishStats,
  getSimilarDishMemories,
  saveDishAnalysisEvent,
} from '@/lib/dish-memory'

// ── Generic label blocklist ───────────────────────────────────────────────────

const GENERIC_BLACKLIST = new Set([
  'western food', 'asian food', 'chinese food', 'indian food', 'malay food',
  'chinese cuisine', 'indian cuisine', 'malay cuisine', 'asian cuisine',
  'southeast asian food', 'mixed food', 'food', 'meal', 'rice dish', 'noodle dish',
  'noodles', 'rice', 'bread', 'snack',
])

function isGeneric(name: string): boolean {
  return GENERIC_BLACKLIST.has(name.toLowerCase().trim())
}

const EMPTY_RESPONSE: FoodSuggestResponse = {
  primarySuggestion: null,
  alternativeSuggestions: [],
  topSuggestions: [],
  detectedTextHints: [],
  containsMultipleFoods: false,
  reasoningShort: 'Not enough visual detail to identify the dish with confidence.',
  confidence: null,
  analysisEventId: null,
}

// ── AI prompt construction ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a highly accurate food recognition assistant specialized in Singapore hawker food, Asian dishes, and commonly photographed local meals.

Your task is to identify the most likely actual dish name — not a generic cuisine category.

Use these signals:
1. The uploaded food image (primary signal)
2. Place-level frequent dish data (ranking support)
3. Similar confirmed dish memories (ranking support)
4. Known visual characteristics of local dishes

Reason carefully between visually similar dishes:
- Bak Chor Mee vs Fishball Noodles vs Mee Pok
- Char Kway Teow vs Hokkien Mee
- Curry Puff vs Sardine Puff
- Chicken Briyani vs Mutton Briyani
- Black Carrot Cake vs White Carrot Cake
- Dry Ban Mian vs Soup Ban Mian
- Dry Prawn Mee vs Soup Prawn Mee

NEVER output generic labels: "Chinese Food", "Western Food", "Indian Food", "Noodles", "Rice Dish", "Asian Food".

Preferred specific dish names include: Bak Chor Mee, Wanton Mee, Fishball Noodles, Char Kway Teow, Chicken Rice, Ban Mian, Prawn Mee, Roti Prata, Nasi Lemak, Briyani, Laksa, Hokkien Mee, Satay, Carrot Cake, Mee Rebus, Mee Siam, Bak Kut Teh, Char Siew Rice, Nasi Goreng, Duck Rice, Economy Rice, and others.

When confidence is uncertain, return multiple ranked options with explanation.

Return ONLY valid JSON — no markdown, no text outside the JSON object.`

function buildUserPrompt(params: {
  placeName: string | null
  placeId: string | null
  frequentDishes: string
  recentSignals: string
  dishMemories: string
}): string {
  return `Analyze this uploaded food image and identify the most likely actual dish.

Context:
- Place name: ${params.placeName ?? 'Unknown'}
- Place id: ${params.placeId ?? 'Unknown'}
- Frequent dishes at this place: ${params.frequentDishes || 'No data yet'}
- Recent interaction signals at this place: ${params.recentSignals || 'No data yet'}
- Similar confirmed dish memories: ${params.dishMemories || 'No memories yet'}
- Country / region: Singapore
- Goal: identify the actual dish name with high accuracy

Instructions:
- Use the image as the main signal (50% weight)
- Use place-level frequent dishes as ranking support (20% weight)
- Use similar confirmed dish memories as ranking support (20% weight)
- Compare against visually similar dishes before deciding
- Return top 3 to 5 ranked dish options
- Include key visual cues that influenced the ranking
- Prefer specific local dish names over generic labels
- Output JSON only

Return STRICT JSON in this shape:
{
  "dish_name": "Bak Chor Mee",
  "alternate_names": ["Minced Meat Noodles", "Mee Pok Tah"],
  "cuisine": "Singapore Hawker",
  "confidence": 88,
  "top_suggestions": [
    {
      "name": "Bak Chor Mee",
      "confidence": 88,
      "why": ["thin noodles with minced meat", "dark sauce dry-tossed style"],
      "signals": { "image_score": 82, "place_score": 91, "visual_memory_score": 89 }
    },
    {
      "name": "Fishball Noodles",
      "confidence": 64,
      "why": ["similar noodle base"],
      "signals": { "image_score": 60, "place_score": 70, "visual_memory_score": 55 }
    }
  ],
  "key_visual_clues": ["thin noodle texture", "minced meat topping", "dark sauce"],
  "reasoning_summary": "Short summary under 25 words."
}

Confidence scoring: 85-100 very confident, 60-84 likely, below 60 uncertain.`
}

// ── Result normalisation ──────────────────────────────────────────────────────

function normalizeTopSuggestions(raw: unknown): DishSuggestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({
      name: typeof x.name === 'string' ? x.name.trim() : '',
      confidence: typeof x.confidence === 'number' ? Math.min(100, Math.max(0, x.confidence)) : 0,
      why: Array.isArray(x.why) ? (x.why as unknown[]).filter((w): w is string => typeof w === 'string') : [],
      signals: {
        image_score: typeof (x.signals as Record<string, unknown>)?.image_score === 'number'
          ? (x.signals as Record<string, unknown>).image_score as number : 0,
        place_score: typeof (x.signals as Record<string, unknown>)?.place_score === 'number'
          ? (x.signals as Record<string, unknown>).place_score as number : 0,
        visual_memory_score: typeof (x.signals as Record<string, unknown>)?.visual_memory_score === 'number'
          ? (x.signals as Record<string, unknown>).visual_memory_score as number : 0,
      },
    }))
    .filter((s) => s.name.length > 0 && !isGeneric(s.name))
    .slice(0, 5)
}

function normalizeResult(raw: unknown): Omit<FoodSuggestResponse, 'analysisEventId'> {
  const obj = (raw ?? {}) as Record<string, unknown>

  // Confidence: AI returns 0-100 integer; normalise to 0-1 if > 1
  let confidence = typeof obj.confidence === 'number' ? obj.confidence : null
  if (confidence !== null && confidence > 1) confidence = confidence / 100
  if (confidence !== null) confidence = Math.min(1, Math.max(0, confidence))

  const rawPrimary =
    typeof obj.dish_name === 'string' ? obj.dish_name.trim() :
    typeof obj.primaryDish === 'string' ? obj.primaryDish.trim() :
    typeof obj.primarySuggestion === 'string' ? obj.primarySuggestion.trim() :
    null

  const primarySuggestion =
    rawPrimary && !isGeneric(rawPrimary) && (confidence === null || confidence >= 0.5)
      ? rawPrimary
      : null

  const topSuggestions = normalizeTopSuggestions(obj.top_suggestions)

  // Build alternativeSuggestions from top_suggestions names for backward compat
  const alternativeSuggestions = topSuggestions.length
    ? topSuggestions.map((s) => s.name).filter((n) => n !== primarySuggestion)
    : (Array.isArray(obj.alternatives)
        ? (obj.alternatives as unknown[]).filter((x): x is string => typeof x === 'string' && !isGeneric(x)).slice(0, 5)
        : Array.isArray(obj.alternativeSuggestions)
        ? (obj.alternativeSuggestions as unknown[]).filter((x): x is string => typeof x === 'string' && !isGeneric(x)).slice(0, 5)
        : [])

  const reasoning =
    typeof obj.reasoning_summary === 'string' ? obj.reasoning_summary.trim() :
    typeof obj.reasoning === 'string' ? obj.reasoning.trim() :
    typeof obj.reasoningShort === 'string' ? obj.reasoningShort.trim() :
    EMPTY_RESPONSE.reasoningShort

  return {
    primarySuggestion,
    alternativeSuggestions,
    topSuggestions,
    detectedTextHints: [],
    containsMultipleFoods: false,
    reasoningShort: reasoning,
    confidence,
  }
}

function extractJson(content: string): Omit<FoodSuggestResponse, 'analysisEventId'> | null {
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

// ── OpenAI call ───────────────────────────────────────────────────────────────

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
      temperature: 0.0,
      max_tokens: 600,
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

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'We could not analyse this right now. Try again shortly.' }, { status: 500 })
  }

  let imageUrl: string | null = null
  let placeId: string | null = null
  let placeName: string | null = null
  let userId: string | null = null

  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const image = form.get('image')
      const providedUrl = form.get('imageUrl')
      placeId = (form.get('placeId') as string | null) ?? null
      placeName = (form.get('placeName') as string | null) ?? null
      userId = (form.get('userId') as string | null) ?? null

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
      placeId = typeof body?.placeId === 'string' ? body.placeId : null
      placeName = typeof body?.placeName === 'string' ? body.placeName : null
      userId = typeof body?.userId === 'string' ? body.userId : null

      if (providedUrl) {
        imageUrl = providedUrl
      } else if (imageBase64) {
        imageUrl = `data:${mimeType};base64,${imageBase64}`
      }
    }
  } catch {
    return NextResponse.json({ error: 'We could not analyse this right now. Please try again.' }, { status: 400 })
  }

  if (!imageUrl) {
    return NextResponse.json({ error: 'Please provide a photo and try again.' }, { status: 400 })
  }

  // ── Gather context (non-blocking: failures degrade gracefully) ────────────
  const [placeStats, dishMemories] = await Promise.all([
    placeId ? getPlaceDishStats(placeId) : Promise.resolve([]),
    // Use broad SG dish hints as seed for memory query when no place yet
    getSimilarDishMemories(
      ['Bak Chor Mee', 'Chicken Rice', 'Char Kway Teow', 'Fishball Noodles', 'Laksa'],
      placeId,
      6,
    ),
  ])

  // Format place dish stats for prompt injection
  const frequentDishes = placeStats.length
    ? placeStats
        .slice(0, 8)
        .map((s) => `${s.canonical_dish_name} (confirmed ${s.confirm_count}x, added ${s.add_count}x)`)
        .join(', ')
    : ''

  const recentSignals = placeStats.length
    ? placeStats
        .slice(0, 5)
        .filter((s) => s.last_seen_at)
        .map((s) => s.canonical_dish_name)
        .join(', ')
    : ''

  // Format dish memory context for prompt injection
  const dishMemoryText = dishMemories.length
    ? dishMemories
        .map((m) => {
          const chars = m.visual_characteristics && typeof m.visual_characteristics === 'object'
            ? Object.values(m.visual_characteristics).join(', ')
            : ''
          return `${m.canonical_dish_name}: confirmed ${m.confirmed_count}x${chars ? ` — visual cues: ${chars}` : ''}`
        })
        .join(' | ')
    : ''

  const userPrompt = buildUserPrompt({
    placeName,
    placeId,
    frequentDishes,
    recentSignals,
    dishMemories: dishMemoryText,
  })

  console.log('[DishAnalysis] Starting analysis', {
    placeId,
    placeName,
    placeStatsCount: placeStats.length,
    dishMemoriesCount: dishMemories.length,
  })

  // ── OpenAI call with fallback ─────────────────────────────────────────────
  const configuredModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  let aiRaw: Record<string, unknown> = {}
  let parsed: Omit<FoodSuggestResponse, 'analysisEventId'> | null = null

  try {
    const first = await callOpenAi(apiKey, configuredModel, imageUrl, userPrompt)

    if (first.ok) {
      parsed = extractJson(first.content)
      try { aiRaw = JSON.parse(first.content) } catch { aiRaw = { raw: first.content } }
    } else {
      const isModelNotFound = (first.errorText ?? '').includes('model_not_found') ||
        (first.errorText ?? '').includes('does not exist')

      if (isModelNotFound && configuredModel !== 'gpt-4o-mini') {
        console.warn('[DishAnalysis] Falling back to gpt-4o-mini')
        const fallback = await callOpenAi(apiKey, 'gpt-4o-mini', imageUrl, userPrompt)
        if (fallback.ok) {
          parsed = extractJson(fallback.content)
          try { aiRaw = JSON.parse(fallback.content) } catch { aiRaw = { raw: fallback.content } }
        } else {
          console.error('[DishAnalysis] Fallback error:', fallback.errorText)
          throw new Error('AI request failed')
        }
      } else {
        console.error('[DishAnalysis] OpenAI error:', first.errorText)
        throw new Error('AI request failed')
      }
    }
  } catch (err) {
    console.error('[DishAnalysis] Unexpected AI error:', err)
    return NextResponse.json(
      { error: 'We could not analyse this right now. Try again or adjust your input.' },
      { status: 500 },
    )
  }

  const result = parsed ?? { ...EMPTY_RESPONSE }

  // ── Persist analysis event (non-blocking) ─────────────────────────────────
  const suggestedNames = [
    ...(result.primarySuggestion ? [result.primarySuggestion] : []),
    ...result.alternativeSuggestions,
  ].map(canonicalizeDishName)

  const analysisEventId = await saveDishAnalysisEvent({
    userId,
    placeId,
    aiRawResult: aiRaw,
    suggestedDishes: suggestedNames,
  })

  console.log('[DishAnalysis] Complete', {
    primary: result.primarySuggestion,
    confidence: result.confidence,
    topCount: result.topSuggestions.length,
    analysisEventId,
  })

  return NextResponse.json({ ...result, analysisEventId } satisfies FoodSuggestResponse)
}
