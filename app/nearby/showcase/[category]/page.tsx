// Showcase detail page with loading overlay and normalization

import { notFound } from 'next/navigation';
import { getShowcaseConfigByKey, getAvailableShowcases } from '@/lib/showcase-config';
import { getServerSupabaseClient } from '@/lib/server-supabase';
import { slugToDisplayLabel, normalizeCategoryKey, categoryToSlug } from '@/lib/category-utils';
import ShowcaseDetailItems from './ShowcaseDetailItems';
import AppHeader from '@/components/AppHeader';
import Link from 'next/link';

export default async function ShowcaseDetailPage({ params }: { params: { category: string } }) {
  const slug = params.category;
  // Find the matching showcase config by normalized slug
  const db = getServerSupabaseClient();
  const showcases = await getAvailableShowcases(db, 50);
  const config = showcases.find((c) => categoryToSlug(c.title) === slug);
  if (!config) {
    return notFound();
  }
  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-24">
      <AppHeader />
      <div className="nearby-shell mx-auto w-full max-w-3xl px-4 pt-6">
        {/* Breadcrumb */}
        <nav className="mb-3 flex items-center text-xs text-neutral-400 font-medium gap-1 whitespace-nowrap overflow-x-auto" aria-label="Breadcrumb">
          <Link href="/nearby" className="hover:underline text-neutral-500 font-semibold">Home</Link>
          <span className="mx-1 text-neutral-300">/</span>
          <Link href="/nearby/showcase" className="hover:underline text-neutral-500 font-semibold">Showcases</Link>
          <span className="mx-1 text-neutral-300">/</span>
          <span className="text-neutral-400 font-semibold">{slugToDisplayLabel(slug)}</span>
        </nav>
        {/* Title & Tagline */}
        <h1 className="text-2xl md:text-3xl font-extrabold text-neutral-900 leading-tight mb-1">{slugToDisplayLabel(slug)}</h1>
        <div className="text-base text-neutral-600 mb-4 max-w-xl">{config.tagline}</div>
        {/* Showcase detail items */}
        <ShowcaseDetailItems category={config.categoryIds?.[0] ?? ''} />
      </div>
    </main>
  );
}
