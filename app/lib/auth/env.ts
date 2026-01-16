/**
 * Cloudflare Environment Types
 *
 * Shared environment interface for Cloudflare Workers/Pages.
 * This extends the global Env interface with OAuth-specific helpers.
 *
 * @see worker-configuration.d.ts for the complete Env interface
 */

/**
 * OAuth environment variables available in Cloudflare Workers
 * This is a subset of Env focused on OAuth provider secrets.
 */
export interface CloudflareEnv {
  // OAuth Providers
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  NETLIFY_CLIENT_ID?: string;
  NETLIFY_CLIENT_SECRET?: string;
  SUPABASE_CLIENT_ID?: string;
  SUPABASE_CLIENT_SECRET?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  FIGMA_CLIENT_ID?: string;
  FIGMA_CLIENT_SECRET?: string;
  NOTION_CLIENT_ID?: string;
  NOTION_CLIENT_SECRET?: string;
  STRIPE_CLIENT_ID?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;

  // API Keys
  ANTHROPIC_API_KEY?: string;
  ADMIN_API_KEY?: string;

  // Token Security
  TOKEN_ENCRYPTION_SECRET?: string;

  // Environment
  ENVIRONMENT?: string;

  // KV/R2 Bindings (optional - may not be present in all contexts)
  TEMPLATES_KV?: KVNamespace;
  TEMPLATES_R2?: R2Bucket;
}

/**
 * Type for accessing Cloudflare context in Remix loaders/actions
 */
export interface CloudflareContext {
  cloudflare: {
    env: CloudflareEnv;
  };
}

/**
 * Helper to check if OAuth provider is configured
 */
export function isProviderConfigured(
  env: CloudflareEnv,
  provider: 'github' | 'netlify' | 'supabase' | 'figma' | 'notion' | 'stripe',
): boolean {
  switch (provider) {
    case 'github':
      return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
    case 'netlify':
      return Boolean(env.NETLIFY_CLIENT_ID && env.NETLIFY_CLIENT_SECRET);
    case 'supabase':
      return Boolean(env.SUPABASE_CLIENT_ID && env.SUPABASE_CLIENT_SECRET);
    case 'figma':
      return Boolean(env.FIGMA_CLIENT_ID && env.FIGMA_CLIENT_SECRET);
    case 'notion':
      return Boolean(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
    case 'stripe':
      return Boolean(env.STRIPE_CLIENT_ID && env.STRIPE_SECRET_KEY);
    default:
      return false;
  }
}
