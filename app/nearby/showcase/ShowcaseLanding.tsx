"use client"
import { useState, useMemo, useEffect } from "react"
import ShowcaseCardsSection from "@/components/showcase/ShowcaseCardsSection"
import { getAvailableShowcases } from '@/lib/showcase-config'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import { slugToDisplayLabel, normalizeCategoryKey, categoryToSlug } from '@/lib/category-utils'

// Fetch showcases client-side for best hydration
async function fetchShowcases() {
  // Use API route for SSR/SSG compatibility
  const res = await fetch("/api/showcase/list")
  if (!res.ok) return []
  return res.json()
}

export default function ShowcaseLanding() {
  const [cards, setCards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [activePill, setActivePill] = useState<string>("all")

  useEffect(() => {
    fetchShowcases().then((data) => {
      setCards(data)
      setLoading(false)
    })
  }, [])

  // Pills: top 15 categories by usage
  const pills = useMemo(() => {
    return [
      { key: "all", label: "Food Showcases" },
      ...cards.slice(0, 15).map((s) => ({
        key: s.key,
        label: s.title,
      })),
    ]
  }, [cards])

  // Filtered list
  const filtered = useMemo(() => {
    let list = cards
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
  }, [cards, search, activePill])

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
      <div className="mb-2">
        <span className="inline-block rounded-full bg-yellow-100 text-yellow-700 px-3 py-1 text-xs font-semibold mr-2">FOOD SHOWCASES</span>
      </div>
      <h1 className="text-3xl md:text-4xl font-extrabold mb-2 text-yellow-400">Singapore's Best Dishes</h1>
      <p className="text-sm md:text-base text-neutral-400 mb-2">
        Curated food showcases built from what Singapore's food community actually loves and revisits.
      </p>
      {/* Search */}
      <input
        type="text"
        className="w-full rounded-full border border-neutral-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
        placeholder="Search food showcases..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {/* Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {pills.map((pill) => (
          <button
            key={pill.key}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${activePill === pill.key ? "bg-yellow-400 text-white shadow" : "bg-[#edf1f7] text-[#4b5671] hover:bg-yellow-100"}`}
            onClick={() => setActivePill(pill.key)}
          >
            {pill.label}
          </button>
        ))}
      </div>
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-neutral-100 h-32 animate-pulse" />
          ))
        ) : (
          <ShowcaseCardsSection cards={filtered.slice(0, 15)} scoreMode="blended" />
        )}
      </div>
      {!loading && filtered.length === 0 && (
        <div className="text-center text-neutral-400 py-12">No showcases found.</div>
      )}
    </div>
  )
}
