"use client"

import { useState, useMemo } from "react"
import ShowcaseCardsSection from "@/components/showcase/ShowcaseCardsSection"
import { getAvailableShowcases } from '@/lib/showcase-config'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import { slugToDisplayLabel, normalizeCategoryKey, categoryToSlug } from '@/lib/category-utils'

export default function ShowcaseLanding() {
  // NOTE: This is a test: hardcode two cards for now to force client rendering
  const cards = [
    {
      key: "prawn noodles",
      title: "Prawn Noodles",
      editorialDescription: "A beloved staple in Singapore hawker culture.",
      categoryUsageCount: 8,
      tagline: "Top Prawn Noodles places",
      heroGradientFrom: "#1f355d",
      heroGradientTo: "#0f3b58",
      emoji: "🍽️",
    },
    {
      key: "grilled ribeye",
      title: "Grilled Ribeye",
      editorialDescription: "Elevating the local dining scene, grilled ribeye showcases tender, juicy cuts with a smoky char.",
      categoryUsageCount: 2,
      tagline: "Top Grilled Ribeye places",
      heroGradientFrom: "#1f355d",
      heroGradientTo: "#0f3b58",
      emoji: "🍽️",
    },
  ]

  const [search, setSearch] = useState("")
  const [activePill, setActivePill] = useState<string>("all")

  // Pills: top 15 categories by usage
  const pills = useMemo(() => {
    return [
      { key: "all", label: "All" },
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
      <h1 className="text-2xl font-bold mb-2">Nearby Food Showcases TEST</h1>
      <p className="text-sm text-neutral-500 mb-2">
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
        <ShowcaseCardsSection cards={filtered} scoreMode="blended" />
      </div>
      {filtered.length === 0 && (
        <div className="text-center text-neutral-400 py-12">No showcases found.</div>
      )}
    </div>
  )
}
