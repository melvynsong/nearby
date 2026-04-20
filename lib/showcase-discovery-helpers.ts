// Helper to extract and rank up to 30 meaningful, deduped, non-generic categories from showcase data
import type { ShowcaseConfig } from './showcase-config';
import { getShowcaseDisplayName } from './category-utils';

const GENERIC_CATEGORY_PATTERNS = [
  /food/i,
  /dish/i,
  /asian/i,
  /western/i,
  /cuisine/i,
  /restaurant/i,
  /place/i,
  /eatery/i,
  /meal/i,
  /spot/i,
  /dining/i,
  /^all$/i,
];

function isMeaningfulCategory(label: string | undefined | null): boolean {
  if (!label) return false;
  const trimmed = label.trim();
  if (!trimmed) return false;
  if (GENERIC_CATEGORY_PATTERNS.some((re) => re.test(trimmed))) return false;
  if (trimmed.length < 2) return false;
  return true;
}

export function getTopShowcaseCategories(showcases: ShowcaseConfig[], max = 30): { key: string; label: string }[] {
  const freq: Record<string, { label: string; count: number }> = {};
  for (const s of showcases) {
    if (Array.isArray(s.categoryIds)) {
      for (const cat of s.categoryIds) {
        if (isMeaningfulCategory(cat)) {
          const key = cat.trim().toLowerCase();
          const label = getShowcaseDisplayName({ name: cat });
          if (!label) continue;
          if (!freq[key]) freq[key] = { label, count: 0 };
          freq[key].count++;
        }
      }
    }
  }
  // Sort by frequency descending, then alphabetically
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
    .slice(0, max)
    .map(([key, v]) => ({ key, label: v.label }));
  return [{ key: 'all', label: 'All' }, ...sorted];
}
