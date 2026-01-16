import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  connectorsStore,
  connectConnector,
  disconnectConnector,
  getConnectorState,
  getConnectorConfig,
  getConnectorsByCategory,
  hasConnectedConnectors,
  settingsModalOpen,
  activeSettingsTab,
  openSettingsModal,
  closeSettingsModal,
  CONNECTORS,

  // OAuth functions
  isOAuthConnector,
  getAuthMethod,
  getOAuthConnectors,
  getApiKeyConnectors,
  type AuthMethod,
} from './connectors';

describe('connectors store', () => {
  beforeEach(() => {
    // reset store to initial state
    const defaultState: Record<string, { isConnected: boolean; credentials: Record<string, string> }> = {};

    for (const connector of CONNECTORS) {
      defaultState[connector.id] = { isConnected: false, credentials: {} };
    }

    connectorsStore.set(defaultState as any);
    settingsModalOpen.set(false);
    activeSettingsTab.set('connectors');
  });

  describe('CONNECTORS configuration', () => {
    it('should have all required connectors defined', () => {
      const connectorIds = CONNECTORS.map((c) => c.id);

      expect(connectorIds).toContain('supabase');
      expect(connectorIds).toContain('github');
      expect(connectorIds).toContain('netlify');
    });

    it('should have exactly 6 connectors', () => {
      expect(CONNECTORS.length).toBe(6);
    });

    it('should have valid fields for each connector', () => {
      for (const connector of CONNECTORS) {
        expect(connector.name).toBeTruthy();
        expect(connector.description).toBeTruthy();
        expect(connector.category).toMatch(/^(shared|personal)$/);
        expect(connector.fields.length).toBeGreaterThan(0);
      }
    });

    it('should have required fields marked correctly', () => {
      const supabase = CONNECTORS.find((c) => c.id === 'supabase');

      expect(supabase?.fields.some((f) => f.required)).toBe(true);
    });
  });

  describe('connectConnector', () => {
    it('should connect a connector with credentials', () => {
      connectConnector('supabase', { url: 'https://test.supabase.co', anonKey: 'test-key' });

      const state = getConnectorState('supabase');

      expect(state.isConnected).toBe(true);
      expect(state.credentials.url).toBe('https://test.supabase.co');
      expect(state.credentials.anonKey).toBe('test-key');
      expect(state.lastConnected).toBeDefined();
    });

    it('should preserve other connectors state', () => {
      connectConnector('supabase', { url: 'https://test.supabase.co' });
      connectConnector('netlify', { accessToken: 'token' });

      expect(getConnectorState('supabase').isConnected).toBe(true);
      expect(getConnectorState('netlify').isConnected).toBe(true);
    });
  });

  describe('disconnectConnector', () => {
    it('should disconnect a connector and clear credentials', () => {
      connectConnector('github', { token: 'ghp_test' });

      expect(getConnectorState('github').isConnected).toBe(true);

      disconnectConnector('github');

      const state = getConnectorState('github');

      expect(state.isConnected).toBe(false);
      expect(state.credentials).toEqual({});
    });
  });

  describe('getConnectorConfig', () => {
    it('should return connector configuration by id', () => {
      const config = getConnectorConfig('supabase');

      expect(config?.name).toBe('Supabase');
      expect(config?.category).toBe('shared');
    });

    it('should return undefined for unknown connector', () => {
      const config = getConnectorConfig('unknown' as any);

      expect(config).toBeUndefined();
    });
  });

  describe('getConnectorsByCategory', () => {
    it('should return shared connectors', () => {
      const shared = getConnectorsByCategory('shared');

      expect(shared.length).toBeGreaterThan(0);
      expect(shared.every((c) => c.category === 'shared')).toBe(true);
    });

    it('should return personal connectors', () => {
      const personal = getConnectorsByCategory('personal');

      expect(personal.length).toBeGreaterThan(0);
      expect(personal.every((c) => c.category === 'personal')).toBe(true);
    });
  });

  describe('hasConnectedConnectors', () => {
    it('should return false when no connectors are connected', () => {
      expect(hasConnectedConnectors()).toBe(false);
    });

    it('should return true when at least one connector is connected', () => {
      connectConnector('github', { token: 'test' });

      expect(hasConnectedConnectors()).toBe(true);
    });
  });

  describe('settings modal state', () => {
    it('should open settings modal with default tab', () => {
      openSettingsModal();

      expect(settingsModalOpen.get()).toBe(true);
      expect(activeSettingsTab.get()).toBe('interface');
    });

    it('should open settings modal with specific tab', () => {
      openSettingsModal('account');

      expect(settingsModalOpen.get()).toBe(true);
      expect(activeSettingsTab.get()).toBe('account');
    });

    it('should close settings modal', () => {
      openSettingsModal();
      closeSettingsModal();

      expect(settingsModalOpen.get()).toBe(false);
    });
  });

  describe('OAuth Authentication Functions', () => {
    describe('isOAuthConnector', () => {
      it('should return true for all OAuth connectors', () => {
        expect(isOAuthConnector('github')).toBe(true);
        expect(isOAuthConnector('netlify')).toBe(true);
        expect(isOAuthConnector('supabase')).toBe(true);
      });
    });

    describe('getAuthMethod', () => {
      it('should return oauth for OAuth connectors', () => {
        expect(getAuthMethod('github')).toBe('oauth');
        expect(getAuthMethod('supabase')).toBe('oauth');
        expect(getAuthMethod('netlify')).toBe('oauth');
      });
    });

    describe('getOAuthConnectors', () => {
      it('should return only OAuth connectors', () => {
        const oauthConnectors = getOAuthConnectors();

        expect(oauthConnectors.length).toBe(6);
        expect(oauthConnectors.every((c) => c.authMethod === 'oauth')).toBe(true);
      });

      it('should include all OAuth connectors', () => {
        const oauthIds = getOAuthConnectors().map((c) => c.id);

        expect(oauthIds).toContain('github');
        expect(oauthIds).toContain('netlify');
        expect(oauthIds).toContain('supabase');
      });
    });

    describe('getApiKeyConnectors', () => {
      it('should return empty array when all connectors use OAuth', () => {
        const apiKeyConnectors = getApiKeyConnectors();

        expect(apiKeyConnectors.length).toBe(0);
      });
    });

    describe('AuthMethod type', () => {
      it('should accept valid auth methods', () => {
        const oauth: AuthMethod = 'oauth';
        const apiKey: AuthMethod = 'api_key';

        expect(oauth).toBe('oauth');
        expect(apiKey).toBe('api_key');
      });
    });

    describe('ConnectorConfig authMethod field', () => {
      it('should have authMethod defined for all connectors', () => {
        const github = CONNECTORS.find((c) => c.id === 'github');
        const supabase = CONNECTORS.find((c) => c.id === 'supabase');
        const netlify = CONNECTORS.find((c) => c.id === 'netlify');

        expect(github?.authMethod).toBe('oauth');
        expect(supabase?.authMethod).toBe('oauth');
        expect(netlify?.authMethod).toBe('oauth');
      });
    });
  });
});
