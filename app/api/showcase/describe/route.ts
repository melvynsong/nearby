import { NextRequest, NextResponse } from 'next/server'

// Generates AI descriptions for showcase items.
// Called client-side after initial page render so the main data loads fast.
// Returns a map of placeId -> description string.

type DescribeItem = {
  placeId: string
  placeName: string
  dishName: string
  googleRating: number | null
}

const SYSTEM_PROMPT = `You are a food writer for a premium Singapore food guide.
Write short, sensory, appetizing descriptions of specific dishes at specific hawker stalls or restaurants.
Focus on: texture, aroma, broth depth, sauce balance, key ingredients, and what makes this place stand out.
Be honest — do not fabricate unknown facts. Do not use generic praise words.
Each description must be 1-3 sentences only. Never use the word "delicious" or "amazing".`

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, descriptions: {} }, { status: 500 })
  }

  try {
    const body = await req.json()
    const items: DescribeItem[] = Array.isArray(body?.items)
      ? (body.items as unknown[]).filter((x): x is DescribeItem =>
          typeof x === 'object' && x !== null &&
          typeof (x as DescribeItem).placeId === 'string',
        ).slice(0, 12)
      : []

    if (!items.length) {
      return NextResponse.json({ ok: true, descriptions: {} })
    }

    const prompt = items
      .map((item, i) =>
        `${i + 1}. Place: "${item.placeName}", Dish: "${item.dishName}"${item.googleRating ? `, Google rating: ${item.googleRating}` : ''}`,
      )
      .join('\n')

    const userMessage = `Write a short 1-3 sentence food description for each of the following Singapore dishes.
Return ONLY valid JSON: { "descriptions": { "1": "...", "2": "...", ... } }
Use the number keys matching the list order below.

${prompt}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 800,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      console.error('[ShowcaseDescribe] OpenAI error:', response.status)
      return NextResponse.json({ ok: true, descriptions: {} })
    }

    const data = await response.json()
    const content: string = data.choices?.[0]?.message?.content ?? '{}'

    let parsed: Record<string, string> = {}
    try {
      const raw = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      parsed = raw.descriptions ?? raw
    } catch {
      // Non-fatal — return empty descriptions
    }

    // Map from numeric key back to placeId
    const descriptions: Record<string, string> = {}
    items.forEach((item, i) => {
      const desc = parsed[String(i + 1)]
      if (typeof desc === 'string' && desc.trim()) {
        descriptions[item.placeId] = desc.trim()
      }
    })

    return NextResponse.json({ ok: true, descriptions })
  } catch (err) {
    console.error('[ShowcaseDescribe] Unexpected error:', err)
    return NextResponse.json({ ok: true, descriptions: {} })
  }
}
