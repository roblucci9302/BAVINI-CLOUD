/**
 * OAuth Authentication Module
 *
 * Main entry point for OAuth functionality in BAVINI
 */

// Core OAuth utilities
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  base64UrlEncode,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  validateState,
  isStateExpired,
  type OAuthProviderConfig,
  type OAuthState,
  type OAuthTokenResponse,
} from './oauth';

// Token management
export {
  oauthTokensStore,
  pendingOAuthStates,
  oauthLoadingStore,
  initializeOAuthTokens,
  storeToken,
  getToken,
  getAccessToken,
  isTokenExpired,
  isProviderConnected,
  removeToken,
  storePendingState,
  consumePendingState,
  cleanupExpiredStates,
  getConnectedProviders,
  clearAllTokens,
  type StoredToken,
} from './tokens';

// Providers
export {
  OAUTH_PROVIDER_IDS,
  supportsOAuth,
  getProviderConfig,
  getProviderUser,
  verifyProviderToken,
  PROVIDER_DISPLAY_INFO,
  type OAuthProviderId,
  type ProviderUser,
} from './providers';
