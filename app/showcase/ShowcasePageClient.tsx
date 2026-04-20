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
    <main>
      {/* Search input (optional) */}
      <section className="px-5 pt-4">
        <input
          type="text"
          placeholder="Search showcases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none"
        />
      </section>

      {/* Pills */}
      <section className="px-5 pb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {pills.map((pill) => (
            <button
              key={pill.key}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${activePill === pill.key ? "bg-yellow-400 text-white shadow" : "bg-white/10 text-white/80 hover:bg-yellow-100 hover:text-yellow-700"}`}
              onClick={() => setActivePill(pill.key)}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </section>

      {/* Showcase cards */}
      <section className="px-5 pb-16 space-y-4">
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
