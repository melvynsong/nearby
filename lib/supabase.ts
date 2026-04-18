import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let instance: SupabaseClient | undefined

function getInstance(): SupabaseClient {
  if (!instance) {
    instance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return instance
}

// Proxy defers createClient() until first use (safe during prerendering)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    return Reflect.get(getInstance(), prop)
  },
})
