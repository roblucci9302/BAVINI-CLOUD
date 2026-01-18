/**
 * Sanitization des prompts utilisateur
 *
 * Ce module protège contre les attaques d'injection de prompts
 * (prompt injection) qui peuvent être utilisées pour:
 * - Contourner les instructions système (jailbreak)
 * - Extraire des informations sensibles
 * - Exécuter des commandes non autorisées
 *
 * @module agents/security/prompt-sanitizer
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PromptSanitizer');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Résultat de la sanitization d'un prompt
 */
export interface SanitizationResult {
  /** Prompt sanitizé */
  sanitized: string;

  /** Le prompt a-t-il été modifié ? */
  wasModified: boolean;

  /** Patterns détectés */
  detectedPatterns: DetectedPattern[];

  /** Le prompt est-il potentiellement malveillant ? */
  isSuspicious: boolean;

  /** Score de risque (0-100) */
  riskScore: number;
}

/**
 * Pattern d'injection détecté
 */
export interface DetectedPattern {
  /** Nom du pattern */
  name: string;

  /** Description */
  description: string;

  /** Sévérité */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Position dans le texte */
  position?: number;

  /** Match trouvé (tronqué pour la sécurité) */
  match?: string;
}

/**
 * Configuration de la sanitization
 */
export interface SanitizationConfig {
  /** Mode: 'strict' bloque les prompts suspects, 'permissive' les nettoie */
  mode: 'strict' | 'permissive';

  /** Bloquer si le score de risque dépasse ce seuil */
  riskThreshold: number;

  /** Patterns personnalisés à détecter */
  customPatterns?: InjectionPattern[];

  /** Autoriser les caractères de contrôle */
  allowControlCharacters?: boolean;

  /** Longueur maximale du prompt */
  maxLength?: number;
}

/**
 * Pattern d'injection
 */
export interface InjectionPattern {
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  riskPoints: number;
}

/*
 * ============================================================================
 * PATTERNS D'INJECTION
 * ============================================================================
 */

/**
 * Patterns d'injection de prompts connus
 */
const INJECTION_PATTERNS: InjectionPattern[] = [
  // Tentatives de reset/override des instructions
  {
    name: 'instruction_override',
    pattern: /(?:ignore|forget|disregard)\s+(?:all|previous|prior|above|your|the)\s+(?:instructions?|rules?|prompts?|guidelines?|constraints?)/gi,
    severity: 'critical',
    description: 'Attempt to override system instructions',
    riskPoints: 40,
  },
  {
    name: 'new_instructions',
    pattern: /(?:new|different|updated|real|actual|true)\s+(?:instructions?|rules?|guidelines?|mission|objective)/gi,
    severity: 'high',
    description: 'Attempt to inject new instructions',
    riskPoints: 30,
  },
  {
    name: 'role_switch',
    pattern: /(?:you\s+are\s+(?:now|actually)|pretend\s+(?:you\s+are|to\s+be)|act\s+as|roleplay\s+as|become)/gi,
    severity: 'high',
    description: 'Attempt to change AI role',
    riskPoints: 25,
  },
  {
    name: 'system_prompt_leak',
    pattern: /(?:show|reveal|display|output|print|tell\s+me|what\s+(?:is|are))\s+(?:your|the)\s+(?:system|hidden|initial|original|full)\s+(?:prompt|instructions?|message|rules?)/gi,
    severity: 'high',
    description: 'Attempt to extract system prompt',
    riskPoints: 30,
  },

  // Marqueurs de délimitation suspects
  {
    name: 'fake_delimiter',
    pattern: /(?:\[SYSTEM\]|\[ADMIN\]|\[OVERRIDE\]|\[END\s+SYSTEM\]|\[\/INST\]|<\/?(?:system|admin|instructions?)>)/gi,
    severity: 'critical',
    description: 'Fake system delimiter detected',
    riskPoints: 45,
  },
  {
    name: 'xml_injection',
    pattern: /<\/?(?:prompt|instructions|context|system|user|assistant|human|ai)[^>]*>/gi,
    severity: 'high',
    description: 'XML tag injection attempt',
    riskPoints: 25,
  },

  // Techniques d'encodage/obfuscation
  {
    name: 'base64_injection',
    pattern: /(?:decode|interpret|execute|run|eval)\s+(?:this|the\s+following)\s+(?:base64|encoded|hex)/gi,
    severity: 'high',
    description: 'Encoded payload injection',
    riskPoints: 30,
  },
  {
    name: 'unicode_escape',
    pattern: /\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/g,
    severity: 'medium',
    description: 'Unicode escape sequence (potential obfuscation)',
    riskPoints: 15,
  },

  // Demandes de contournement de sécurité
  {
    name: 'disable_safety',
    pattern: /(?:disable|turn\s+off|remove|bypass|ignore)\s+(?:safety|security|filters?|restrictions?|limitations?|guardrails?)/gi,
    severity: 'critical',
    description: 'Attempt to disable safety measures',
    riskPoints: 50,
  },
  {
    name: 'developer_mode',
    pattern: /(?:developer|dev|admin|debug|test|maintenance)\s+mode/gi,
    severity: 'high',
    description: 'Developer mode activation attempt',
    riskPoints: 25,
  },
  {
    name: 'jailbreak_keyword',
    pattern: /(?:DAN|jailbreak|uncensor|unfiltered|unrestricted|no\s+limits|without\s+restrictions)/gi,
    severity: 'critical',
    description: 'Known jailbreak keyword detected',
    riskPoints: 45,
  },

  // Manipulation de contexte
  {
    name: 'context_manipulation',
    pattern: /(?:from\s+now\s+on|starting\s+now|henceforth|going\s+forward)\s+(?:you\s+will|always|never)/gi,
    severity: 'medium',
    description: 'Context manipulation attempt',
    riskPoints: 20,
  },
  {
    name: 'hypothetical_scenario',
    pattern: /(?:hypothetically|in\s+theory|theoretically|imagine\s+(?:if|that)|what\s+if)\s+(?:you\s+(?:could|were|had)|there\s+were\s+no)/gi,
    severity: 'low',
    description: 'Hypothetical scenario (potential bypass)',
    riskPoints: 10,
  },

  // Exécution de code cachée
  {
    name: 'hidden_command',
    pattern: /(?:execute|run|eval)\s*\([^)]*\)|`[^`]+`|{{[^}]+}}/gi,
    severity: 'high',
    description: 'Hidden command execution pattern',
    riskPoints: 30,
  },

  // Répétition suspecte (technique de persuasion)
  {
    name: 'repetition_attack',
    pattern: /(.{10,}?)\1{4,}/g,
    severity: 'medium',
    description: 'Suspicious repetition pattern',
    riskPoints: 15,
  },

  // Demandes de génération de contenu malveillant
  {
    name: 'malware_request',
    pattern: /(?:write|create|generate|code)\s+(?:a|an|some)?\s*(?:malware|virus|ransomware|keylogger|exploit|backdoor|trojan)/gi,
    severity: 'critical',
    description: 'Request for malware generation',
    riskPoints: 50,
  },
];

/*
 * ============================================================================
 * CONFIGURATION PAR DÉFAUT
 * ============================================================================
 */

const DEFAULT_CONFIG: SanitizationConfig = {
  mode: 'permissive',
  riskThreshold: 50,
  allowControlCharacters: false,
  maxLength: 100000, // 100K caractères
};

/*
 * ============================================================================
 * FONCTIONS DE SANITIZATION
 * ============================================================================
 */

/**
 * Nettoyer les caractères de contrôle invisibles
 */
function removeControlCharacters(text: string): string {
  // Garder les caractères normaux (tab, newline, carriage return)
  // Supprimer les caractères de contrôle invisibles (C0, C1, etc.)
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // C0 controls (sauf \t \n \r)
    .replace(/[\u0080-\u009F]/g, '') // C1 controls
    .replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F]/g, '') // Caractères invisibles Unicode
    .replace(/[\uFEFF\uFFF9-\uFFFB]/g, ''); // BOM et autres
}

/**
 * Normaliser les espaces multiples
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n') // Normaliser les fins de ligne
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ') // Espaces multiples -> un seul
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines consécutifs
    .trim();
}

/**
 * Détecter les patterns d'injection dans un texte
 */
function detectPatterns(text: string, patterns: InjectionPattern[]): DetectedPattern[] {
  const detected: DetectedPattern[] = [];

  for (const pattern of patterns) {
    // Reset lastIndex pour les regex globales
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(text)) !== null) {
      detected.push({
        name: pattern.name,
        description: pattern.description,
        severity: pattern.severity,
        position: match.index,
        match: match[0].substring(0, 50) + (match[0].length > 50 ? '...' : ''),
      });

      // Éviter les boucles infinies pour les patterns sans groupe
      if (match.index === pattern.pattern.lastIndex) {
        pattern.pattern.lastIndex++;
      }
    }
  }

  return detected;
}

/**
 * Calculer le score de risque basé sur les patterns détectés
 */
function calculateRiskScore(detectedPatterns: DetectedPattern[], patterns: InjectionPattern[]): number {
  let score = 0;

  for (const detected of detectedPatterns) {
    const patternDef = patterns.find((p) => p.name === detected.name);
    if (patternDef) {
      score += patternDef.riskPoints;
    }
  }

  // Plafonner à 100
  return Math.min(score, 100);
}

/**
 * Sanitizer un prompt utilisateur
 *
 * @param prompt - Le prompt brut de l'utilisateur
 * @param config - Configuration de sanitization (optionnel)
 * @returns Résultat de la sanitization
 */
export function sanitizePrompt(prompt: string, config: Partial<SanitizationConfig> = {}): SanitizationResult {
  const effectiveConfig: SanitizationConfig = { ...DEFAULT_CONFIG, ...config };
  const allPatterns = [...INJECTION_PATTERNS, ...(effectiveConfig.customPatterns || [])];

  let sanitized = prompt;
  let wasModified = false;

  // 1. Vérifier la longueur
  if (effectiveConfig.maxLength && sanitized.length > effectiveConfig.maxLength) {
    sanitized = sanitized.substring(0, effectiveConfig.maxLength);
    wasModified = true;
    logger.warn('Prompt truncated', { originalLength: prompt.length, maxLength: effectiveConfig.maxLength });
  }

  // 2. Nettoyer les caractères de contrôle si non autorisés
  if (!effectiveConfig.allowControlCharacters) {
    const cleaned = removeControlCharacters(sanitized);
    if (cleaned !== sanitized) {
      wasModified = true;
      sanitized = cleaned;
    }
  }

  // 3. Normaliser les espaces
  const normalized = normalizeWhitespace(sanitized);
  if (normalized !== sanitized) {
    wasModified = true;
    sanitized = normalized;
  }

  // 4. Détecter les patterns d'injection
  const detectedPatterns = detectPatterns(sanitized, allPatterns);

  // 5. Calculer le score de risque
  const riskScore = calculateRiskScore(detectedPatterns, allPatterns);
  const isSuspicious = riskScore >= effectiveConfig.riskThreshold;

  // Log si des patterns suspects sont détectés
  if (detectedPatterns.length > 0) {
    logger.warn('Injection patterns detected', {
      patternCount: detectedPatterns.length,
      riskScore,
      isSuspicious,
      patterns: detectedPatterns.map((p) => p.name),
    });
  }

  return {
    sanitized,
    wasModified,
    detectedPatterns,
    isSuspicious,
    riskScore,
  };
}

/**
 * Vérifier si un prompt est sûr à traiter
 *
 * @param prompt - Le prompt à vérifier
 * @param config - Configuration de sanitization
 * @returns { safe: boolean, reason?: string, result: SanitizationResult }
 */
export function isPromptSafe(
  prompt: string,
  config: Partial<SanitizationConfig> = {},
): { safe: boolean; reason?: string; result: SanitizationResult } {
  const result = sanitizePrompt(prompt, config);

  if (result.isSuspicious) {
    const criticalPatterns = result.detectedPatterns.filter((p) => p.severity === 'critical');
    const highPatterns = result.detectedPatterns.filter((p) => p.severity === 'high');

    let reason = `Prompt risk score: ${result.riskScore}/100.`;

    if (criticalPatterns.length > 0) {
      reason += ` Critical patterns: ${criticalPatterns.map((p) => p.name).join(', ')}.`;
    }
    if (highPatterns.length > 0) {
      reason += ` High-risk patterns: ${highPatterns.map((p) => p.name).join(', ')}.`;
    }

    return {
      safe: false,
      reason,
      result,
    };
  }

  return {
    safe: true,
    result,
  };
}

/**
 * Obtenir la configuration par défaut
 */
export function getDefaultSanitizationConfig(): SanitizationConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Générer un rapport de sanitization pour les logs
 */
export function formatSanitizationReport(result: SanitizationResult): string {
  const lines: string[] = ['=== PROMPT SANITIZATION REPORT ===', ''];

  lines.push(`Modified: ${result.wasModified ? 'Yes' : 'No'}`);
  lines.push(`Suspicious: ${result.isSuspicious ? 'YES' : 'No'}`);
  lines.push(`Risk Score: ${result.riskScore}/100`);
  lines.push('');

  if (result.detectedPatterns.length > 0) {
    lines.push(`Detected Patterns (${result.detectedPatterns.length}):`);
    for (const pattern of result.detectedPatterns) {
      lines.push(`  [${pattern.severity.toUpperCase()}] ${pattern.name}: ${pattern.description}`);
      if (pattern.match) {
        lines.push(`    Match: "${pattern.match}"`);
      }
    }
  } else {
    lines.push('No injection patterns detected.');
  }

  lines.push('');
  lines.push('================================');

  return lines.join('\n');
}
