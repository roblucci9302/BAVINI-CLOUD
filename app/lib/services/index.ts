/**
 * Services SDK Index.
 *
 * This file exports all service SDK modules for easy access.
 * Each service provides a lightweight API client using native fetch().
 *
 * Core services: GitHub, Supabase, Netlify, Figma
 */

// GitHub - Repository & Issue Management
export * as github from './github';

// Netlify - Deployment & Hosting
export * as netlify from './netlify';

// Supabase - Database, Auth & Storage
export * as supabase from './supabase';

// Figma - Design Import & Tokens
export * as figma from './figma';

// Notion - Pages, Databases & Wiki
export * as notion from './notion';

// Stripe - Payments, Subscriptions & Invoices
export * as stripe from './stripe';

// Checkpoints - Time Travel feature
export * as checkpoints from './checkpoints';

// Re-export client classes for direct import
export { GitHubClient, createGitHubClient } from './github';
export { NetlifyClient, createNetlifyClient } from './netlify';
export { SupabaseClient, createSupabaseClient } from './supabase';
export { FigmaClient, createFigmaClient } from './figma';
export { NotionClient, createNotionClient } from './notion';
export { StripeClient, createStripeClient } from './stripe';
export { CheckpointService, createCheckpointService } from './checkpoints';
