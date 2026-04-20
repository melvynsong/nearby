// Showcase detail page with loading overlay and normalization
import { notFound } from 'next/navigation'
import { getShowcaseConfigByKey, getAvailableShowcases } from '@/lib/showcase-config'
import { getServerSupabaseClient } from '@/lib/server-supabase'
import { slugToDisplayLabel, normalizeCategoryKey, categoryToSlug } from '@/lib/category-utils'
import ShowcaseDetailItems from './ShowcaseDetailItems'

export default async function ShowcaseDetailPage({ params }: { params: { category: string } }) {
  const slug = params.category
  // Find the matching showcase config by normalized slug
  const db = getServerSupabaseClient()
  const showcases = await getAvailableShowcases(db, 50)
  const config = showcases.find((c) => categoryToSlug(c.title) === slug)
  if (!config) {
    return notFound()
  }
  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <div className="text-4xl font-bold mb-2">{slugToDisplayLabel(slug)}</div>
      <div className="text-neutral-500 mb-4">{config.tagline}</div>
      <ShowcaseDetailItems category={config.categoryIds?.[0] ?? ''} />
    </div>
  )
}
