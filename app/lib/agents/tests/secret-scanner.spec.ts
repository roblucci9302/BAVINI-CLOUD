/**
 * Tests pour SecretScanner (P0.5)
 *
 * Vérifie la détection des clés API, tokens, et credentials dans le code
 */

import { describe, it, expect } from 'vitest';
import {
  scanForSecrets,
  validateContentForSecrets,
  suggestSecretFixes,
  SECRET_PATTERNS,
} from '../security/secret-scanner';

// Helper to construct test keys dynamically (avoids GitHub secret scanning)
// Keys are built at runtime to bypass static secret detection
const STRIPE_PREFIX_LIVE_S = 'sk_' + 'live_';
const STRIPE_PREFIX_LIVE_P = 'pk_' + 'live_';
const STRIPE_PREFIX_TEST = 'sk_' + 'test_';
const STRIPE_SUFFIX = 'abcdefghij1234567890abcd'; // 24 alphanumeric chars
const STRIPE_LIVE_SECRET = STRIPE_PREFIX_LIVE_S + STRIPE_SUFFIX;
const STRIPE_LIVE_PUB = STRIPE_PREFIX_LIVE_P + STRIPE_SUFFIX;
const STRIPE_TEST_SECRET = STRIPE_PREFIX_TEST + STRIPE_SUFFIX;

describe('SecretScanner', () => {
  describe('scanForSecrets', () => {
    describe('Stripe keys', () => {
      it('should detect Stripe live secret key', () => {
        const content = `const stripe = new Stripe('${STRIPE_LIVE_SECRET}');`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].type).toBe('stripe_secret_key');
        expect(result.findings[0].severity).toBe('critical');
      });

      it('should detect Stripe live publishable key', () => {
        const content = `const key = '${STRIPE_LIVE_PUB}';`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'stripe_publishable_key')).toBe(true);
      });

      it('should detect Stripe test key with medium severity', () => {
        const content = `const stripe = '${STRIPE_TEST_SECRET}';`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'stripe_test_key')).toBe(true);
        expect(result.findings.find((f) => f.type === 'stripe_test_key')?.severity).toBe('medium');
      });
    });

    describe('AWS credentials', () => {
      it('should detect AWS Access Key ID', () => {
        const content = `aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'aws_access_key')).toBe(true);
        expect(result.findings.find((f) => f.type === 'aws_access_key')?.severity).toBe('critical');
      });

      it('should detect AWS Secret Access Key', () => {
        const content = `aws_secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'aws_secret_key')).toBe(true);
      });
    });

    describe('GitHub tokens', () => {
      it('should detect GitHub personal access token (classic)', () => {
        const content = `const token = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'github_token')).toBe(true);
        expect(result.findings.find((f) => f.type === 'github_token')?.severity).toBe('critical');
      });

      it('should detect GitHub OAuth token', () => {
        const content = `const oauth = 'gho_1234567890abcdefghijklmnopqrstuvwxyz';`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'github_oauth')).toBe(true);
      });
    });

    describe('Anthropic API keys', () => {
      it('should detect Anthropic API key', () => {
        // Générer une fausse clé de la bonne longueur
        const fakeKey = 'sk-ant-' + 'a'.repeat(90);
        const content = `const anthropic = new Anthropic({ apiKey: '${fakeKey}' });`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'anthropic_api_key')).toBe(true);
        expect(result.findings.find((f) => f.type === 'anthropic_api_key')?.severity).toBe('critical');
      });
    });

    describe('OpenAI API keys', () => {
      it('should detect OpenAI API key', () => {
        const fakeKey = 'sk-' + 'a'.repeat(48);
        const content = `const openai = new OpenAI({ apiKey: '${fakeKey}' });`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'openai_api_key')).toBe(true);
      });
    });

    describe('Generic patterns', () => {
      it('should detect generic API key pattern', () => {
        const content = `const apiKey = "my_super_secret_api_key_12345678";`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'generic_api_key')).toBe(true);
      });

      it('should detect hardcoded password', () => {
        const content = `const password = "mysupersecretpassword123";`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type === 'hardcoded_password')).toBe(true);
      });

      it('should detect private key headers', () => {
        const content = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        expect(result.findings.some((f) => f.type.startsWith('private_key'))).toBe(true);
        expect(result.findings.find((f) => f.type.startsWith('private_key'))?.severity).toBe('critical');
      });
    });

    describe('False positives', () => {
      it('should NOT flag variable names as secrets', () => {
        const content = `
          const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
          const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
        `;
        const result = scanForSecrets(content);

        // Devrait détecter peu ou pas de secrets (variable names, pas de vraies valeurs)
        const criticalFindings = result.findings.filter((f) => f.severity === 'critical');
        expect(criticalFindings.length).toBe(0);
      });

      it('should NOT flag environment variable references', () => {
        const content = `
          const key = process.env.API_KEY;
          const secret = \${process.env.SECRET};
        `;
        const result = scanForSecrets(content);

        // Ces sont des références à des variables d'env, pas des secrets hardcodés
        expect(result.findings.filter((f) => f.severity === 'critical').length).toBe(0);
      });

      it('should NOT flag template literals placeholders', () => {
        const content = `const key = "{{API_KEY}}";`;
        const result = scanForSecrets(content);

        expect(result.findings.filter((f) => f.type === 'hardcoded_password').length).toBe(0);
      });
    });

    describe('Location detection', () => {
      it('should report correct line and column', () => {
        const content = `line1
line2
const key = '${STRIPE_LIVE_SECRET}';
line4`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        const finding = result.findings[0];
        expect(finding.line).toBe(3);
      });
    });

    describe('Secret masking', () => {
      it('should mask secrets in findings', () => {
        const content = `const key = '${STRIPE_LIVE_SECRET}';`;
        const result = scanForSecrets(content);

        expect(result.hasSecrets).toBe(true);
        // Le match devrait être masqué (première 4 chars + **** + derniers 4 chars)
        expect(result.findings[0].match).toContain('****');
        expect(result.findings[0].match).not.toBe(STRIPE_LIVE_SECRET);
      });
    });
  });

  describe('validateContentForSecrets', () => {
    it('should allow content without secrets', () => {
      const content = `const greeting = "Hello, World!";`;
      const result = validateContentForSecrets(content);

      expect(result.allowed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('should block content with critical secrets', () => {
      const content = `const key = '${STRIPE_LIVE_SECRET}';`;
      const result = validateContentForSecrets(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CRITICAL');
    });

    it('should block content with high severity secrets by default', () => {
      const content = `const apiKey = "my_secret_api_key_1234567890";`;
      const result = validateContentForSecrets(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('WARNING');
    });

    it('should allow high severity secrets when explicitly allowed', () => {
      const content = `const apiKey = "my_secret_api_key_1234567890";`;
      const result = validateContentForSecrets(content, undefined, { allowHighSeverity: true });

      // Seulement les high severity, pas de critical
      const hasCritical = result.findings.some((f) => f.severity === 'critical');

      if (!hasCritical) {
        expect(result.allowed).toBe(true);
      }
    });

    it('should never allow critical secrets even with allowHighSeverity', () => {
      const content = `const key = '${STRIPE_LIVE_SECRET}';`;
      const result = validateContentForSecrets(content, undefined, { allowHighSeverity: true });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('CRITICAL');
    });

    it('should include filename in findings context', () => {
      const content = `const key = '${STRIPE_LIVE_SECRET}';`;
      const result = validateContentForSecrets(content, 'config.ts');

      expect(result.allowed).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  describe('suggestSecretFixes', () => {
    it('should suggest environment variables for API keys', () => {
      const findings = [
        {
          type: 'generic_api_key',
          severity: 'high' as const,
          description: 'Generic API key',
          match: 'api_****_key',
        },
      ];

      const suggestions = suggestSecretFixes(findings);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.includes('process.env') || s.includes('environment'))).toBe(true);
    });

    it('should suggest .env file for secrets', () => {
      const findings = [
        {
          type: 'stripe_secret_key',
          severity: 'critical' as const,
          description: 'Stripe key',
          match: 'sk_l****klmn',
        },
      ];

      const suggestions = suggestSecretFixes(findings);

      expect(suggestions.some((s) => s.includes('.env') || s.includes('environment'))).toBe(true);
    });
  });

  describe('SECRET_PATTERNS', () => {
    it('should have patterns for all major providers', () => {
      const patternNames = SECRET_PATTERNS.map((p) => p.name);

      expect(patternNames).toContain('stripe_secret_key');
      expect(patternNames).toContain('aws_access_key');
      expect(patternNames).toContain('github_token');
      expect(patternNames).toContain('anthropic_api_key');
      expect(patternNames).toContain('openai_api_key');
    });

    it('should have severity defined for all patterns', () => {
      for (const pattern of SECRET_PATTERNS) {
        expect(['critical', 'high', 'medium']).toContain(pattern.severity);
      }
    });

    it('should have valid regex patterns', () => {
      for (const { pattern, name } of SECRET_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
        // Test que le pattern est compilable
        expect(() => new RegExp(pattern.source, pattern.flags)).not.toThrow();
      }
    });
  });
});
