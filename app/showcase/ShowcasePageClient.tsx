
"use client";
import ShowcaseDetailItemsAccordion from '@/components/showcase/ShowcaseDetailItemsAccordion';

// The canonical showcase list route is /nearby/showcase. Avoid duplicating 'nearby' in path construction.
import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCategoryScoreMode, type ShowcaseConfig } from '@/lib/showcase-config';
import { withBasePath } from '@/lib/base-path';
import ShowcaseCardsSection from '@/components/showcase/ShowcaseCardsSection';
import Link from 'next/link';
import { getShowcaseDisplayName, isUuidLike, normalizeShowcaseCategory, categoryToSlug, normalizeCategoryKey } from '@/lib/category-utils';
import AppHeader from '@/components/AppHeader';

type ShowcasePageClientProps = {
  showcases: ShowcaseConfig[];
};


export default function ShowcasePageClient({ showcases }: ShowcasePageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [activePill, setActivePill] = useState('all');
  const [expandedShowcaseKey, setExpandedShowcaseKey] = useState<string | null>(null);

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
  const selectedCategory = pills.find((p) => p.key === activePill)?.label;


  // --- Query param logic ---
  // Support both ?p= and legacy ?page=, prefer ?p=
  const showcaseParam = searchParams.get('p') ?? searchParams.get('page');
  const sortParam = searchParams.get('sort');
  // Normalize and validate
  const normalizedShowcaseParam = showcaseParam ? normalizeCategoryKey(showcaseParam) : null;
  const validShowcase = normalizedShowcaseParam && showcases.some((c) => categoryToSlug(c.title) === showcaseParam);

  // Auto-expand from query param
  useEffect(() => {
    if (showcaseParam && validShowcase) {
      setExpandedShowcaseKey(showcaseParam);
      console.log('[ShowcasePageClient] query param auto-expand:', showcaseParam);
    }
  }, [showcaseParam, validShowcase]);

  // Accordion expand/collapse logic
  const handleExpand = (categoryKey: string) => {
    if (expandedShowcaseKey === categoryKey) {
      setExpandedShowcaseKey(null);
      router.replace('/nearby/showcase', { scroll: false });
      console.log('[ShowcasePageClient] accordion collapse:', categoryKey);
    } else {
      setExpandedShowcaseKey(categoryKey);
      router.replace(`/nearby/showcase?p=${categoryKey}`, { scroll: false });
      console.log('[ShowcasePageClient] accordion expand:', categoryKey);
    }
  };


  // Filtered list logic
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

          {/* Inline accordion expansion for each card */}
          {filtered.map((config, i) => {
            const isExpanded = expandedShowcaseKey === config.key;
            // Find the correct categoryId for data fetch
            const categoryId = config.categoryIds?.[0] ?? config.key;
            return (
              <div key={config.key} className="mb-6">
                <ShowcaseCardsSection
                  scoreMode={scoreMode}
                  cards={[{
                    key: config.key,
                    title: config.title,
                    editorialDescription: config.editorialDescription,
                    categoryUsageCount: config.categoryUsageCount,
                    tagline: config.tagline,
                    heroGradientFrom: config.heroGradientFrom,
                    heroGradientTo: config.heroGradientTo,
                    emoji: config.emoji,
                    onExplore: () => handleExpand(config.key),
                  }]}
                />
                {/* Inline expanded section */}
                <div
                  className={`transition-all duration-500 overflow-hidden ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <div className="mt-2">
                      <ShowcaseDetailItemsAccordion categoryId={categoryId} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
        {/* Showcase detail drawer removed. All detail is now inline. */}
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
