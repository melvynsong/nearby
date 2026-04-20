// Main logic for showcase landing page: pills, search, cards

import { getAvailableShowcases } from '@/lib/showcase-config'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import ShowcaseLandingClient from './ShowcaseLandingClient'

export default async function ShowcaseLanding() {
  const db = getServerSupabaseClient()
  const showcases = await getAvailableShowcases(db, 50)
  // Map to ShowcaseCardProps for client
  const cards = showcases.map(s => ({
    key: s.key,
    title: s.title,
    editorialDescription: s.editorialDescription,
    categoryUsageCount: s.categoryUsageCount,
    tagline: s.tagline,
    heroGradientFrom: s.heroGradientFrom,
    heroGradientTo: s.heroGradientTo,
    emoji: s.emoji,
  }))
  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
      <h1 className="text-2xl font-bold mb-2">Nearby Food Showcases</h1>
      <p className="text-sm text-neutral-500 mb-2">
        Curated food showcases built from what Singapore's food community actually loves and revisits.
      </p>
      <ShowcaseLandingClient showcases={cards} />
    </div>
  )
}
