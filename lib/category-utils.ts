// Returns true if value looks like a UUID or gibberish
export function isUuidLike(value: string | undefined | null): boolean {
  if (!value) return false;
  // UUID v4 or similar
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) || /^[0-9a-f-]{16,}$/i.test(value);
}

// Formats a dish/category label defensively
export function formatDishCategoryLabel(value: string | undefined | null): string {
  if (!value || isUuidLike(value)) return '';
  // If it's a slug, convert to title case
  if (value.includes('-')) return slugToDisplayLabel(value);
  // Otherwise, title case
  return categoryToDisplayLabel(value);
}
// Defensive, premium display label for showcase/category
export function getShowcaseDisplayName(input: { name?: string; slug?: string; key?: string } | string | undefined | null): string {
  if (!input) return '';
  let name = '';
  if (typeof input === 'string') {
    name = input;
  } else if (input.name && typeof input.name === 'string') {
    name = input.name;
  } else if (input.slug && typeof input.slug === 'string') {
    name = input.slug;
  } else if (input.key && typeof input.key === 'string') {
    name = input.key;
  }
  return formatDishCategoryLabel(name);
}
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
