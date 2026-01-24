/**
 * Store d'authentification BAVINI
 * Gère l'état de connexion utilisateur avec Supabase Auth
 */

import { atom, computed } from 'nanostores';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '~/lib/supabase/client';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AuthStore');

// ============================================================================
// Types
// ============================================================================

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
  /** Nombre de requêtes utilisées aujourd'hui */
  dailyRequestCount: number;
  /** Limite journalière de requêtes */
  dailyRequestLimit: number;
}

// ============================================================================
// Stores
// ============================================================================

/** État d'authentification principal */
export const authStateStore = atom<AuthState>({
  user: null,
  session: null,
  loading: true,
  initialized: false,
});

/** Compteur de requêtes journalières */
export const dailyRequestCountStore = atom<number>(0);

/** Limite journalière (configurable par plan) */
export const dailyRequestLimitStore = atom<number>(15);

// ============================================================================
// Computed Stores
// ============================================================================

/** L'utilisateur est-il connecté ? */
export const isAuthenticatedStore = computed(authStateStore, (state) => !!state.user);

/** L'utilisateur a-t-il des requêtes restantes ? */
export const hasRemainingRequestsStore = computed(
  [dailyRequestCountStore, dailyRequestLimitStore],
  (count, limit) => count < limit
);

/** Nombre de requêtes restantes */
export const remainingRequestsStore = computed(
  [dailyRequestCountStore, dailyRequestLimitStore],
  (count, limit) => Math.max(0, limit - count)
);

/** Profil utilisateur simplifié */
export const userProfileStore = computed(
  [authStateStore, dailyRequestCountStore, dailyRequestLimitStore],
  (state, count, limit): UserProfile | null => {
    if (!state.user) return null;

    return {
      id: state.user.id,
      email: state.user.email || '',
      name: state.user.user_metadata?.full_name || state.user.user_metadata?.name,
      avatarUrl: state.user.user_metadata?.avatar_url,
      createdAt: state.user.created_at,
      dailyRequestCount: count,
      dailyRequestLimit: limit,
    };
  }
);

// ============================================================================
// Actions
// ============================================================================

/**
 * Initialiser l'auth listener
 * À appeler au démarrage de l'app
 */
export async function initAuth(): Promise<void> {
  if (!isSupabaseConfigured()) {
    logger.warn('Supabase not configured, skipping auth initialization');
    authStateStore.set({
      user: null,
      session: null,
      loading: false,
      initialized: true,
    });
    return;
  }

  try {
    const supabase = getSupabaseClient();

    // Récupérer la session existante
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      logger.error('Error getting session:', error);
    }

    authStateStore.set({
      user: session?.user || null,
      session: session,
      loading: false,
      initialized: true,
    });

    // Charger le compteur de requêtes si connecté
    if (session?.user) {
      await loadDailyRequestCount(session.user.id);
    }

    // Écouter les changements d'auth
    supabase.auth.onAuthStateChange(async (event, session) => {
      logger.debug('Auth state changed:', event);

      authStateStore.set({
        user: session?.user || null,
        session: session,
        loading: false,
        initialized: true,
      });

      if (event === 'SIGNED_IN' && session?.user) {
        await loadDailyRequestCount(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        dailyRequestCountStore.set(0);
      }
    });
  } catch (error) {
    logger.error('Error initializing auth:', error);
    authStateStore.set({
      user: null,
      session: null,
      loading: false,
      initialized: true,
    });
  }
}

/**
 * Connexion avec email/password
 */
export async function signInWithEmail(email: string, password: string): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase non configuré' };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      logger.error('Sign in error:', error);
      return { error: getAuthErrorMessage(error.message) };
    }

    return {};
  } catch (error) {
    logger.error('Sign in exception:', error);
    return { error: 'Erreur de connexion' };
  }
}

/**
 * Inscription avec email/password
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  metadata?: { full_name?: string }
): Promise<{ error?: string; needsConfirmation?: boolean }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase non configuré' };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      logger.error('Sign up error:', error);
      return { error: getAuthErrorMessage(error.message) };
    }

    // Supabase renvoie un user même si confirmation email requise
    const needsConfirmation = !data.session && !!data.user;

    return { needsConfirmation };
  } catch (error) {
    logger.error('Sign up exception:', error);
    return { error: 'Erreur d\'inscription' };
  }
}

/**
 * Connexion avec OAuth (Google, GitHub)
 */
export async function signInWithOAuth(provider: 'google' | 'github'): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase non configuré' };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/app`,
      },
    });

    if (error) {
      logger.error('OAuth error:', error);
      return { error: getAuthErrorMessage(error.message) };
    }

    return {};
  } catch (error) {
    logger.error('OAuth exception:', error);
    return { error: 'Erreur de connexion' };
  }
}

/**
 * Déconnexion
 */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    dailyRequestCountStore.set(0);
  } catch (error) {
    logger.error('Sign out error:', error);
  }
}

/**
 * Charger le compteur de requêtes journalières
 */
async function loadDailyRequestCount(userId: string): Promise<void> {
  // Pour l'instant, on utilise localStorage
  // TODO: Migrer vers Supabase pour persister côté serveur
  const storageKey = `bavini_daily_requests_${userId}`;
  const today = new Date().toISOString().split('T')[0];

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) {
        dailyRequestCountStore.set(data.count);
        return;
      }
    }
    // Nouveau jour, reset le compteur
    dailyRequestCountStore.set(0);
  } catch {
    dailyRequestCountStore.set(0);
  }
}

/**
 * Incrémenter le compteur de requêtes
 */
export function incrementRequestCount(): boolean {
  const state = authStateStore.get();
  if (!state.user) return false;

  const currentCount = dailyRequestCountStore.get();
  const limit = dailyRequestLimitStore.get();

  if (currentCount >= limit) {
    return false; // Limite atteinte
  }

  const newCount = currentCount + 1;
  dailyRequestCountStore.set(newCount);

  // Sauvegarder dans localStorage
  const storageKey = `bavini_daily_requests_${state.user.id}`;
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem(storageKey, JSON.stringify({ date: today, count: newCount }));

  return true;
}

/**
 * Vérifier si l'utilisateur peut faire une requête
 */
export function canMakeRequest(): boolean {
  const state = authStateStore.get();
  if (!state.user) return false;

  return dailyRequestCountStore.get() < dailyRequestLimitStore.get();
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convertir les messages d'erreur Supabase en français
 */
function getAuthErrorMessage(message: string): string {
  const errorMessages: Record<string, string> = {
    'Invalid login credentials': 'Email ou mot de passe incorrect',
    'Email not confirmed': 'Veuillez confirmer votre email',
    'User already registered': 'Cet email est déjà utilisé',
    'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères',
    'Unable to validate email address: invalid format': 'Format d\'email invalide',
    'Email rate limit exceeded': 'Trop de tentatives, réessayez plus tard',
  };

  return errorMessages[message] || message;
}
