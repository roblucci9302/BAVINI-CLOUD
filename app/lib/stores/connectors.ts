/**
 * Connectors store for managing third-party service integrations.
 * Uses localStorage for persistence across sessions.
 * OAuth tokens are managed through lib/auth/tokens.ts
 * Supports both OAuth and API key authentication.
 */

import { atom } from 'nanostores';
import {
  supportsOAuth,
  initializeOAuthTokens,
  oauthTokensStore,
  removeToken,
  getAccessToken,
  isProviderConnected,
  isTokenExpired,
  type OAuthProviderId,
} from '~/lib/auth';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Connectors');

// Connector types - Simplified to core services only
export type ConnectorId = 'github' | 'supabase' | 'netlify' | 'figma' | 'notion' | 'stripe';

export type ConnectorCategory = 'shared' | 'personal';

/**
 * Authentication method for connectors
 * - 'oauth': Uses OAuth 2.0 flow (redirect to provider)
 * - 'api_key': Uses manual API key/token entry
 */
export type AuthMethod = 'oauth' | 'api_key';

export interface ConnectorConfig {
  id: ConnectorId;
  name: string;
  description: string;
  category: ConnectorCategory;
  icon: string;
  docsUrl?: string;

  /** Authentication method - defaults to 'api_key' if not specified */
  authMethod?: AuthMethod;

  /** Fields for API key authentication (ignored for OAuth) */
  fields: ConnectorField[];
}

export interface ConnectorField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  required?: boolean;
}

export interface ConnectorState {
  isConnected: boolean;
  credentials: Record<string, string>;
  lastConnected?: number;

  /** OAuth-specific: indicates if this connector uses OAuth */
  isOAuth?: boolean;

  /** OAuth-specific: access token expiration timestamp */
  expiresAt?: number;

  /** OAuth-specific: indicates if the token needs refresh */
  needsRefresh?: boolean;
}

export type ConnectorsState = Record<ConnectorId, ConnectorState>;

const kConnectorsStorage = 'bavini_connectors';

// Connector configurations - Core services only
export const CONNECTORS: ConnectorConfig[] = [
  // Shared connectors
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Base de données PostgreSQL et authentification',
    category: 'shared',
    icon: 'supabase',
    docsUrl: 'https://supabase.com/docs',
    authMethod: 'oauth',
    fields: [
      { key: 'url', label: 'URL du projet', type: 'url', placeholder: 'https://xxx.supabase.co', required: true },
      { key: 'anonKey', label: 'Clé Anon', type: 'password', placeholder: 'eyJhbGciOiJIUzI1NiIs...', required: true },
    ],
  },
  {
    id: 'netlify',
    name: 'Netlify',
    description: 'Déploiement et hébergement',
    category: 'shared',
    icon: 'netlify',
    docsUrl: 'https://docs.netlify.com',
    authMethod: 'oauth',
    fields: [
      { key: 'accessToken', label: "Token d'accès", type: 'password', required: true },
      { key: 'siteId', label: 'ID du site', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    ],
  },

  // Personal connectors
  {
    id: 'github',
    name: 'GitHub',
    description: 'Gestion de code et repositories',
    category: 'personal',
    icon: 'github',
    docsUrl: 'https://docs.github.com',
    authMethod: 'oauth',
    fields: [
      { key: 'token', label: "Token d'accès personnel", type: 'password', placeholder: 'ghp_...', required: true },
    ],
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Import de designs et composants',
    category: 'personal',
    icon: 'figma',
    docsUrl: 'https://www.figma.com/developers/api',
    authMethod: 'oauth',
    fields: [
      { key: 'token', label: "Token d'accès personnel", type: 'password', placeholder: 'figd_...', required: true },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages, bases de données et wiki',
    category: 'personal',
    icon: 'notion',
    docsUrl: 'https://developers.notion.com',
    authMethod: 'oauth',
    fields: [
      { key: 'token', label: "Token d'intégration", type: 'password', placeholder: 'secret_...', required: true },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Paiements, abonnements et factures',
    category: 'shared',
    icon: 'stripe',
    docsUrl: 'https://stripe.com/docs/api',
    authMethod: 'oauth',
    fields: [
      { key: 'secretKey', label: 'Clé secrète API', type: 'password', placeholder: 'sk_...', required: true },
      { key: 'publishableKey', label: 'Clé publique', type: 'text', placeholder: 'pk_...', required: false },
    ],
  },
];

// Default state for all connectors
function getDefaultState(): ConnectorsState {
  const state: Partial<ConnectorsState> = {};

  for (const connector of CONNECTORS) {
    state[connector.id] = {
      isConnected: false,
      credentials: {},
    };
  }

  return state as ConnectorsState;
}

// Deferred localStorage loading (non-blocking)
let connectorsLoaded = false;

function loadConnectorsDeferred(): void {
  if (connectorsLoaded || import.meta.env.SSR) {
    return;
  }

  connectorsLoaded = true;

  try {
    const persisted = localStorage.getItem(kConnectorsStorage);

    if (persisted) {
      const parsed = JSON.parse(persisted) as Partial<ConnectorsState>;
      const current = connectorsStore.get();
      const newState = { ...current };

      // merge with default to handle new connectors, only keep valid connector IDs
      const validIds = CONNECTORS.map((c) => c.id);

      for (const id of validIds) {
        if (parsed[id]) {
          newState[id] = parsed[id];
        }
      }

      connectorsStore.set(newState);
    }
  } catch (error) {
    // Log parse errors and fallback to default state
    logger.warn('Failed to parse connectors from localStorage, using defaults:', error);

    // Clear corrupted data
    try {
      localStorage.removeItem(kConnectorsStorage);
    } catch {
      // Ignore removal errors
    }
  }
}

// Initialize store with defaults - localStorage loaded lazily
export const connectorsStore = atom<ConnectorsState>(getDefaultState());

// Load from localStorage on first idle frame (non-blocking)
if (!import.meta.env.SSR) {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => loadConnectorsDeferred(), { timeout: 200 });
  } else {
    setTimeout(loadConnectorsDeferred, 0);
  }
}

// Settings modal state
export const settingsModalOpen = atom<boolean>(false);
export const activeSettingsTab = atom<'account' | 'connectors' | 'github' | 'interface'>('interface');

/**
 * Save connectors state to localStorage.
 */
function persistState(state: ConnectorsState): void {
  if (!import.meta.env.SSR) {
    localStorage.setItem(kConnectorsStorage, JSON.stringify(state));
  }
}

/**
 * Connect a connector with credentials.
 */
export function connectConnector(id: ConnectorId, credentials: Record<string, string>): void {
  const current = connectorsStore.get();

  const newState: ConnectorsState = {
    ...current,
    [id]: {
      isConnected: true,
      credentials,
      lastConnected: Date.now(),
    },
  };

  connectorsStore.set(newState);
  persistState(newState);
}

/**
 * Disconnect a connector.
 */
export function disconnectConnector(id: ConnectorId): void {
  const current = connectorsStore.get();

  const newState: ConnectorsState = {
    ...current,
    [id]: {
      isConnected: false,
      credentials: {},
    },
  };

  connectorsStore.set(newState);
  persistState(newState);
}

/**
 * Get a specific connector's state.
 */
export function getConnectorState(id: ConnectorId): ConnectorState {
  return connectorsStore.get()[id];
}

/**
 * Get connector configuration by ID.
 */
export function getConnectorConfig(id: ConnectorId): ConnectorConfig | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/**
 * Get all connectors by category.
 */
export function getConnectorsByCategory(category: ConnectorCategory): ConnectorConfig[] {
  return CONNECTORS.filter((c) => c.category === category);
}

/**
 * Check if any connectors are connected.
 */
export function hasConnectedConnectors(): boolean {
  const state = connectorsStore.get();

  return Object.values(state).some((s) => s.isConnected);
}

/**
 * Open settings modal.
 */
export function openSettingsModal(tab: 'account' | 'connectors' | 'github' | 'interface' = 'interface'): void {
  activeSettingsTab.set(tab);
  settingsModalOpen.set(true);
}

/**
 * Close settings modal.
 */
export function closeSettingsModal(): void {
  settingsModalOpen.set(false);
}

/*
 * ============================================================================
 * OAuth Integration Functions
 * ============================================================================
 */

/**
 * Check if a connector uses OAuth authentication.
 */
export function isOAuthConnector(id: ConnectorId): boolean {
  const config = getConnectorConfig(id);

  return config?.authMethod === 'oauth';
}

/**
 * Get the authentication method for a connector.
 */
export function getAuthMethod(id: ConnectorId): AuthMethod {
  const config = getConnectorConfig(id);

  return config?.authMethod || 'api_key';
}

/**
 * Initiate OAuth flow for a connector.
 * Redirects to /api/auth/:provider
 */
export function initiateOAuth(id: ConnectorId): void {
  if (!isOAuthConnector(id)) {
    logger.error(`Connector ${id} does not support OAuth`);

    return;
  }

  // Redirect to OAuth initiation endpoint
  window.location.href = `/api/auth/${id}`;
}

/**
 * Handle OAuth callback success.
 * Called after successful OAuth flow to update connector state.
 */
export function handleOAuthSuccess(providerId: string): void {
  const id = providerId as ConnectorId;

  if (!CONNECTORS.find((c) => c.id === id)) {
    logger.error(`Unknown connector: ${providerId}`);

    return;
  }

  // Get the token from OAuth tokens store
  const accessToken = getAccessToken(providerId);

  if (!accessToken) {
    logger.error(`No OAuth token found for ${providerId}`);

    return;
  }

  const current = connectorsStore.get();

  const newState: ConnectorsState = {
    ...current,
    [id]: {
      isConnected: true,
      credentials: { accessToken },
      lastConnected: Date.now(),
      isOAuth: true,
    },
  };

  connectorsStore.set(newState);
  persistState(newState);
}

/**
 * Disconnect an OAuth connector.
 */
export function disconnectOAuthConnector(id: ConnectorId): void {
  if (!isOAuthConnector(id)) {
    disconnectConnector(id);

    return;
  }

  // Remove from OAuth tokens store
  removeToken(id);

  // Update connector state
  const current = connectorsStore.get();

  const newState: ConnectorsState = {
    ...current,
    [id]: {
      isConnected: false,
      credentials: {},
      isOAuth: true,
    },
  };

  connectorsStore.set(newState);
  persistState(newState);
}

/**
 * Check if an OAuth connector needs token refresh.
 */
export function needsTokenRefresh(id: ConnectorId): boolean {
  if (!isOAuthConnector(id)) {
    return false;
  }

  return isTokenExpired(id);
}

/**
 * Get OAuth connectors list.
 */
export function getOAuthConnectors(): ConnectorConfig[] {
  return CONNECTORS.filter((c) => c.authMethod === 'oauth');
}

/**
 * Get API key connectors list.
 */
export function getApiKeyConnectors(): ConnectorConfig[] {
  return CONNECTORS.filter((c) => !c.authMethod || c.authMethod === 'api_key');
}

/*
 * ============================================================================
 * OAuth Token Store Synchronization
 * ============================================================================
 */

/**
 * Sync OAuth tokens to connector states.
 * Handles both initial load and ongoing changes.
 */
function syncOAuthTokensToConnectors(): void {
  const tokens = oauthTokensStore.get();
  const current = connectorsStore.get();
  let hasChanges = false;
  const newState = { ...current };

  // Sync connected OAuth tokens
  for (const [providerId, token] of Object.entries(tokens)) {
    const id = providerId as ConnectorId;

    if (!CONNECTORS.find((c) => c.id === id)) {
      continue;
    }

    if (token && isProviderConnected(providerId) && !current[id].isConnected) {
      newState[id] = {
        isConnected: true,
        credentials: { accessToken: token.accessToken },
        lastConnected: token.connectedAt,
        isOAuth: true,
        expiresAt: token.expiresAt,
      };
      hasChanges = true;
    }
  }

  // Handle disconnected OAuth providers
  for (const connector of CONNECTORS.filter((c) => c.authMethod === 'oauth')) {
    if (current[connector.id].isConnected && current[connector.id].isOAuth && !tokens[connector.id]) {
      newState[connector.id] = {
        isConnected: false,
        credentials: {},
        isOAuth: true,
      };
      hasChanges = true;
    }
  }

  if (hasChanges) {
    connectorsStore.set(newState);
    persistState(newState);
  }
}

/**
 * Initialize OAuth integration.
 * Should be called on app startup.
 */
export function initializeOAuthIntegration(): void {
  if (import.meta.env.SSR) {
    return;
  }

  // Initialize OAuth tokens from localStorage
  initializeOAuthTokens();

  // Initial sync
  syncOAuthTokensToConnectors();

  // Subscribe to ongoing changes
  oauthTokensStore.subscribe(() => syncOAuthTokensToConnectors());
}

// Initialize OAuth integration on module load (client-side only)
if (!import.meta.env.SSR) {
  // Use setTimeout to ensure this runs after the module is fully loaded
  setTimeout(() => {
    initializeOAuthIntegration();
  }, 0);
}
