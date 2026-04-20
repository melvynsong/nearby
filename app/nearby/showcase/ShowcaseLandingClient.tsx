"use client"

import { useState, useMemo } from "react"
import ShowcaseCardsSection from "@/components/showcase/ShowcaseCardsSection"
import { ShowcaseCardProps } from "@/components/showcase/ShowcaseOptionCard"
import { slugToDisplayLabel, normalizeCategoryKey, categoryToSlug } from "@/lib/category-utils"

interface Props {
  showcases: ShowcaseCardProps[]
}

export default function ShowcaseLandingClient({ showcases }: Props) {
  const [search, setSearch] = useState("")
  const [activePill, setActivePill] = useState<string>("all")

  // Pills: top 15 categories by usage
  const pills = useMemo(() => {
    return [
      { key: "all", label: "All" },
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
    <div className="flex flex-col gap-4">
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
