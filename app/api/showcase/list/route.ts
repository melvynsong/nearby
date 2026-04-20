import { NextResponse } from 'next/server'
import { getAvailableShowcases } from '@/lib/showcase-config'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export async function GET() {
  const db = getServerSupabaseClient()
  const showcases = await getAvailableShowcases(db, 50)
  // Map to card props for client
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
  return NextResponse.json(cards)
}
