import { NextRequest, NextResponse } from 'next/server'

type CardDescribeItem = {
  categoryName: string
  usageCount?: number
  recommendationCount?: number
  scoreMode?: string
}

const SYSTEM_PROMPT = `You are a food marketing copywriter for a Singapore food guide.
Write compelling, short descriptions of food categories for showcase cards.
Focus on: cultural significance, flavor profiles, what makes this category special in Singapore's food scene.
Be vivid and appetizing. 1-2 sentences max. Never use generic words like "delicious" or "amazing".
For each category, weave in why it's been featured (e.g., "community's favorite", "most saved", "trending").`

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, descriptions: {} }, { status: 500 })
  }

  try {
    const body = await req.json()
    const items: CardDescribeItem[] = Array.isArray(body?.items)
      ? (body.items as unknown[])
        .filter((x): x is CardDescribeItem =>
          typeof x === 'object' && x !== null &&
          typeof (x as CardDescribeItem).categoryName === 'string',
        )
        .slice(0, 10)
      : []

    if (!items.length) {
      return NextResponse.json({ ok: true, descriptions: {} })
    }

    const prompt = items
      .map((item, i) => {
        let criteria = ''
        if (item.scoreMode === 'recommendations' && item.recommendationCount) {
          criteria = ` (${item.recommendationCount} saves by the community)`
        } else if (item.scoreMode === 'blended' && item.usageCount && item.recommendationCount) {
          criteria = ` (${item.usageCount} places, ${item.recommendationCount} saves)`
        } else if (item.usageCount) {
          criteria = ` (added to ${item.usageCount} places)`
        }
        return `${i + 1}. "${item.categoryName}"${criteria}`
      })
      .join('\n')

    const userMessage = `Write an interesting, short (1-2 sentence) description for each food category showcase.
The descriptions should explain what makes this category special in Singapore and why it's been featured.
Mention the selection criteria naturally if provided.
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
        max_tokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      console.error('[ShowcaseCardDescribe] OpenAI error:', response.status)
      return NextResponse.json({ ok: true, descriptions: {} })
    }

    const data = await response.json()
    const content: string = data.choices?.[0]?.message?.content ?? '{}'

    let parsed: Record<string, string> = {}
    try {
      const raw = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      parsed = raw.descriptions ?? raw
    } catch {
      // Non-fatal - return empty descriptions
    }

    // Map from numeric key back to category name
    const descriptions: Record<string, string> = {}
    items.forEach((item, i) => {
      const desc = parsed[String(i + 1)]
      if (typeof desc === 'string' && desc.trim()) {
        descriptions[item.categoryName] = desc.trim()
      }
    })

    return NextResponse.json({ ok: true, descriptions })
  } catch (err) {
    console.error('[ShowcaseCardDescribe] Unexpected error:', err)
    return NextResponse.json({ ok: true, descriptions: {} })
  }
}
