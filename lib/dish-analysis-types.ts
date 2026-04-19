// Types for the dish intelligence pipeline.
// Used across: lib/dish-memory.ts, app/api/food/suggest, app/api/food/confirm,
// app/api/food/rank, and the add-place UI.

export type DishSignals = {
  image_score: number
  place_score: number
  visual_memory_score: number
}

export type DishSuggestion = {
  name: string
  confidence: number
  why: string[]
  signals: DishSignals
}

export type DishAnalysisAiResult = {
  dish_name: string
  alternate_names: string[]
  cuisine: string
  confidence: number
  top_suggestions: DishSuggestion[]
  key_visual_clues: string[]
  reasoning_summary: string
}

// Shape returned from /api/food/suggest to the client
export type FoodSuggestResponse = {
  primarySuggestion: string | null
  alternativeSuggestions: string[]
  topSuggestions: DishSuggestion[]
  detectedTextHints: string[]
  containsMultipleFoods: boolean
  reasoningShort: string
  confidence: number | null
  analysisEventId: string | null
}

// Shape returned from /api/food/rank
export type DishRankResponse = {
  rankedSuggestions: DishSuggestion[]
}

// DB row types
export type DishVisualMemory = {
  id: string
  canonical_dish_name: string
  alternate_names: string[]
  place_id: string | null
  photo_url: string | null
  image_embedding: unknown | null
  visual_characteristics: Record<string, unknown>
  cuisine: string | null
  confirmed_count: number
  created_at: string
  updated_at: string
  last_confirmed_at: string
}

export type PlaceDishStat = {
  id: string
  place_id: string
  canonical_dish_name: string
  add_count: number
  confirm_count: number
  view_count: number
  last_seen_at: string
  confidence_trend: number | null
}

export type DishAnalysisEvent = {
  id: string
  user_id: string | null
  place_id: string | null
  uploaded_photo_url: string | null
  ai_raw_result: Record<string, unknown>
  suggested_dishes: string[]
  final_selected_dish: string | null
  was_confirmed: boolean
  created_at: string
}
