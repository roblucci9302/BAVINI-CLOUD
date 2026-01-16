/**
 * Stripe OAuth Provider Configuration
 *
 * Stripe Connect OAuth 2.0 implementation
 * https://stripe.com/docs/connect/oauth-reference
 */

import type { OAuthProviderConfig } from '../oauth';

/**
 * Stripe OAuth scopes
 * https://stripe.com/docs/connect/oauth-reference#get-authorize-request
 */
export const STRIPE_SCOPES = {
  READ_WRITE: 'read_write',
  READ_ONLY: 'read_only',
} as const;

/**
 * Default scopes for BAVINI Stripe integration
 */
export const DEFAULT_STRIPE_SCOPES = [STRIPE_SCOPES.READ_WRITE];

/**
 * Create Stripe OAuth provider configuration
 */
export function createStripeProvider(clientId: string, clientSecret?: string): OAuthProviderConfig {
  return {
    id: 'stripe',
    name: 'Stripe',
    authorizationUrl: 'https://connect.stripe.com/oauth/authorize',
    tokenUrl: 'https://connect.stripe.com/oauth/token',
    scopes: DEFAULT_STRIPE_SCOPES,
    clientId,
    clientSecret,
    usePKCE: false,
  };
}

/**
 * Stripe account info response
 */
export interface StripeAccount {
  id: string;
  object: 'account';
  business_profile?: {
    name?: string | null;
    url?: string | null;
    support_email?: string | null;
  };
  email?: string | null;
  type: 'standard' | 'express' | 'custom';
  country?: string;
  default_currency?: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  created: number;
}

/**
 * Stripe OAuth token response
 */
export interface StripeOAuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  stripe_publishable_key: string;
  stripe_user_id: string;
  scope: string;
  livemode: boolean;
}

/**
 * Fetch Stripe account info using access token
 */
export async function getStripeAccount(accessToken: string): Promise<StripeAccount> {
  const response = await fetch('https://api.stripe.com/v1/account', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Stripe account: ${response.status} - ${error}`);
  }

  return response.json() as Promise<StripeAccount>;
}

/**
 * Verify Stripe token is still valid
 */
export async function verifyStripeToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Refresh Stripe access token
 */
export async function refreshStripeToken(clientSecret: string, refreshToken: string): Promise<StripeOAuthResponse> {
  const response = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Stripe token: ${response.status} - ${error}`);
  }

  return response.json() as Promise<StripeOAuthResponse>;
}

/**
 * Deauthorize/disconnect a Stripe account
 */
export async function deauthorizeStripeAccount(
  clientId: string,
  stripeUserId: string,
): Promise<{ stripe_user_id: string }> {
  const response = await fetch('https://connect.stripe.com/oauth/deauthorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      stripe_user_id: stripeUserId,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to deauthorize Stripe account: ${response.status} - ${error}`);
  }

  return response.json() as Promise<{ stripe_user_id: string }>;
}
