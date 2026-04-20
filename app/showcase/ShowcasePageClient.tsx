"use client";


import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { getCategoryScoreMode } from '@/lib/showcase-config';
import { withBasePath } from '@/lib/base-path';
import ShowcaseCardsSection from '@/components/showcase/ShowcaseCardsSection';

import type { ShowcaseConfig } from '@/lib/showcase-config';

type ShowcasePageClientProps = {
  showcases: ShowcaseConfig[];
};

export default function ShowcasePageClient({ showcases }: ShowcasePageClientProps) {
  const [search, setSearch] = useState('');
  const [activePill, setActivePill] = useState('all');
  const pills = [
    { key: 'all', label: 'All' },
    // Add more pills as needed
  ];
  const scoreMode = getCategoryScoreMode();
  const filtered = useMemo(() => {
    return showcases.filter((config) =>
      (activePill === 'all' || config.key === activePill) &&
      (search === '' || config.title.toLowerCase().includes(search.toLowerCase()))
    );
  }, [showcases, activePill, search]);

  return (
    <main className="bg-neutral-950 min-h-screen">
      {/* Top Section: solid, sticky, safe-area, shadow */}
      <div
        className="sticky top-0 z-50 w-full border-b border-neutral-200 shadow-sm bg-white"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 pt-3 pb-2 flex flex-col gap-2">
          {/* Search input */}
          <input
            type="text"
            placeholder="Search showcases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 px-4 py-3 text-base font-medium transition-all duration-150 shadow-sm outline-none"
            style={{ minHeight: 48 }}
          />
          {/* Pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mt-1">
            {pills.map((pill) => (
              <button
                key={pill.key}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-150 ${
                  activePill === pill.key
                    ? "bg-yellow-400 text-yellow-900 shadow"
                    : "bg-gray-100 text-gray-500 hover:bg-yellow-100 hover:text-yellow-700"
                }`}
                onClick={() => setActivePill(pill.key)}
                style={{ minHeight: 36 }}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </div>

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
