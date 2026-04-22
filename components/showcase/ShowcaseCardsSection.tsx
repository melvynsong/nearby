'use client'

import { useEffect, useState } from 'react'
import ShowcaseOptionCard, { type ShowcaseCardProps } from '@/components/showcase/ShowcaseOptionCard'
import { apiPath } from '@/lib/base-path'

type Props = {
  cards: (ShowcaseCardProps & { onExplore?: () => void })[]
  scoreMode: 'places' | 'recommendations' | 'blended'
}

type DescribeResponse = {
  ok?: boolean
  descriptions?: Record<string, string>
}

export default function ShowcaseCardsSection({ cards, scoreMode }: Props) {
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!cards.length) return

    const controller = new AbortController()

    const loadDescriptions = async () => {
      try {
        const res = await fetch(apiPath('/api/showcase/describe-card'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cards.map((card) => ({
              categoryName: card.title,
              usageCount: card.categoryUsageCount,
              scoreMode,
            })),
          }),
          signal: controller.signal,
        })

        if (!res.ok) return

        const json = await res.json() as DescribeResponse
        if (json.descriptions && typeof json.descriptions === 'object') {
          setDescriptions(json.descriptions)
        }
      } catch {
        // Non-fatal: fallback to static editorialDescription
      }
    }

    void loadDescriptions()

    return () => controller.abort()
  }, [cards, scoreMode])

  return (
    <>
      {cards.map((card, i) => {
        const aiCopy = descriptions[card.title]
        const mergedCard: ShowcaseCardProps & { onExplore?: () => void } = {
          ...card,
          editorialDescription: typeof aiCopy === 'string' && aiCopy.trim()
            ? aiCopy.trim()
            : card.editorialDescription,
        }
        return <ShowcaseOptionCard key={card.key} config={mergedCard} index={i} onExplore={card.onExplore} />
      })}
    </>
  )
}
