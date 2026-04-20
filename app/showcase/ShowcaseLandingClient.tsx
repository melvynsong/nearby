"use client"

import { useState, useMemo } from 'react'
import ShowcaseCardsSection from '@/components/showcase/ShowcaseCardsSection'
import { type ShowcaseCardProps } from '@/components/showcase/ShowcaseOptionCard'
import { slugToDisplayLabel, normalizeCategoryKey, categoryToSlug } from '@/lib/category-utils'

interface Props {
  showcases: ShowcaseCardProps[]
  scoreMode: 'places' | 'recommendations' | 'blended'
}

export default function ShowcaseLandingClient({ showcases, scoreMode }: Props) {
  const [search, setSearch] = useState("")
  const [activePill, setActivePill] = useState<string>("all")

  // Pills: top 15 categories by usage
  const pills = useMemo(() => {
    return [
      { key: "all", label: "Food Showcases" },
      ...showcases.slice(0, 15).map((s) => ({
        key: s.key,
        label: s.title,
      })),
    ]
  }, [showcases])

  // Filtered list
  const filtered = useMemo(() => {
    let list = showcases
    if (activePill !== "all") {
      list = list.filter((s) => normalizeCategoryKey(s.key) === normalizeCategoryKey(activePill))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((s) =>
        s.title.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        categoryToSlug(s.title).includes(q)
      )
    }
    return list
  }, [showcases, search, activePill])

  return (
    <>
      {/* Search */}
      <section className="px-5 pb-2">
        <input
          type="text"
          className="w-full rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-300"
          placeholder="Search food showcases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {/* Pills */}
      <section className="px-5 pb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {pills.map((pill) => (
            <button
              key={pill.key}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${activePill === pill.key ? "bg-yellow-400 text-white shadow" : "bg-white/10 text-white/80 hover:bg-yellow-100 hover:text-yellow-700"}`}
              onClick={() => setActivePill(pill.key)}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </section>

      {/* Showcase cards */}
      <section className="px-5 pb-16 space-y-4">
        {!filtered.length && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-white/70">
            No showcases found. Try a different search or pill.
          </div>
        )}

        <ShowcaseCardsSection
          scoreMode={scoreMode}
          cards={filtered}
        />
      </section>
    </>
  )
}
