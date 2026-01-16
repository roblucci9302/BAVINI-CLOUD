/**
 * Client Supabase configuré pour l'application
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Please copy .env.example to .env and fill in your Supabase credentials.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/**
 * Helper pour les requêtes Supabase avec gestion d'erreur
 */
export async function supabaseQuery<T>(query: PromiseLike<{ data: T | null; error: Error | null }>): Promise<T> {
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  if (data === null) {
    throw new Error('No data returned');
  }

  return data;
}
