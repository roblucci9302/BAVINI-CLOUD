/**
 * Boutons d'authentification pour le header
 * Affichés quand l'utilisateur n'est pas connecté
 */

import { memo } from 'react';
import { Link } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { isAuthenticatedStore, authStateStore } from '~/lib/stores/auth';
import { isSupabaseConfigured } from '~/lib/supabase/client';
import { UserMenu } from './UserMenu';

export const AuthButtons = memo(function AuthButtons() {
  const isAuthenticated = useStore(isAuthenticatedStore);
  const authState = useStore(authStateStore);

  // Don't render anything if Supabase not configured (dev mode without auth)
  if (!isSupabaseConfigured()) {
    return null;
  }

  // Show loading state while auth initializes
  if (!authState.initialized) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-8 bg-bolt-elements-background-depth-3 rounded-lg animate-pulse" />
      </div>
    );
  }

  // Show UserMenu if authenticated
  if (isAuthenticated) {
    return <UserMenu />;
  }

  // Show login/signup buttons if not authenticated
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/login"
        className="px-4 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
      >
        Connexion
      </Link>
      <Link
        to="/signup"
        className="px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-500 hover:to-blue-500 transition-all"
      >
        S'inscrire
      </Link>
    </div>
  );
});
