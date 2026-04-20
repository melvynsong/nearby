"use client";



import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { getCategoryScoreMode } from '@/lib/showcase-config';
import { withBasePath } from '@/lib/base-path';
import ShowcaseCardsSection from '@/components/showcase/ShowcaseCardsSection';
import DiscoveryHeader from '@/components/showcase/DiscoveryHeader';
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
    <main className="bg-neutral-950 min-h-screen">
      <DiscoveryHeader
        search={search}
        setSearch={setSearch}
        pills={pills}
        activePill={activePill}
        setActivePill={setActivePill}
      />
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
