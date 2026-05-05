import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
const forceDisableSupabase =
  String(import.meta.env.VITE_FORCE_DISABLE_SUPABASE ?? 'false').toLowerCase() === 'true'

export const isSupabaseEnabled = !forceDisableSupabase && Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
