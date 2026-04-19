import Link from 'next/link'
import ShowcaseOptionCard, { type ShowcaseCardProps } from '@/components/showcase/ShowcaseOptionCard'
import { getAvailableShowcases, type ShowcaseConfig } from '@/lib/showcase-config'
import { withBasePath } from '@/lib/base-path'
import { getServerSupabaseClient } from '@/lib/server-supabase'

export const metadata = {
  title: 'Nearby Food Showcases',
  description: 'Curated Singapore food showcases — top dishes loved by the community.',
}

export default async function DiscoverPage() {
  let showcases: ShowcaseConfig[] = []

  try {
    const db = getServerSupabaseClient()
    showcases = await getAvailableShowcases(db, 5)
  } catch (err) {
    console.error('[Showcase] Failed to build showcase list:', err)
  }

  return (
    <main className="min-h-screen bg-[#0f1f3d] text-white">

      {/* Header */}
      <header className="px-5 pt-10 pb-2">
        <Link
          href={withBasePath('/')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white/40 transition-colors hover:text-white/70"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Nearby
        </Link>
      </header>

      {/* Hero text */}
      <section className="px-5 pb-8 pt-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
            Food Showcases
          </span>
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white">
          Singapore&apos;s<br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(90deg, #fbbf24, #f97316)' }}
          >
            Best Dishes
          </span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55 max-w-xs">
          Curated food showcases built from what Singapore&apos;s food community actually loves and revisits.
        </p>
      </section>

      {/* Showcase cards */}
      <section className="px-5 pb-16 space-y-4">
        {!showcases.length && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-white/70">
            We are preparing showcase categories from recent additions. Please check back soon.
          </div>
        )}

        {showcases.map((config, i) => {
          // Serialize only plain fields — functions cannot cross server→client boundary
          const cardProps: ShowcaseCardProps = {
            key: config.key,
            title: config.title,
            editorialDescription: config.editorialDescription,
            tagline: config.tagline,
            heroGradientFrom: config.heroGradientFrom,
            heroGradientTo: config.heroGradientTo,
            emoji: config.emoji,
          }
          return <ShowcaseOptionCard key={config.key} config={cardProps} index={i} />
        })}
      </section>

      {/* Footer CTA */}
      <section className="border-t border-white/10 px-5 py-8 text-center">
        <p className="text-xs text-white/30">
          Want your favourite spot in the next showcase?
        </p>
        <Link
          href={withBasePath('/')}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-white/50 underline decoration-dotted hover:text-white/80 transition-colors"
        >
          Join Nearby
        </Link>
      </section>
    </main>
  )
}
