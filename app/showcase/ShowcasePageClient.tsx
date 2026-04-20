
// The canonical showcase list route is /nearby/showcase. Avoid duplicating 'nearby' in path construction.
"use client";



import React, { useState, useMemo } from 'react';
import { getCategoryScoreMode } from '@/lib/showcase-config';
import { withBasePath } from '@/lib/base-path';
import ShowcaseCardsSection from '@/components/showcase/ShowcaseCardsSection';
import Link from 'next/link';
import { getTopShowcaseCategories } from '@/lib/showcase-discovery-helpers';
import type { ShowcaseConfig } from '@/lib/showcase-config';

type ShowcasePageClientProps = {
  showcases: ShowcaseConfig[];
};

export default function ShowcasePageClient({ showcases }: ShowcasePageClientProps) {

  const [search, setSearch] = useState('');
  const [activePill, setActivePill] = useState('all');
  // Compute top 30 categories from showcase data
  const pills = useMemo(() => getTopShowcaseCategories(showcases, 30), [showcases]);
  const scoreMode = getCategoryScoreMode();
  // Find the selected category label for filtering
  const selectedCategory = pills.find((p) => p.key === activePill)?.label;
  const filtered = useMemo(() => {
    return showcases.filter((config) => {
      const matchesCategory =
        activePill === 'all' ||
        (Array.isArray(config.categoryIds) && config.categoryIds.some((cat) => cat.trim().toLowerCase() === activePill));
      const matchesSearch =
        search === '' || config.title.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [showcases, activePill, search]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#1f355d] to-[#0f3b58]">
      {/* Premium Hero Header */}
      <header
        className="sticky top-0 z-50 w-full bg-gradient-to-br from-[#1f355d] to-[#0f3b58] pb-4 pt-4 px-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Watermark icon (optional) */}
        <div className="absolute right-4 top-4 opacity-10 pointer-events-none select-none hidden sm:block">
          <span className="text-[72px]">🍽️</span>
        </div>
        {/* Breadcrumb */}
        <nav className="mb-2 flex items-center text-xs text-white/60 font-medium gap-1 whitespace-nowrap overflow-x-auto px-5" aria-label="Breadcrumb">
          <Link href="/nearby" className="hover:underline text-white/80 font-semibold">Home</Link>
          <span className="mx-1 text-white/40">/</span>
          <span className="text-white/60 font-semibold">Showcases</span>
        </nav>
        {/* Title & Subtitle */}
        <h1 className="text-3xl font-extrabold text-white leading-tight mb-1 px-5">Discover Food Showcases</h1>
        <div className="text-base text-white/70 mb-4 max-w-xl px-5">
          Browse curated dish collections based on places people actually love, revisit, and recommend.
        </div>
        {/* Search input */}
        <div className="px-5">
          <input
            type="text"
            placeholder="Search showcases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-white/90 text-gray-900 placeholder-gray-400 border border-white/30 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 px-4 py-3 text-base font-medium transition-all duration-150 shadow-sm outline-none mb-2"
            style={{ minHeight: 48 }}
          />
        </div>
        {/* Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mt-2 px-5">
          {pills.map((pill) => (
            <button
              key={pill.key}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-150 ${
                activePill === pill.key
                  ? "bg-yellow-400 text-yellow-900 shadow"
                  : "bg-white/20 text-white/80 hover:bg-yellow-100 hover:text-yellow-700"
              }`}
              onClick={() => setActivePill(pill.key)}
              style={{ minHeight: 36 }}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </header>
      {/* Showcase cards */}
      <section className="px-5 pb-16 space-y-4 mt-4">
        {!filtered.length && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-white/70">
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
  );
}
