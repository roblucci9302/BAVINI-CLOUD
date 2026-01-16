/**
 * Connector validation functions.
 * Each validator tests the API connection for a specific connector.
 * Core validators only: GitHub, Supabase, Netlify
 */

import type { ConnectorId } from '~/lib/stores/connectors';

export interface ValidationResult {
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

type ValidatorFn = (credentials: Record<string, string>) => Promise<ValidationResult>;

// API response types
interface GitHubUser {
  login: string;
  name: string | null;
}

interface NetlifyUser {
  email: string;
  full_name: string;
}

/**
 * Validate GitHub credentials by fetching user info.
 */
async function validateGitHub(credentials: Record<string, string>): Promise<ValidationResult> {
  const { token } = credentials;

  if (!token) {
    return { success: false, error: 'Token requis' };
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Token invalide ou expiré' };
      }

      return { success: false, error: `Erreur GitHub: ${response.status}` };
    }

    const user = (await response.json()) as GitHubUser;

    return {
      success: true,
      details: { login: user.login, name: user.name },
    };
  } catch {
    return { success: false, error: 'Impossible de contacter GitHub' };
  }
}

/**
 * Validate Supabase credentials by checking project health.
 */
async function validateSupabase(credentials: Record<string, string>): Promise<ValidationResult> {
  const { url, anonKey } = credentials;

  if (!url || !anonKey) {
    return { success: false, error: 'URL et clé anon requis' };
  }

  try {
    // Test the REST API endpoint
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Clé API invalide' };
      }

      return { success: false, error: `Erreur Supabase: ${response.status}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Impossible de contacter Supabase' };
  }
}

/**
 * Validate Netlify credentials by fetching user info.
 */
async function validateNetlify(credentials: Record<string, string>): Promise<ValidationResult> {
  const { accessToken } = credentials;

  if (!accessToken) {
    return { success: false, error: "Token d'accès requis" };
  }

  try {
    const response = await fetch('https://api.netlify.com/api/v1/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Token invalide' };
      }

      return { success: false, error: `Erreur Netlify: ${response.status}` };
    }

    const user = (await response.json()) as NetlifyUser;

    return {
      success: true,
      details: { email: user.email, full_name: user.full_name },
    };
  } catch {
    return { success: false, error: 'Impossible de contacter Netlify' };
  }
}

/**
 * Generic validator for connectors without specific validation.
 * Just checks that required fields are present.
 */
async function validateGeneric(credentials: Record<string, string>): Promise<ValidationResult> {
  const hasValues = Object.values(credentials).some((v) => v && v.trim().length > 0);

  if (!hasValues) {
    return { success: false, error: 'Credentials requis' };
  }

  // For connectors without API validation, assume success if fields are filled
  return { success: true };
}

/**
 * Map of connector IDs to their validation functions.
 */
const validators: Record<ConnectorId, ValidatorFn> = {
  github: validateGitHub,
  supabase: validateSupabase,
  netlify: validateNetlify,
  figma: validateGeneric,
  notion: validateGeneric,
  stripe: validateGeneric,
};

/**
 * Validate credentials for a connector.
 * Returns validation result with success status and optional error message.
 */
export async function validateConnector(
  id: ConnectorId,
  credentials: Record<string, string>,
): Promise<ValidationResult> {
  const validator = validators[id];

  if (validator) {
    return validator(credentials);
  }

  // Use generic validation for connectors without specific validators
  return validateGeneric(credentials);
}

/**
 * Check if a connector has a specific validator.
 */
export function hasValidator(id: ConnectorId): boolean {
  return id in validators;
}
