import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase nao esta configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env',
    )
  }

  return supabase
}

export type UserProfile = {
  id: string
  email: string
  name: string
  phone?: string
  address?: string
  created_at: string
  updated_at: string
}

export async function signInWithGoogle(): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.auth.signInWithOAuth({ provider: 'google' })
  if (error) {
    throw error
  }
}

export async function signUpWithEmail(email: string, password: string, profile: Omit<UserProfile, 'id' | 'email' | 'created_at' | 'updated_at'>): Promise<void> {
  const client = requireSupabase()
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) {
    throw error
  }

  if (data.user) {
    await createUserProfile(data.user.id, { ...profile, email })
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw error
  }
}

export async function signOut(): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.auth.signOut()
  if (error) {
    throw error
  }
}

export async function getAuthUser(): Promise<User | null> {
  const client = requireSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }
  return data?.session?.user ?? null
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Profile not found
    }
    throw error
  }

  return data as UserProfile
}

export async function createUserProfile(userId: string, profile: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('user_profiles')
    .insert({
      id: userId,
      ...profile,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

  if (error) {
    throw error
  }
}

export async function updateUserProfile(userId: string, updates: Partial<Omit<UserProfile, 'id' | 'email' | 'created_at' | 'updated_at'>>): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('user_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    throw error
  }
}

export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void,
) {
  const client = requireSupabase()
  return client.auth.onAuthStateChange(callback)
}
