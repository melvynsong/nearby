import Link from 'next/link';
import React from 'react';

export type DiscoveryHeaderProps = {
  search: string;
  setSearch: (v: string) => void;
  pills: { key: string; label: string }[];
  activePill: string;
  setActivePill: (v: string) => void;
};

export default function DiscoveryHeader({ search, setSearch, pills, activePill, setActivePill }: DiscoveryHeaderProps) {
  return (
    <div
      className="sticky top-0 z-50 w-full border-b border-neutral-200 shadow-sm bg-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="px-4 pt-3 pb-2 flex flex-col gap-2">
        {/* Breadcrumb */}
        <nav className="mb-2 flex items-center text-xs text-gray-400 font-medium gap-1 whitespace-nowrap overflow-x-auto" aria-label="Breadcrumb">
          <Link href="/nearby" className="hover:underline text-gray-500 font-semibold">Home</Link>
          <span className="mx-1 text-gray-300">/</span>
          <span className="text-gray-400 font-semibold">Showcases</span>
        </nav>
        {/* Title & Subtitle */}
        <h1 className="text-2xl font-extrabold text-gray-900 leading-tight mb-1">Food Showcases</h1>
        <div className="text-sm text-gray-500 mb-3 max-w-xl">
          Explore curated dish collections built from places people actually love, save, and revisit.
        </div>
        {/* Search input */}
        <input
          type="text"
          placeholder="Search showcases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl bg-gray-100 text-gray-900 placeholder-gray-400 border border-gray-200 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 px-4 py-3 text-base font-medium transition-all duration-150 shadow-sm outline-none mb-2"
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
  );
}
