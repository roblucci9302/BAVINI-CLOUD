/**
 * OAuth Providers Registry
 *
 * Centralized registry for all OAuth provider configurations
 * Core providers only: GitHub, Supabase, Netlify
 */

import type { OAuthProviderConfig } from '../oauth';
import type { CloudflareEnv } from '../env';
import { createGitHubProvider, getGitHubUser, verifyGitHubToken, type GitHubUser } from './github';
import { createNetlifyProvider, getNetlifyUser, verifyNetlifyToken, type NetlifyUser } from './netlify';
import { createSupabaseProvider, getSupabaseOrganizations, getSupabaseProjects, verifySupabaseToken } from './supabase';
import { createFigmaProvider, getFigmaUser, verifyFigmaToken, type FigmaUser } from './figma';
import { createNotionProvider, getNotionUser, verifyNotionToken, type NotionUser } from './notion';
import { createStripeProvider, getStripeAccount, verifyStripeToken, type StripeAccount } from './stripe';

// Re-export provider types
export type { GitHubUser } from './github';
export type { NetlifyUser } from './netlify';
export type { FigmaUser } from './figma';
export type { NotionUser } from './notion';
export type { StripeAccount } from './stripe';

/**
 * Provider IDs that support OAuth
 */
export const OAUTH_PROVIDER_IDS = ['github', 'netlify', 'supabase', 'figma', 'notion', 'stripe'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

/**
 * Check if a connector ID supports OAuth
 */
export function supportsOAuth(connectorId: string): connectorId is OAuthProviderId {
  return OAUTH_PROVIDER_IDS.includes(connectorId as OAuthProviderId);
}

/**
 * Provider user info union type
 */
export type ProviderUser = GitHubUser | NetlifyUser | FigmaUser | NotionUser | StripeAccount;

/**
 * Provider registry - maps provider IDs to their factory functions
 */
const PROVIDER_REGISTRY = {
  github: {
    create: (env: CloudflareEnv) =>
      env.GITHUB_CLIENT_ID ? createGitHubProvider(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET) : null,
    getUser: getGitHubUser,
    verify: verifyGitHubToken,
  },
  netlify: {
    create: (env: CloudflareEnv) =>
      env.NETLIFY_CLIENT_ID ? createNetlifyProvider(env.NETLIFY_CLIENT_ID, env.NETLIFY_CLIENT_SECRET) : null,
    getUser: getNetlifyUser,
    verify: verifyNetlifyToken,
  },
  supabase: {
    create: (env: CloudflareEnv) =>
      env.SUPABASE_CLIENT_ID ? createSupabaseProvider(env.SUPABASE_CLIENT_ID, env.SUPABASE_CLIENT_SECRET) : null,
    getUser: async (token: string) => {
      const orgs = await getSupabaseOrganizations(token);
      return {
        id: orgs[0]?.id || 'unknown',
        name: orgs[0]?.name || 'Supabase User',
        email: '',
        avatar_url: null,
      } as unknown as ProviderUser;
    },
    verify: verifySupabaseToken,
  },
  figma: {
    create: (env: CloudflareEnv) =>
      env.FIGMA_CLIENT_ID ? createFigmaProvider(env.FIGMA_CLIENT_ID, env.FIGMA_CLIENT_SECRET) : null,
    getUser: getFigmaUser,
    verify: verifyFigmaToken,
  },
  notion: {
    create: (env: CloudflareEnv) =>
      env.NOTION_CLIENT_ID ? createNotionProvider(env.NOTION_CLIENT_ID, env.NOTION_CLIENT_SECRET) : null,
    getUser: getNotionUser,
    verify: verifyNotionToken,
  },
  stripe: {
    create: (env: CloudflareEnv) =>
      env.STRIPE_CLIENT_ID ? createStripeProvider(env.STRIPE_CLIENT_ID, env.STRIPE_SECRET_KEY) : null,
    getUser: getStripeAccount,
    verify: verifyStripeToken,
  },
} as const;

/**
 * Get OAuth provider configuration by ID
 */
export function getProviderConfig(providerId: OAuthProviderId, env: CloudflareEnv): OAuthProviderConfig | null {
  const provider = PROVIDER_REGISTRY[providerId];
  return provider?.create(env) ?? null;
}

/**
 * Fetch user info for a provider using access token
 */
export async function getProviderUser(providerId: OAuthProviderId, accessToken: string): Promise<ProviderUser> {
  const provider = PROVIDER_REGISTRY[providerId];

  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider.getUser(accessToken);
}

/**
 * Verify a token is still valid for a provider
 */
export async function verifyProviderToken(providerId: OAuthProviderId, accessToken: string): Promise<boolean> {
  const provider = PROVIDER_REGISTRY[providerId];
  return provider?.verify(accessToken) ?? false;
}

/**
 * Provider display info for UI
 */
export const PROVIDER_DISPLAY_INFO: Record<
  OAuthProviderId,
  {
    name: string;
    icon: string;
    color: string;
    description: string;
  }
> = {
  github: {
    name: 'GitHub',
    icon: 'i-ph:github-logo',
    color: '#24292e',
    description: 'Repositories, issues, pull requests',
  },
  netlify: {
    name: 'Netlify',
    icon: 'i-ph:cloud-arrow-up',
    color: '#00C7B7',
    description: 'Deployments, sites, functions',
  },
  supabase: {
    name: 'Supabase',
    icon: 'i-ph:database',
    color: '#3ECF8E',
    description: 'Projects, databases, authentication',
  },
  figma: {
    name: 'Figma',
    icon: 'i-ph:figma-logo',
    color: '#F24E1E',
    description: 'Designs, composants, styles',
  },
  notion: {
    name: 'Notion',
    icon: 'i-ph:notebook',
    color: '#000000',
    description: 'Pages, bases de données, wiki',
  },
  stripe: {
    name: 'Stripe',
    icon: 'i-ph:credit-card',
    color: '#635BFF',
    description: 'Paiements, abonnements, factures',
  },
};

// Export Supabase-specific functions
export { getSupabaseOrganizations, getSupabaseProjects };

// Export Figma-specific functions
export { getFigmaFile, getFigmaStyles, getFigmaComponents, exportFigmaImages } from './figma';

// Export Notion-specific functions
export { searchNotion, type NotionOAuthResponse, type NotionWorkspace } from './notion';

// Export Stripe-specific functions
export { refreshStripeToken, deauthorizeStripeAccount, type StripeOAuthResponse } from './stripe';
