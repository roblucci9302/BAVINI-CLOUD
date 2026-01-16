/**
 * Types internes pour Supabase - BAVINI
 * Interfaces pour accéder aux propriétés internes du client
 */

/**
 * Propriétés internes du client Supabase
 * Ces propriétés sont privées mais peuvent être nécessaires
 * pour certaines opérations avancées (storage, etc.)
 *
 * Note: On ne peut pas étendre SupabaseClient car certaines
 * propriétés sont privées. On utilise un type séparé.
 */
export interface SupabaseClientInternal {
  /** URL de base de l'instance Supabase */
  url: string;

  /** Clé anonyme pour l'authentification */
  anonKey: string;

  /** Token d'accès (si authentifié) */
  accessToken?: string;
}
