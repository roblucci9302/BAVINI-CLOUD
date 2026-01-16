/**
 * Hook pour accéder au client Supabase
 */

import { supabase } from '@/lib/supabase';

export function useSupabase() {
  return supabase;
}
