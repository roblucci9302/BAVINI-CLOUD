/**
 * =============================================================================
 * BAVINI CLOUD - Supabase Client
 * =============================================================================
 * Client Supabase pour accéder à la base de données et au storage.
 * Utilise les clés configurées dans .env
 * =============================================================================
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Singleton instance du client Supabase
 */
let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Get the Supabase client instance.
 * Creates a new instance if one doesn't exist.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing Supabase configuration. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
    );
  }

  if (!supabaseClient) {
    supabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseClient;
}

/**
 * Alias for getSupabaseClient() - more explicit name
 */
export const supabase = () => getSupabaseClient();

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Get Supabase configuration info (safe to expose)
 */
export function getSupabaseConfig(): { url: string; configured: boolean } {
  return {
    url: SUPABASE_URL || '',
    configured: isSupabaseConfigured(),
  };
}
