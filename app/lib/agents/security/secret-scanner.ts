/**
 * Scanner de secrets hardcodés
 * Détecte les clés API, tokens, et credentials dans le code
 *
 * @module agents/security/secret-scanner
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SecretScanner');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Pattern de secret connu
 */
export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

/**
 * Résultat d'un scan de secrets
 */
export interface SecretScanResult {
  hasSecrets: boolean;
  findings: SecretFinding[];
}

/**
 * Secret détecté
 */
export interface SecretFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  line?: number;
  column?: number;
  match: string;
}

/*
 * ============================================================================
 * PATTERNS DE SECRETS
 * ============================================================================
 */

/**
 * Patterns de secrets connus
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  // Clés API génériques
  {
    name: 'generic_api_key',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([a-zA-Z0-9_\-]{20,})["']/gi,
    severity: 'high',
    description: 'Generic API key detected',
  },

  // Stripe
  {
    name: 'stripe_secret_key',
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'critical',
    description: 'Stripe secret key (live)',
  },
  {
    name: 'stripe_publishable_key',
    pattern: /pk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'high',
    description: 'Stripe publishable key (live)',
  },
  {
    name: 'stripe_test_key',
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    severity: 'medium',
    description: 'Stripe test key (not for production)',
  },

  // AWS
  {
    name: 'aws_access_key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    description: 'AWS Access Key ID',
  },
  {
    name: 'aws_secret_key',
    pattern: /(?:aws)?[_-]?secret[_-]?(?:access)?[_-]?key\s*[:=]\s*["']([a-zA-Z0-9/+=]{40})["']/gi,
    severity: 'critical',
    description: 'AWS Secret Access Key',
  },

  // GitHub
  {
    name: 'github_token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub Personal Access Token',
  },
  {
    name: 'github_oauth',
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub OAuth Token',
  },
  {
    name: 'github_app_token',
    pattern: /ghs_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub App Token',
  },
  {
    name: 'github_refresh_token',
    pattern: /ghr_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'GitHub Refresh Token',
  },

  // Google
  {
    name: 'google_api_key',
    pattern: /AIza[a-zA-Z0-9_\-]{35}/g,
    severity: 'high',
    description: 'Google API Key',
  },
  {
    name: 'google_oauth',
    pattern: /[0-9]+-[a-zA-Z0-9_]{32}\.apps\.googleusercontent\.com/g,
    severity: 'high',
    description: 'Google OAuth Client ID',
  },

  // Slack
  {
    name: 'slack_token',
    pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
    severity: 'high',
    description: 'Slack Token',
  },
  {
    name: 'slack_webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
    severity: 'high',
    description: 'Slack Webhook URL',
  },

  // JWT
  {
    name: 'jwt_secret',
    pattern: /(?:jwt|token)[_-]?secret\s*[:=]\s*["']([^"']{20,})["']/gi,
    severity: 'high',
    description: 'JWT Secret',
  },

  // Database
  {
    name: 'database_url',
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/gi,
    severity: 'critical',
    description: 'Database connection string with credentials',
  },

  // Private keys
  {
    name: 'private_key_rsa',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'RSA Private key detected',
  },
  {
    name: 'private_key_ec',
    pattern: /-----BEGIN EC PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'EC Private key detected',
  },
  {
    name: 'private_key_dsa',
    pattern: /-----BEGIN DSA PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'DSA Private key detected',
  },
  {
    name: 'private_key_openssh',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'OpenSSH Private key detected',
  },
  {
    name: 'private_key_generic',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'Private key detected',
  },

  // Generic password
  {
    name: 'hardcoded_password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'](?!.*\{\{)(?!.*process\.env)(?!.*\$\{)([^"']{8,})["']/gi,
    severity: 'high',
    description: 'Hardcoded password',
  },

  // Anthropic
  {
    name: 'anthropic_api_key',
    pattern: /sk-ant-[a-zA-Z0-9_\-]{80,}/g,
    severity: 'critical',
    description: 'Anthropic API Key',
  },

  // OpenAI
  {
    name: 'openai_api_key',
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    severity: 'critical',
    description: 'OpenAI API Key',
  },

  // SendGrid
  {
    name: 'sendgrid_api_key',
    pattern: /SG\.[a-zA-Z0-9_\-]{22,}\.[a-zA-Z0-9_\-]{43,}/g,
    severity: 'critical',
    description: 'SendGrid API Key',
  },

  // Twilio
  {
    name: 'twilio_api_key',
    pattern: /SK[a-f0-9]{32}/g,
    severity: 'critical',
    description: 'Twilio API Key',
  },

  // Mailchimp
  {
    name: 'mailchimp_api_key',
    pattern: /[a-f0-9]{32}-us[0-9]{1,2}/g,
    severity: 'high',
    description: 'Mailchimp API Key',
  },

  // NPM
  {
    name: 'npm_token',
    pattern: /npm_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    description: 'NPM Token',
  },

  // Heroku
  {
    name: 'heroku_api_key',
    pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g,
    severity: 'high',
    description: 'Possible Heroku API Key (UUID format)',
  },

  // Firebase
  {
    name: 'firebase_key',
    pattern: /AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}/g,
    severity: 'critical',
    description: 'Firebase Cloud Messaging Key',
  },

  // Discord
  {
    name: 'discord_token',
    pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g,
    severity: 'critical',
    description: 'Discord Bot Token',
  },
  {
    name: 'discord_webhook',
    pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/g,
    severity: 'high',
    description: 'Discord Webhook URL',
  },
];

/*
 * ============================================================================
 * FONCTIONS DE SCAN
 * ============================================================================
 */

/**
 * Masquer un secret pour les logs
 */
function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }

  return secret.substring(0, 4) + '****' + secret.substring(secret.length - 4);
}

/**
 * Scanner le contenu pour détecter des secrets
 */
export function scanForSecrets(content: string, filename?: string): SecretScanResult {
  const findings: SecretFinding[] = [];
  const lines = content.split('\n');

  for (const { name, pattern, severity, description } of SECRET_PATTERNS) {
    // Reset lastIndex pour les regex globales
    pattern.lastIndex = 0;

    let match;

    while ((match = pattern.exec(content)) !== null) {
      // Trouver la ligne et colonne
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      // Masquer le secret dans le log
      const maskedMatch = maskSecret(match[0]);

      findings.push({
        type: name,
        severity,
        description,
        line: lineNumber,
        column,
        match: maskedMatch,
      });

      logger.warn(`Secret detected: ${name}`, {
        file: filename,
        line: lineNumber,
        severity,
      });
    }
  }

  return {
    hasSecrets: findings.length > 0,
    findings,
  };
}

/**
 * Vérifier si le contenu est autorisé à être écrit
 * Bloque si des secrets critiques sont détectés
 */
export function validateContentForSecrets(
  content: string,
  filename?: string,
  options?: { allowHighSeverity?: boolean },
): { allowed: boolean; reason?: string; findings: SecretFinding[] } {
  const scanResult = scanForSecrets(content, filename);

  if (!scanResult.hasSecrets) {
    return { allowed: true, findings: [] };
  }

  const criticalFindings = scanResult.findings.filter((f) => f.severity === 'critical');
  const highFindings = scanResult.findings.filter((f) => f.severity === 'high');

  // Toujours bloquer les secrets critiques
  if (criticalFindings.length > 0) {
    return {
      allowed: false,
      reason: `CRITICAL: ${criticalFindings.length} secret(s) critique(s) détecté(s): ${criticalFindings.map((f) => f.type).join(', ')}`,
      findings: scanResult.findings,
    };
  }

  // Bloquer les secrets high severity sauf si explicitement autorisé
  if (highFindings.length > 0 && !options?.allowHighSeverity) {
    return {
      allowed: false,
      reason: `WARNING: ${highFindings.length} secret(s) détecté(s): ${highFindings.map((f) => f.type).join(', ')}`,
      findings: scanResult.findings,
    };
  }

  return { allowed: true, findings: scanResult.findings };
}

/**
 * Suggérer des corrections pour les secrets détectés
 */
export function suggestSecretFixes(findings: SecretFinding[]): string[] {
  const suggestions: string[] = [];

  for (const finding of findings) {
    switch (finding.type) {
      case 'generic_api_key':
      case 'anthropic_api_key':
      case 'openai_api_key':
        suggestions.push(`Remplacer par: process.env.API_KEY ou process.env.${finding.type.toUpperCase()}`);
        break;
      case 'stripe_secret_key':
      case 'stripe_publishable_key':
        suggestions.push(`Remplacer par: process.env.STRIPE_SECRET_KEY ou process.env.STRIPE_PUBLISHABLE_KEY`);
        break;
      case 'aws_access_key':
      case 'aws_secret_key':
        suggestions.push(`Utiliser AWS SDK avec credentials provider au lieu de hardcoder`);
        break;
      case 'database_url':
        suggestions.push(`Remplacer par: process.env.DATABASE_URL`);
        break;
      case 'hardcoded_password':
        suggestions.push(`Utiliser process.env pour les credentials`);
        break;
      case 'github_token':
      case 'github_oauth':
        suggestions.push(`Utiliser process.env.GITHUB_TOKEN`);
        break;
      case 'private_key_rsa':
      case 'private_key_ec':
      case 'private_key_dsa':
      case 'private_key_openssh':
      case 'private_key_generic':
        suggestions.push(`Stocker la clé privée dans un fichier séparé référencé par variable d'environnement`);
        break;
      default:
        suggestions.push(`Déplacer ce secret dans les variables d'environnement: process.env.${finding.type.toUpperCase()}`);
    }
  }

  return [...new Set(suggestions)]; // Dédupliquer
}

/**
 * Formater un rapport de scan pour l'affichage
 */
export function formatScanReport(result: SecretScanResult, filename?: string): string {
  if (!result.hasSecrets) {
    return 'No secrets detected.';
  }

  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    SECRET SCAN REPORT                         ',
    '═══════════════════════════════════════════════════════════════',
    '',
  ];

  if (filename) {
    lines.push(`File: ${filename}`);
    lines.push('');
  }

  lines.push(`Total secrets found: ${result.findings.length}`);
  lines.push('');

  // Group by severity
  const critical = result.findings.filter((f) => f.severity === 'critical');
  const high = result.findings.filter((f) => f.severity === 'high');
  const medium = result.findings.filter((f) => f.severity === 'medium');

  if (critical.length > 0) {
    lines.push('🔴 CRITICAL:');

    for (const f of critical) {
      lines.push(`  Line ${f.line}: ${f.type} - ${f.description}`);
      lines.push(`           Match: ${f.match}`);
    }

    lines.push('');
  }

  if (high.length > 0) {
    lines.push('🟠 HIGH:');

    for (const f of high) {
      lines.push(`  Line ${f.line}: ${f.type} - ${f.description}`);
      lines.push(`           Match: ${f.match}`);
    }

    lines.push('');
  }

  if (medium.length > 0) {
    lines.push('🟡 MEDIUM:');

    for (const f of medium) {
      lines.push(`  Line ${f.line}: ${f.type} - ${f.description}`);
      lines.push(`           Match: ${f.match}`);
    }

    lines.push('');
  }

  // Add suggestions
  const suggestions = suggestSecretFixes(result.findings);

  if (suggestions.length > 0) {
    lines.push('Suggestions:');

    for (const s of suggestions) {
      lines.push(`  - ${s}`);
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}
