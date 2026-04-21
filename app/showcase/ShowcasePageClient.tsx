
// The canonical showcase list route is /nearby/showcase. Avoid duplicating 'nearby' in path construction.
"use client";




import React, { useState, useMemo } from 'react';
import { getCategoryScoreMode, type ShowcaseConfig } from '@/lib/showcase-config';
import { withBasePath } from '@/lib/base-path';
import ShowcaseCardsSection from '@/components/showcase/ShowcaseCardsSection';
import Link from 'next/link';
import { getShowcaseDisplayName, isUuidLike, normalizeShowcaseCategory } from '@/lib/category-utils';
import AppHeader from '@/components/AppHeader';

type ShowcasePageClientProps = {
  showcases: ShowcaseConfig[];
};

export default function ShowcasePageClient({ showcases }: ShowcasePageClientProps) {

  const [search, setSearch] = useState('');
  const [activePill, setActivePill] = useState('all');

  // Pills: all valid categories, deduped, no UUIDs
  const pills = useMemo(() => {
    const seen = new Set<string>();
    const pillList = [
      { key: 'all', label: 'All' },
      ...showcases
        .map((s) => ({ key: s.key, label: getShowcaseDisplayName(s) }))
        .filter((pill) => pill.label && !isUuidLike(pill.key) && !seen.has(normalizeShowcaseCategory(pill.label)) && seen.add(normalizeShowcaseCategory(pill.label))),
    ];
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.debug('[ShowcasePageClient] pills:', pillList.map((p) => p.label));
    }
    return pillList;
  }, [showcases]);

  const scoreMode = getCategoryScoreMode();

  // Find the selected category label for filtering
  const selectedCategory = pills.find((p) => p.key === activePill)?.label;

  const filtered = useMemo(() => {
    const normPill = normalizeShowcaseCategory(selectedCategory || '');
    const normSearch = normalizeShowcaseCategory(search);
    const filteredList = showcases.filter((config) => {
      const configTitle = getShowcaseDisplayName(config);
      const normConfig = normalizeShowcaseCategory(configTitle);
      const matchesCategory =
        activePill === 'all' || normConfig === normPill;
      const matchesSearch =
        !search || normConfig.includes(normSearch);
      return matchesCategory && matchesSearch;
    });
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.debug('[ShowcasePageClient] activePill:', activePill, '| normPill:', normPill, '| search:', search, '| filtered count:', filteredList.length);
    }
    return filteredList;
  }, [showcases, activePill, search, selectedCategory]);

  return (
    <main className="min-h-screen bg-[#f5f6f8] pb-24">
      <AppHeader />
      <div className="nearby-shell mx-auto w-full max-w-3xl px-4 pt-6">
        {/* Breadcrumb */}
        <nav className="mb-3 flex items-center text-xs text-neutral-400 font-medium gap-1 whitespace-nowrap overflow-x-auto" aria-label="Breadcrumb">
          <Link href="/nearby" className="hover:underline text-neutral-500 font-semibold">Home</Link>
          <span className="mx-1 text-neutral-300">/</span>
          <span className="text-neutral-400 font-semibold">Showcases</span>
        </nav>
        {/* Title & Subtitle */}
        <h1 className="text-2xl md:text-3xl font-extrabold text-neutral-900 leading-tight mb-1">Discover Food Showcases</h1>
        <div className="text-base text-neutral-600 mb-4 max-w-xl">
          Browse curated dish collections based on places people actually love, revisit, and recommend.
        </div>
        {/* Search input */}
        <div className="mb-2">
          <input
            type="text"
            placeholder="Search showcases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-yellow-300 shadow-sm mb-2"
            style={{ minHeight: 44 }}
          />
        </div>
        {/* Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mt-2">
          {pills.map((pill) => (
            <button
              key={pill.key}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-150 ${
                activePill === pill.key
                  ? "bg-yellow-400 text-yellow-900 shadow"
                  : "bg-neutral-100 text-neutral-700 hover:bg-yellow-100 hover:text-yellow-700"
              }`}
              onClick={() => setActivePill(pill.key)}
              style={{ minHeight: 36 }}
            >
              {pill.label}
            </button>
          ))}
        </div>
        {/* Showcase cards */}
        <section className="pb-16 space-y-4 mt-4">
          {!filtered.length && (
            <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-6 text-sm text-neutral-400">
              No showcases found. Try a different search or pill.
            </div>
          )}

          <ShowcaseCardsSection
            scoreMode={scoreMode}
            cards={filtered.map((config) => ({
              key: config.key,
              title: config.title,
              editorialDescription: config.editorialDescription,
              categoryUsageCount: config.categoryUsageCount,
              tagline: config.tagline,
              heroGradientFrom: config.heroGradientFrom,
              heroGradientTo: config.heroGradientTo,
              emoji: config.emoji,
            }))}
          />
        </section>
        {/* Footer CTA */}
        <section className="border-t border-neutral-200 px-5 py-8 text-center mt-8">
          <p className="text-xs text-neutral-400">
            Want your favourite spot in the next showcase?
          </p>
          <Link
            href={withBasePath('/')}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 underline decoration-dotted hover:text-neutral-700 transition-colors"
          >
            Join Nearby
          </Link>
        </section>
      </div>
    </main>
  );
}
