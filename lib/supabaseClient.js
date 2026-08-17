import { createClient } from '@supabase/supabase-js'

let client = null

export function getSupabase() {
  if (typeof window === 'undefined') return null

  if (!client) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) return null
    client = createClient(supabaseUrl, supabaseAnonKey)
  }

  return client
}
