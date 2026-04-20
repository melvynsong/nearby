// Category normalization and slug helpers for Nearby

export function normalizeCategoryKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function categoryToSlug(name: string): string {
  return normalizeCategoryKey(name).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
}

export function slugToDisplayLabel(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function categoryToDisplayLabel(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// For merging variants, add a mapping if needed
const CATEGORY_VARIANTS: Record<string, string> = {
  'bkt': 'bak kut teh',
  'wanton mee': 'wonton mee',
  // Add more as needed
};

export function canonicalizeCategory(name: string): string {
  const key = normalizeCategoryKey(name);
  return CATEGORY_VARIANTS[key] || key;
}
