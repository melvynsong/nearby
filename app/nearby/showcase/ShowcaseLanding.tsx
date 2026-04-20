// Main logic for showcase landing page: pills, search, cards
import { getAvailableShowcases } from '@/lib/showcase-config'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import { categoryToSlug, slugToDisplayLabel, normalizeCategoryKey } from '@/lib/category-utils'
import { Suspense } from 'react'

export default async function ShowcaseLanding() {
  const db = getServerSupabaseClient()
  const showcases = await getAvailableShowcases(db, 50)
  // Top 15 categories for pills
  const pills = showcases.slice(0, 15)
  // No search or selection state (server component)

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
      <h1 className="text-2xl font-bold mb-2">Nearby Food Showcases</h1>
      <p className="text-sm text-neutral-500 mb-2">
        Curated food showcases built from what Singapore's food community actually loves and revisits.
      </p>
      {/* Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {pills.map((pill) => (
          <span key={pill.key} className="shrink-0 rounded-full px-3 py-1 text-xs font-medium bg-[#edf1f7] text-[#4b5671]">
            {pill.emoji} {pill.title}
          </span>
        ))}
      </div>
      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 mt-4">
        {showcases.map((showcase) => (
          <div key={showcase.key} className="rounded-xl bg-white shadow p-4">
            <div className="text-lg font-semibold mb-1">{showcase.emoji} {showcase.title}</div>
            <div className="text-sm text-neutral-500 mb-2">{showcase.tagline}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
