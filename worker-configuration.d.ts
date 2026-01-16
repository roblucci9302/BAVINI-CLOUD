/**
 * Cloudflare Worker Environment Configuration
 *
 * This file defines the complete environment interface for Cloudflare Pages/Workers.
 * It includes KV namespaces, R2 buckets, environment variables, and secrets.
 *
 * @see wrangler.toml for the source of truth for bindings
 * @see app/lib/auth/env.ts for OAuth-specific types
 */

interface Env {
  // ===========================================================================
  // API Keys
  // ===========================================================================

  /** Anthropic API key for Claude models */
  ANTHROPIC_API_KEY: string;

  // ===========================================================================
  // KV Namespaces
  // ===========================================================================

  /** KV namespace for template metadata and caching */
  TEMPLATES_KV?: KVNamespace;

  // ===========================================================================
  // R2 Buckets
  // ===========================================================================

  /** R2 bucket for template file storage */
  TEMPLATES_R2?: R2Bucket;

  // ===========================================================================
  // Environment Variables (from wrangler.toml [vars])
  // ===========================================================================

  /** Current environment: development, preview, or production */
  ENVIRONMENT?: string;

  /** Template cache TTL in seconds */
  TEMPLATE_CACHE_TTL?: string;

  /** Maximum template size in bytes */
  MAX_TEMPLATE_SIZE?: string;

  /** Template engine to use (e.g., handlebars) */
  TEMPLATE_ENGINE?: string;

  // ===========================================================================
  // OAuth Secrets (set via wrangler secret put)
  // ===========================================================================

  /** GitHub OAuth App Client ID */
  GITHUB_CLIENT_ID?: string;

  /** GitHub OAuth App Client Secret */
  GITHUB_CLIENT_SECRET?: string;

  /** Netlify OAuth App Client ID */
  NETLIFY_CLIENT_ID?: string;

  /** Netlify OAuth App Client Secret */
  NETLIFY_CLIENT_SECRET?: string;

  /** Supabase OAuth Client ID */
  SUPABASE_CLIENT_ID?: string;

  /** Supabase OAuth Client Secret */
  SUPABASE_CLIENT_SECRET?: string;

  /** Supabase Publishable API Key */
  SUPABASE_PUBLISHABLE_KEY?: string;

  /** Supabase Secret API Key */
  SUPABASE_SECRET_KEY?: string;

  /** Figma OAuth Client ID */
  FIGMA_CLIENT_ID?: string;

  /** Figma OAuth Client Secret */
  FIGMA_CLIENT_SECRET?: string;

  /** Notion OAuth Client ID */
  NOTION_CLIENT_ID?: string;

  /** Notion OAuth Client Secret */
  NOTION_CLIENT_SECRET?: string;

  /** Stripe Connect Client ID */
  STRIPE_CLIENT_ID?: string;

  /** Stripe Secret Key */
  STRIPE_SECRET_KEY?: string;

  /** Stripe Publishable Key */
  STRIPE_PUBLISHABLE_KEY?: string;

  // ===========================================================================
  // Admin Secrets
  // ===========================================================================

  /** API key for admin endpoints */
  ADMIN_API_KEY?: string;

  // ===========================================================================
  // Screenshot Service
  // ===========================================================================

  /** Screenshot provider: screenshotone, browserless, urlbox, mock */
  SCREENSHOT_PROVIDER?: string;

  /** API key for the screenshot service */
  SCREENSHOT_API_KEY?: string;

  /** Base URL for the screenshot service (optional override) */
  SCREENSHOT_BASE_URL?: string;

  // ===========================================================================
  // Web Search (Tavily)
  // ===========================================================================

  /** Tavily API key for web search functionality */
  TAVILY_API_KEY?: string;
}
