// Showcase detail page with loading overlay and normalization


import { notFound } from 'next/navigation';
// Force dynamic rendering for diagnosis
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { getShowcaseConfigByKey, getAvailableShowcases } from '@/lib/showcase-config';
import { getServerSupabaseClient } from '@/lib/server-supabase';
import { slugToDisplayLabel, normalizeCategoryKey, categoryToSlug, categoryToDisplayLabel } from '@/lib/category-utils';
import ShowcaseDetailItems from './ShowcaseDetailItems';
// import AppHeader from '@/components/AppHeader';
import Link from 'next/link';
import { Metadata } from 'next';


export async function generateMetadata({ params }: { params: { category: string } }): Promise<Metadata> {
  const rawSlug = params.category;
  const decoded = decodeURIComponent(rawSlug);
  const canonicalSlug = categoryToSlug(decoded);
  // Logging for diagnosis
  console.log('[ShowcaseDetailPage/generateMetadata] rawSlug:', rawSlug, '| decoded:', decoded, '| canonicalSlug:', canonicalSlug);
  const displayTitle = categoryToDisplayLabel(decoded.replace(/-/g, ' '));
  return {
    title: `Nearby - Top ${displayTitle} Places`,
    description: `Discover the best places for ${displayTitle} in Singapore, curated from real group recommendations.`
  };
}

export default async function ShowcaseDetailPage({ params }: { params: { category: string } }) {
  console.log('[ShowcaseDetailPage/page] CATCHALL params:', params);
  const rawParam = params.category;
  const decoded = decodeURIComponent(rawParam);
  const canonicalSlug = categoryToSlug(decoded);
  // Enhanced logging for debugging
  console.log('[ShowcaseDetailPage/page] rawParam:', rawParam);
  console.log('[ShowcaseDetailPage/page] decoded:', decoded);
  console.log('[ShowcaseDetailPage/page] canonicalSlug:', canonicalSlug);

  const db = getServerSupabaseClient();
  const showcases = await getAvailableShowcases(db, 50);
  console.log('[ShowcaseDetailPage/page] showcase count:', showcases.length);
  const allSlugs = showcases.map((c) => ({
    title: c.title,
    canonicalSlug: categoryToSlug(c.title),
    key: c.key,
  }));
  console.log('[ShowcaseDetailPage/page] all available slugs:', allSlugs);
  // Find config by canonical slug
  const config = showcases.find((c) => categoryToSlug(c.title) === canonicalSlug);
  if (!config) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] pb-24">
        {/* Header is now only rendered globally. */}
        <div className="nearby-shell mx-auto w-full max-w-3xl px-4 pt-6 flex flex-col items-center justify-center min-h-[60vh]">
          <nav className="mb-3 flex items-center text-xs text-neutral-400 font-medium gap-1 whitespace-nowrap overflow-x-auto" aria-label="Breadcrumb">
            <Link href="/nearby" className="hover:underline text-neutral-500 font-semibold">Home</Link>
            <span className="mx-1 text-neutral-300">/</span>
            <Link href="/nearby/showcase" className="hover:underline text-neutral-500 font-semibold">Showcases</Link>
            <span className="mx-1 text-neutral-300">/</span>
            <span className="text-neutral-400 font-semibold">{categoryToDisplayLabel(decoded.replace(/-/g, ' '))}</span>
          </nav>
          <div className="text-2xl font-bold text-neutral-500 mb-2">No showcase found for this category.</div>
          <div className="text-base text-neutral-400 mb-4">Try another category or go back to the showcases list.</div>
          <Link href="/nearby/showcase" className="inline-flex items-center gap-2 rounded-full bg-yellow-400 text-yellow-900 font-semibold px-5 py-2 shadow hover:bg-yellow-300 transition">← Back to Showcases</Link>
        </div>
      </main>
    );
  }

  // Premium header section (unified with main showcase page)
  // Use config.title for display text
  const displayTitle = config.title;
  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-24">
      {/* Header is now only rendered globally. */}
      <div className="nearby-shell mx-auto w-full max-w-3xl px-4 pt-6">
        {/* Breadcrumb */}
        <nav className="mb-3 flex items-center text-xs text-neutral-400 font-medium gap-1 whitespace-nowrap overflow-x-auto" aria-label="Breadcrumb">
          <Link href="/nearby" className="hover:underline text-neutral-500 font-semibold">Home</Link>
          <span className="mx-1 text-neutral-300">/</span>
          <Link href="/nearby/showcase" className="hover:underline text-neutral-500 font-semibold">Showcases</Link>
          <span className="mx-1 text-neutral-300">/</span>
          <span className="text-neutral-400 font-semibold">{displayTitle}</span>
        </nav>
        {/* Title & Subtitle */}
        <h1 className="text-2xl md:text-3xl font-extrabold text-neutral-900 leading-tight mb-1">Top {displayTitle} Places</h1>
        <div className="text-base text-neutral-600 mb-4 max-w-xl">
          This showcase is curated from real group recommendations and places people actually revisit. Explore the best {displayTitle} in Singapore.
        </div>
        <Link href="/nearby/showcase" className="inline-flex items-center gap-2 rounded-full bg-yellow-400 text-yellow-900 font-semibold px-5 py-2 shadow hover:bg-yellow-300 transition mb-6">← Back to Showcases</Link>
        {/* Content section */}
        <div className="rounded-3xl bg-white/90 shadow-lg p-6 md:p-8 w-full">
          <ShowcaseDetailItems category={config.categoryIds?.[0] ?? ''} />
        </div>
      </div>
    </main>
  );
}
