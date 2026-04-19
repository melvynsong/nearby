// Showcase configuration — add new showcases here, no route changes needed.
// Each entry maps to /discover/showcase/[key]

export type RankingStrategy = 'social' | 'rated'

export type ShowcaseConfig = {
  key: string
  title: string
  fullTitle: (count: number) => string
  editorialDescription: string
  tagline: string
  dishAliases: string[]
  rankingStrategy: RankingStrategy
  accentColor: string          // Tailwind color token (used in classes)
  heroGradientFrom: string     // inline style gradient start
  heroGradientTo: string       // inline style gradient end
  emoji: string
  minItemsToShow: number
  maxItemsToShow: number
}

const SHOWCASES: ShowcaseConfig[] = [
  {
    key: 'prawn-noodles-loved',
    title: 'Prawn Noodles',
    fullTitle: (n) => `Top ${n} Prawn Noodles Loved by Singaporeans`,
    editorialDescription:
      'A rich showcase of bowls the community keeps returning to — from deeply savoury broths to prawn-sweet classics worth crossing the island for.',
    tagline: 'Loved by Singaporeans',
    dishAliases: [
      'Prawn Noodles', 'Prawn Mee', 'Hae Mee', 'Prawn Noodle Soup',
      'Prawn Noodle', 'Prawn Mee Soup', 'Prawn Mee Dry',
      'Hokkien Prawn Mee',
    ],
    rankingStrategy: 'social',
    accentColor: 'amber',
    heroGradientFrom: '#7c2d12',
    heroGradientTo: '#92400e',
    emoji: '🍜',
    minItemsToShow: 3,
    maxItemsToShow: 10,
  },
  {
    key: 'chicken-rice-rated',
    title: 'Chicken Rice',
    fullTitle: (n) => `Top ${n} Rated Chicken Rice`,
    editorialDescription:
      'A curated look at the chicken rice places people rate highly — loved for tender meat, fragrant rice, punchy chilli, and the kind of balance that keeps people coming back.',
    tagline: 'Highly rated by the community',
    dishAliases: [
      'Chicken Rice', 'Hainanese Chicken Rice', 'Roast Chicken Rice',
      'Steamed Chicken Rice', 'Soya Chicken Rice', 'Char Siew Chicken Rice',
      'Nasi Ayam',
    ],
    rankingStrategy: 'rated',
    accentColor: 'yellow',
    heroGradientFrom: '#713f12',
    heroGradientTo: '#854d0e',
    emoji: '🍚',
    minItemsToShow: 3,
    maxItemsToShow: 10,
  },
]

export function getAvailableShowcases(): ShowcaseConfig[] {
  return SHOWCASES
}

export function getShowcaseConfig(key: string): ShowcaseConfig | null {
  return SHOWCASES.find((s) => s.key === key) ?? null
}
