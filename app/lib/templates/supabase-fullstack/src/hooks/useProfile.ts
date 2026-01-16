/**
 * Hook pour gérer le profil utilisateur
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseQuery } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile, UpdateTables } from '@/lib/database.types';

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) {
        return null;
      }

      return supabaseQuery(supabase.from('profiles').select('*').eq('id', user.id).single());
    },
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: UpdateTables<'profiles'>) => {
      if (!user) {
        throw new Error('Not authenticated');
      }

      return supabaseQuery(supabase.from('profiles').update(updates).eq('id', user.id).select().single());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  return {
    profile: profile as Profile | null,
    isLoading,
    error,
    updateProfile: updateProfileMutation.mutate,
    isUpdating: updateProfileMutation.isPending,
  };
}
