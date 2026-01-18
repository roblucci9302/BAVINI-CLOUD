# PLAN DE CORRECTION DU SYSTÈME MULTI-AGENTS BAVINI

**Version:** 1.0
**Date:** 18 Janvier 2026
**Auteur:** Audit Système
**Statut:** À EXÉCUTER

---

## TABLE DES MATIÈRES

1. [Vue d'ensemble](#1-vue-densemble)
2. [Phase 0 - Critiques (P0)](#2-phase-0---critiques-p0)
3. [Phase 1 - Hautes (P1)](#3-phase-1---hautes-p1)
4. [Phase 2 - Moyennes (P2)](#4-phase-2---moyennes-p2)
5. [Phase 3 - Améliorations (P3)](#5-phase-3---améliorations-p3)
6. [Tests et Validation](#6-tests-et-validation)
7. [Checklist de Déploiement](#7-checklist-de-déploiement)

---

## 1. VUE D'ENSEMBLE

### 1.1 Résumé des Problèmes

| Catégorie | Critiques | Majeurs | Mineurs | Total |
|-----------|-----------|---------|---------|-------|
| Architecture Core | 3 | 8 | 4 | 15 |
| Agents Individuels | 1 | 6 | 3 | 10 |
| Orchestration | 2 | 3 | 2 | 7 |
| Outils | 2 | 4 | 3 | 9 |
| Gestion d'Erreurs | 2 | 4 | 2 | 8 |
| Sécurité | 4 | 6 | 3 | 13 |
| **TOTAL** | **14** | **31** | **17** | **62** |

### 1.2 Planning Global

```
Phase 0 (P0) : 3-4 jours  → Problèmes CRITIQUES bloquants
Phase 1 (P1) : 5-7 jours  → Problèmes MAJEURS importants
Phase 2 (P2) : 5-7 jours  → Problèmes MOYENS d'optimisation
Phase 3 (P3) : 3-5 jours  → Améliorations et polish
Tests       : 2-3 jours  → Validation complète
─────────────────────────────────────────────────────
TOTAL ESTIMÉ: 18-26 jours (4-6 semaines)
```

### 1.3 Ordre d'Exécution

```
JOUR 1-2   : P0.1 → P0.3 (Configuration agents + Race conditions)
JOUR 3-4   : P0.4 → P0.7 (Sécurité critique)
JOUR 5-7   : P1.1 → P1.4 (Harmonisation + Handlers)
JOUR 8-11  : P1.5 → P1.7 (Orchestration + Validation)
JOUR 12-14 : P2.1 → P2.3 (Refactoring core)
JOUR 15-18 : P2.4 → P2.6 (Recovery + Logging)
JOUR 19-21 : P3.* (Améliorations)
JOUR 22-24 : Tests + Validation
```

---

## 2. PHASE 0 - CRITIQUES (P0)

> **Objectif:** Corriger les problèmes bloquants qui peuvent causer des crashes, des boucles infinies, ou des failles de sécurité exploitables.

---

### P0.1 - Ajouter timeout et maxRetries aux 6 agents

**Priorité:** 🔴 CRITIQUE
**Effort:** 2 heures
**Fichiers:**
- `app/lib/agents/agents/coder-agent.ts`
- `app/lib/agents/agents/builder-agent.ts`
- `app/lib/agents/agents/tester-agent.ts`
- `app/lib/agents/agents/deployer-agent.ts`
- `app/lib/agents/agents/reviewer-agent.ts`
- `app/lib/agents/agents/fixer-agent.ts`

**Problème:**
6 agents n'ont pas de timeout ni de maxRetries définis. Ils héritent des valeurs par défaut de BaseAgent qui peuvent être inadaptées, causant des boucles infinies ou des comportements non déterministes.

**Solution:**
Ajouter explicitement `timeout` et `maxRetries` dans le constructeur de chaque agent.

**Code à modifier:**

```typescript
// ============================================
// coder-agent.ts - Ligne 54-65
// ============================================
constructor() {
  super({
    name: 'coder',
    description: 'Agent de codage...',
    model: getModelForAgent('coder'),
    tools: [...READ_TOOLS, ...WRITE_TOOLS, ...DESIGN_TOOLS, ...INSPECT_TOOLS, ...INTEGRATION_TOOLS],
    systemPrompt: CODER_SYSTEM_PROMPT,
    maxTokens: 32768,
    temperature: 0.1,
    timeout: 180000,      // ← AJOUTER: 3 minutes
    maxRetries: 2,        // ← AJOUTER
  });
}

// ============================================
// builder-agent.ts - Ligne 34-45
// ============================================
constructor() {
  super({
    name: 'builder',
    description: 'Agent de build...',
    model: getModelForAgent('builder'),
    tools: SHELL_TOOLS,
    systemPrompt: BUILDER_SYSTEM_PROMPT,
    maxTokens: 16384,
    temperature: 0.1,
    timeout: 300000,      // ← AJOUTER: 5 minutes (builds peuvent être longs)
    maxRetries: 2,        // ← AJOUTER
  });
}

// ============================================
// tester-agent.ts - Ligne 33-44
// ============================================
constructor() {
  super({
    name: 'tester',
    description: 'Agent de test...',
    model: getModelForAgent('tester'),
    tools: TEST_TOOLS,
    systemPrompt: TESTER_SYSTEM_PROMPT,
    maxTokens: 16384,
    temperature: 0.1,
    timeout: 300000,      // ← AJOUTER: 5 minutes (tests peuvent être longs)
    maxRetries: 2,        // ← AJOUTER
  });
}

// ============================================
// deployer-agent.ts - Ligne 45-56
// ============================================
constructor() {
  super({
    name: 'deployer',
    description: 'Agent de déploiement...',
    model: getModelForAgent('deployer'),
    tools: GIT_TOOLS,
    systemPrompt: DEPLOYER_SYSTEM_PROMPT,
    maxTokens: 16384,
    temperature: 0.1,
    timeout: 180000,      // ← AJOUTER: 3 minutes
    maxRetries: 2,        // ← AJOUTER
  });
}

// ============================================
// reviewer-agent.ts - Ligne 120-131
// ============================================
constructor(config?: ReviewerAgentConfig) {
  super({
    name: 'reviewer',
    description: 'Agent de review...',
    model: getModelForAgent('reviewer'),
    tools: [...REVIEW_TOOLS, ...READ_TOOLS],
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    maxTokens: 16384,
    temperature: 0.2,
    timeout: 180000,      // ← AJOUTER: 3 minutes
    maxRetries: 2,        // ← AJOUTER
  });
  // ... rest of constructor
}

// ============================================
// fixer-agent.ts - Ligne 182-197
// ============================================
constructor(config?: FixerAgentConfig) {
  super({
    name: 'fixer',
    description: 'Agent de correction...',
    model: getModelForAgent('fixer'),
    tools: [...READ_TOOLS, ...WRITE_TOOLS],
    systemPrompt: FIXER_SYSTEM_PROMPT,
    maxTokens: 32768,
    temperature: 0.1,
    timeout: 240000,      // ← AJOUTER: 4 minutes (fixes peuvent être complexes)
    maxRetries: 3,        // ← AJOUTER: 3 retries pour les fixes
  });
  // ... rest of constructor
}
```

**Validation:**
```bash
# Vérifier que tous les agents ont timeout et maxRetries
grep -n "timeout:" app/lib/agents/agents/*.ts
grep -n "maxRetries:" app/lib/agents/agents/*.ts
```

---

### P0.2 - Corriger Promise.all() dans BaseAgent

**Priorité:** 🔴 CRITIQUE
**Effort:** 1 heure
**Fichier:** `app/lib/agents/core/base-agent.ts`

**Problème (Ligne 892-902):**
`Promise.all()` échoue dès qu'une Promise échoue, abandonnant les autres outils en cours d'exécution. Les ressources ne sont pas libérées.

**Solution:**
Utiliser `Promise.allSettled()` pour gérer les erreurs partielles.

**Code actuel:**
```typescript
// Ligne 892-902
const toolResults: ToolResult[] = await Promise.all(
  toolCalls.map(async (toolCall) => {
    const result = await this.executeTool(toolCall.name, toolCall.input);
    return {
      type: 'tool_result' as const,
      tool_use_id: toolCall.id,
      content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
      is_error: !result.success,
    };
  }),
);
```

**Code corrigé:**
```typescript
// Ligne 892-920 (remplacer)
const toolSettledResults = await Promise.allSettled(
  toolCalls.map(async (toolCall) => {
    const result = await this.executeTool(toolCall.name, toolCall.input);
    return {
      toolCall,
      result,
    };
  }),
);

const toolResults: ToolResult[] = toolSettledResults.map((settled, index) => {
  const toolCall = toolCalls[index];

  if (settled.status === 'fulfilled') {
    const { result } = settled.value;
    return {
      type: 'tool_result' as const,
      tool_use_id: toolCall.id,
      content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
      is_error: !result.success,
    };
  } else {
    // Outil a échoué avec une exception
    this.log('error', `Tool ${toolCall.name} threw exception`, {
      error: settled.reason,
      toolId: toolCall.id
    });
    return {
      type: 'tool_result' as const,
      tool_use_id: toolCall.id,
      content: `Tool execution failed: ${settled.reason?.message || 'Unknown error'}`,
      is_error: true,
    };
  }
});

// Log le résumé des exécutions
const failedTools = toolSettledResults.filter(r => r.status === 'rejected');
if (failedTools.length > 0) {
  this.log('warn', `${failedTools.length}/${toolCalls.length} tools failed with exceptions`);
}
```

**Validation:**
```typescript
// Test unitaire à ajouter
describe('BaseAgent.executeToolCalls', () => {
  it('should handle partial tool failures gracefully', async () => {
    // Mock 3 tools: 2 succeed, 1 throws
    const results = await agent.executeToolCalls([...]);
    expect(results).toHaveLength(3);
    expect(results.filter(r => r.is_error)).toHaveLength(1);
  });
});
```

---

### P0.3 - Corriger race condition lazy agent dans Registry

**Priorité:** 🔴 CRITIQUE
**Effort:** 2 heures
**Fichier:** `app/lib/agents/core/agent-registry.ts`

**Problème (Ligne 406-432):**
Si deux coroutines appellent `get('coder')` simultanément et que 'coder' est lazy, `loadLazyAgent()` sera appelé deux fois, créant deux instances.

**Solution:**
Ajouter un mutex ou un système de promesses partagées pour le chargement lazy.

**Code à ajouter:**

```typescript
// Ajouter en haut du fichier (après les imports)
import { SimpleMutex } from '../utils/mutex'; // ou créer si n'existe pas

// Ajouter comme propriété de classe (après ligne 120)
private lazyLoadMutexes: Map<AgentType, SimpleMutex> = new Map();
private lazyLoadPromises: Map<AgentType, Promise<BaseAgent | null>> = new Map();

// Remplacer la méthode get() (lignes 406-440)
get(name: AgentType): BaseAgent | undefined {
  // Vérifier d'abord le cache direct
  const registered = this.agents.get(name);
  if (registered) {
    registered.lastUsedAt = new Date();
    registered.usageCount++;
    return registered.agent;
  }

  // Vérifier si un chargement lazy est déjà en cours
  // Note: get() est synchrone, donc on ne peut pas attendre ici
  // On retourne undefined et le caller doit utiliser getAsync()
  const lazyInfo = this.lazyAgents.get(name);
  if (lazyInfo && !lazyInfo.isLoaded) {
    logger.warn(`Lazy agent ${name} not loaded yet. Use getAsync() for lazy agents.`);
    return undefined;
  }

  return undefined;
}

// Ajouter nouvelle méthode getAsync()
async getAsync(name: AgentType): Promise<BaseAgent | undefined> {
  // Vérifier d'abord le cache direct
  const registered = this.agents.get(name);
  if (registered) {
    registered.lastUsedAt = new Date();
    registered.usageCount++;
    return registered.agent;
  }

  // Vérifier si c'est un agent lazy
  const lazyInfo = this.lazyAgents.get(name);
  if (!lazyInfo) {
    return undefined;
  }

  // Si déjà chargé, retourner
  if (lazyInfo.isLoaded) {
    const loadedAgent = this.agents.get(name);
    if (loadedAgent) {
      loadedAgent.lastUsedAt = new Date();
      loadedAgent.usageCount++;
      return loadedAgent.agent;
    }
  }

  // Vérifier si un chargement est déjà en cours
  const existingPromise = this.lazyLoadPromises.get(name);
  if (existingPromise) {
    return existingPromise;
  }

  // Créer une nouvelle promesse de chargement
  const loadPromise = this.loadLazyAgentSafe(name);
  this.lazyLoadPromises.set(name, loadPromise);

  try {
    const agent = await loadPromise;
    return agent ?? undefined;
  } finally {
    // Nettoyer la promesse après chargement
    this.lazyLoadPromises.delete(name);
  }
}

// Ajouter méthode de chargement sécurisée
private async loadLazyAgentSafe(name: AgentType): Promise<BaseAgent | null> {
  const lazyInfo = this.lazyAgents.get(name);
  if (!lazyInfo) {
    return null;
  }

  // Double-check après avoir obtenu le "lock" implicite de la promesse
  if (lazyInfo.isLoaded) {
    const agent = this.agents.get(name);
    return agent?.agent ?? null;
  }

  try {
    logger.debug(`Loading lazy agent: ${name}`);
    const agent = lazyInfo.factory();

    if (agent) {
      this.register(agent);
      lazyInfo.isLoaded = true;
      lazyInfo.loadedAt = new Date();
      logger.info(`Lazy agent loaded: ${name}`);
      return agent;
    }

    return null;
  } catch (error) {
    logger.error(`Failed to load lazy agent ${name}:`, error);
    return null;
  }
}
```

**Mise à jour des appelants:**
```typescript
// Dans task-queue.ts et autres fichiers qui utilisent registry.get()
// Remplacer:
const agent = this.registry.get(agentType);

// Par:
const agent = await this.registry.getAsync(agentType);
```

---

### P0.4 - Activer Dry-Run par défaut

**Priorité:** 🔴 CRITIQUE
**Effort:** 1 heure
**Fichiers:**
- `app/lib/agents/utils/dry-run.ts`
- `app/lib/agents/index.ts`

**Problème:**
Le dry-run est désactivé par défaut (`enabled = false`). Les opérations destructrices s'exécutent réellement sans demande de confirmation.

**Solution:**
Activer le dry-run par défaut en développement/staging, avec possibilité de désactiver en production.

**Code à modifier:**

```typescript
// ============================================
// dry-run.ts - Ligne 131 et suivantes
// ============================================

// Ajouter détection de l'environnement
const isDevelopment = process.env.NODE_ENV !== 'production';

// Modifier le constructeur
constructor(config: Partial<DryRunConfig> = {}) {
  this.configure({
    enabled: isDevelopment,  // ← Activé par défaut en dev
    blockIrreversible: true,
    logOperations: true,
    ...config,
  });
}

// ============================================
// Ajouter intégration dans les handlers d'outils
// write-tools.ts - Dans chaque handler
// ============================================

import { simulateIfDryRun, isDryRunEnabled } from '../utils/dry-run';

// Exemple pour write_file handler
write_file: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
  const path = input.path as string;
  const content = input.content as string;

  // Vérifier dry-run AVANT toute opération
  if (isDryRunEnabled()) {
    const simulated = simulateIfDryRun('file_write', {
      path,
      contentLength: content.length,
    });
    if (simulated) {
      return {
        success: true,
        output: simulated,
      };
    }
  }

  // Validation existante...
  const validation = validatePath(path);
  // ... reste du code
}
```

**Fichiers à mettre à jour:**
- `app/lib/agents/tools/write-tools.ts` - Tous les handlers
- `app/lib/agents/tools/shell-tools.ts` - Commandes destructrices
- `app/lib/agents/tools/git-tools.ts` - push, commit, etc.

---

### P0.5 - Ajouter scan des secrets hardcodés

**Priorité:** 🔴 CRITIQUE
**Effort:** 3 heures
**Fichiers:**
- Créer: `app/lib/agents/security/secret-scanner.ts`
- Modifier: `app/lib/agents/tools/write-tools.ts`

**Problème:**
Aucun scan n'est effectué pour détecter les secrets hardcodés (clés API, tokens) dans le code créé par les agents.

**Solution:**
Créer un scanner de secrets et l'intégrer dans write_file et edit_file.

**Nouveau fichier `secret-scanner.ts`:**

```typescript
/**
 * Scanner de secrets hardcodés
 * Détecte les clés API, tokens, et credentials dans le code
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SecretScanner');

/**
 * Patterns de secrets connus
 */
export const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}> = [
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

  // Google
  {
    name: 'google_api_key',
    pattern: /AIza[a-zA-Z0-9_\-]{35}/g,
    severity: 'high',
    description: 'Google API Key',
  },

  // Slack
  {
    name: 'slack_token',
    pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
    severity: 'high',
    description: 'Slack Token',
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
    pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^\s"']+/gi,
    severity: 'critical',
    description: 'Database connection string with credentials',
  },

  // Private keys
  {
    name: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'Private key detected',
  },

  // Generic password
  {
    name: 'hardcoded_password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'](?!.*\{\{)(?!.*process\.env)([^"']{8,})["']/gi,
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
];

/**
 * Résultat d'un scan de secrets
 */
export interface SecretScanResult {
  hasSecrets: boolean;
  findings: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium';
    description: string;
    line?: number;
    column?: number;
    match: string;
  }>;
}

/**
 * Scanner le contenu pour détecter des secrets
 */
export function scanForSecrets(content: string, filename?: string): SecretScanResult {
  const findings: SecretScanResult['findings'] = [];
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
 * Masquer un secret pour les logs
 */
function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }
  return secret.substring(0, 4) + '****' + secret.substring(secret.length - 4);
}

/**
 * Vérifier si le contenu est autorisé à être écrit
 * Bloque si des secrets critiques sont détectés
 */
export function validateContentForSecrets(
  content: string,
  filename?: string,
  options?: { allowHighSeverity?: boolean }
): { allowed: boolean; reason?: string; findings: SecretScanResult['findings'] } {
  const scanResult = scanForSecrets(content, filename);

  if (!scanResult.hasSecrets) {
    return { allowed: true, findings: [] };
  }

  const criticalFindings = scanResult.findings.filter(f => f.severity === 'critical');
  const highFindings = scanResult.findings.filter(f => f.severity === 'high');

  // Toujours bloquer les secrets critiques
  if (criticalFindings.length > 0) {
    return {
      allowed: false,
      reason: `CRITICAL: ${criticalFindings.length} secret(s) critique(s) détecté(s): ${criticalFindings.map(f => f.type).join(', ')}`,
      findings: scanResult.findings,
    };
  }

  // Bloquer les secrets high severity sauf si explicitement autorisé
  if (highFindings.length > 0 && !options?.allowHighSeverity) {
    return {
      allowed: false,
      reason: `WARNING: ${highFindings.length} secret(s) détecté(s): ${highFindings.map(f => f.type).join(', ')}`,
      findings: scanResult.findings,
    };
  }

  return { allowed: true, findings: scanResult.findings };
}

/**
 * Suggérer des corrections pour les secrets détectés
 */
export function suggestSecretFixes(findings: SecretScanResult['findings']): string[] {
  const suggestions: string[] = [];

  for (const finding of findings) {
    switch (finding.type) {
      case 'generic_api_key':
      case 'anthropic_api_key':
      case 'openai_api_key':
        suggestions.push(`Remplacer par: process.env.API_KEY`);
        break;
      case 'stripe_secret_key':
        suggestions.push(`Remplacer par: process.env.STRIPE_SECRET_KEY`);
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
      default:
        suggestions.push(`Déplacer ce secret dans les variables d'environnement`);
    }
  }

  return [...new Set(suggestions)]; // Dédupliquer
}
```

**Intégration dans write-tools.ts:**

```typescript
// Ajouter l'import
import { validateContentForSecrets, suggestSecretFixes } from '../security/secret-scanner';

// Modifier le handler write_file (après validation du path)
write_file: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
  const path = input.path as string;
  const content = input.content as string;

  // Validation du path existante...
  const pathValidation = validatePath(path);
  if (!pathValidation.valid) {
    return { success: false, output: null, error: pathValidation.error };
  }

  // NOUVEAU: Scan des secrets
  const secretValidation = validateContentForSecrets(content, path);
  if (!secretValidation.allowed) {
    const suggestions = suggestSecretFixes(secretValidation.findings);
    return {
      success: false,
      output: null,
      error: `${secretValidation.reason}\n\nSuggestions:\n${suggestions.map(s => `- ${s}`).join('\n')}`,
    };
  }

  // Log warning si des secrets medium ont été trouvés
  if (secretValidation.findings.length > 0) {
    logger.warn(`Secrets detected but allowed in ${path}`, {
      findings: secretValidation.findings.map(f => f.type),
    });
  }

  // Reste du code...
};
```

---

### P0.6 - Corriger SQL Injection dans integration-tools.ts

**Priorité:** 🔴 CRITIQUE
**Effort:** 1 heure
**Fichier:** `app/lib/agents/tools/integration-tools.ts`

**Problème (Ligne 619):**
Les noms de tables ne sont pas paramétrisés, permettant une injection SQL.

**Code problématique:**
```typescript
const tablesToFetch = (input.tables as string[]) || [];
// ... utilisé directement dans les requêtes
```

**Solution:**

```typescript
// Ajouter une whitelist de tables autorisées
const ALLOWED_TABLES = new Set([
  'users',
  'profiles',
  'settings',
  'projects',
  'files',
  'sessions',
  // Ajouter les tables légitimes
]);

// Valider les tables avant utilisation
function validateTableNames(tables: string[]): { valid: boolean; invalidTables: string[] } {
  const invalidTables = tables.filter(t => {
    // Vérifier whitelist
    if (!ALLOWED_TABLES.has(t.toLowerCase())) {
      return true;
    }
    // Vérifier caractères autorisés (lettres, chiffres, underscore)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) {
      return true;
    }
    return false;
  });

  return {
    valid: invalidTables.length === 0,
    invalidTables,
  };
}

// Modifier le handler get_database_schema
get_database_schema: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
  const tablesToFetch = (input.tables as string[]) || [];

  // Valider les noms de tables
  const validation = validateTableNames(tablesToFetch);
  if (!validation.valid) {
    return {
      success: false,
      output: null,
      error: `Invalid table names: ${validation.invalidTables.join(', ')}. Only alphanumeric characters and underscores are allowed.`,
    };
  }

  // Utiliser les tables validées...
};
```

---

### P0.7 - Bloquer SSRF dans web-tools.ts

**Priorité:** 🔴 CRITIQUE
**Effort:** 1 heure
**Fichier:** `app/lib/agents/tools/web-tools.ts`

**Problème:**
Les URLs internes (localhost, IPs privées) ne sont pas bloquées, permettant des attaques SSRF.

**Solution:**

```typescript
// Ajouter en haut du fichier
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

const PRIVATE_IP_RANGES = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^169\.254\./,              // Link-local
  /^fc00:/i,                  // IPv6 ULA
  /^fe80:/i,                  // IPv6 Link-local
];

function isBlockedUrl(urlString: string): { blocked: boolean; reason?: string } {
  try {
    const url = new URL(urlString);

    // Vérifier les hosts bloqués
    if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
      return { blocked: true, reason: `Blocked host: ${url.hostname}` };
    }

    // Vérifier les IPs privées
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(url.hostname)) {
        return { blocked: true, reason: `Private IP range not allowed: ${url.hostname}` };
      }
    }

    // Bloquer les schémas non-HTTP
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { blocked: true, reason: `Protocol not allowed: ${url.protocol}` };
    }

    return { blocked: false };
  } catch {
    return { blocked: true, reason: 'Invalid URL' };
  }
}

// Modifier les handlers web_search et web_fetch
web_fetch: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
  const url = input.url as string;

  // Vérifier SSRF
  const ssrfCheck = isBlockedUrl(url);
  if (ssrfCheck.blocked) {
    return {
      success: false,
      output: null,
      error: `URL blocked: ${ssrfCheck.reason}`,
    };
  }

  // Reste du code...
};
```

---

## 3. PHASE 1 - HAUTES (P1)

> **Objectif:** Corriger les problèmes majeurs qui impactent la fiabilité et la cohérence du système.

---

### P1.1 - Harmoniser les limites d'historique

**Priorité:** 🟠 HAUTE
**Effort:** 30 minutes
**Fichiers:**
- `app/lib/agents/agents/tester-agent.ts`
- `app/lib/agents/agents/deployer-agent.ts`
- `app/lib/agents/agents/reviewer-agent.ts`
- `app/lib/agents/agents/fixer-agent.ts`

**Problème:**
Les limites d'historique varient de manière incohérente (20, 50, 100).

**Solution:**
Standardiser à 50 pour tous les agents.

```typescript
// Créer une constante partagée dans types.ts
export const AGENT_HISTORY_LIMIT = 50;

// Utiliser dans chaque agent
if (this.testHistory.length > AGENT_HISTORY_LIMIT) {
  this.testHistory = this.testHistory.slice(-AGENT_HISTORY_LIMIT);
}
```

---

### P1.2 - Ajouter timeout aux handlers d'outils

**Priorité:** 🟠 HAUTE
**Effort:** 3 heures
**Fichiers:** Tous les fichiers `*-tools.ts`

**Problème:**
Les handlers d'outils peuvent s'exécuter indéfiniment sans timeout.

**Solution:**
Wrapper les handlers avec un timeout.

```typescript
// Créer un utilitaire dans tools/utils.ts
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

// Wrapper les handlers
const wrappedHandlers: Record<string, ToolHandler> = {};
for (const [name, handler] of Object.entries(handlers)) {
  const timeout = TOOL_TIMEOUTS[name] || DEFAULT_TOOL_TIMEOUT;
  wrappedHandlers[name] = async (input) => {
    return withTimeout(handler(input), timeout, name);
  };
}
```

**Timeouts recommandés:**
```typescript
const TOOL_TIMEOUTS: Record<string, number> = {
  // Read tools
  read_file: 5000,      // 5s
  grep: 10000,          // 10s
  glob: 10000,          // 10s
  list_directory: 5000, // 5s

  // Write tools
  write_file: 10000,    // 10s
  edit_file: 10000,     // 10s
  delete_file: 5000,    // 5s

  // Shell tools
  npm_command: 120000,  // 2 min
  shell_command: 30000, // 30s
  install_dependencies: 180000, // 3 min

  // Git tools
  git_commit: 30000,    // 30s
  git_push: 60000,      // 1 min
  git_pull: 60000,      // 1 min

  // Web tools
  web_fetch: 30000,     // 30s
  web_search: 30000,    // 30s

  // Default
  DEFAULT: 30000,       // 30s
};
```

---

### P1.3 - Ajouter cleanup/rollback à CoderAgent

**Priorité:** 🟠 HAUTE
**Effort:** 4 heures
**Fichier:** `app/lib/agents/agents/coder-agent.ts`

**Problème:**
CoderAgent n'a pas de mécanisme de rollback contrairement à FixerAgent.

**Solution:**
Implémenter le même système de snapshots que FixerAgent.

```typescript
// Ajouter les propriétés
private fileSnapshots: Map<string, string> = new Map();
private snapshotsEnabled: boolean = true;

// Ajouter les méthodes (copier depuis fixer-agent.ts et adapter)
private async createFileSnapshots(paths: string[]): Promise<void> {
  // Implémentation identique à FixerAgent
}

private async rollbackChanges(): Promise<void> {
  // Implémentation identique à FixerAgent
}

// Modifier execute() pour utiliser les snapshots
async execute(task: Task): Promise<TaskResult> {
  // Au début: créer snapshots des fichiers existants mentionnés dans le contexte
  if (this.snapshotsEnabled && task.context?.files) {
    await this.createFileSnapshots(task.context.files);
  }

  try {
    const result = await this.runAgentLoop(prompt);
    // Succès: nettoyer les snapshots
    this.fileSnapshots.clear();
    return this.enrichResult(result);
  } catch (error) {
    // Échec: rollback
    if (this.snapshotsEnabled && this.fileSnapshots.size > 0) {
      this.log('warn', 'Rolling back changes due to error');
      await this.rollbackChanges();
    }
    throw error;
  }
}
```

---

### P1.4 - Valider les URLs git clone

**Priorité:** 🟠 HAUTE
**Effort:** 1 heure
**Fichier:** `app/lib/agents/tools/git-tools.ts`

**Problème:**
Les URLs de clone ne sont pas validées, risque d'injection ou de clonage depuis des sources malveillantes.

**Solution:**

```typescript
// Ajouter validation
const ALLOWED_GIT_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  // Ajouter les hosts autorisés
]);

function validateGitUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    // Supporter les formats git@ et https://
    let host: string;

    if (urlString.startsWith('git@')) {
      // git@github.com:user/repo.git
      const match = urlString.match(/^git@([^:]+):/);
      if (!match) {
        return { valid: false, error: 'Invalid git@ URL format' };
      }
      host = match[1];
    } else {
      const url = new URL(urlString);
      host = url.hostname;
    }

    if (!ALLOWED_GIT_HOSTS.has(host.toLowerCase())) {
      return { valid: false, error: `Git host not allowed: ${host}` };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

// Utiliser dans git_clone handler
git_clone: async (input) => {
  const url = input.url as string;

  const validation = validateGitUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      output: null,
      error: validation.error,
    };
  }

  // Reste du code...
};
```

---

### P1.5 - Ajouter handoffs manquants dans SwarmCoordinator

**Priorité:** 🟠 HAUTE
**Effort:** 2 heures
**Fichier:** `app/lib/agents/utils/swarm-coordinator.ts`

**Problème:**
Plusieurs flux de travail manquent de handoffs automatiques.

**Solution:**
Ajouter les règles manquantes:

```typescript
// Ajouter dans PREDEFINED_RULES

// Explore → Coder (si exploration trouve du code à modifier)
exploreToCoder: (): HandoffRule => ({
  from: 'explore',
  to: 'coder',
  condition: {
    type: 'custom',
    predicate: (_task, result) =>
      result.success &&
      (result.output.toLowerCase().includes('should be modified') ||
       result.output.toLowerCase().includes('needs to be updated') ||
       result.output.toLowerCase().includes('à modifier') ||
       result.output.toLowerCase().includes('doit être mis à jour')),
  },
  priority: 3,
  transformTask: (task, result) => ({
    ...task,
    prompt: `Based on exploration results, implement the following changes:\n\n${result.output}`,
  }),
}),

// Deployer fallback (si push échoue)
deployerToFixer: (): HandoffRule => ({
  from: 'deployer',
  to: 'fixer',
  condition: {
    type: 'on_failure',
  },
  priority: 5,
  transformTask: (task, result) => ({
    ...task,
    prompt: `Git operation failed. Error:\n${result.output}\n\nPlease fix the issue.`,
    context: {
      ...task.context,
      gitError: result.output,
    },
  }),
}),

// Reviewer → Deployer (après approbation)
reviewerToDeployer: (): HandoffRule => ({
  from: 'reviewer',
  to: 'deployer',
  condition: {
    type: 'custom',
    predicate: (_task, result) =>
      result.success &&
      result.output.toLowerCase().includes('approved') &&
      (!result.data?.issues || result.data.issues.length === 0),
  },
  priority: 2,
  transformTask: (task, result) => ({
    ...task,
    prompt: `Code review passed. Proceed with deployment.\n\nReview summary:\n${result.output}`,
  }),
}),

// Coder → Tester (après modification de code)
coderToTester: (): HandoffRule => ({
  from: 'coder',
  to: 'tester',
  condition: {
    type: 'on_success',
  },
  priority: 3,
  transformTask: (task, result) => ({
    ...task,
    prompt: `Code modifications completed. Please run tests to verify.\n\nModified files:\n${result.artifacts?.map(a => a.path).join('\n') || 'See result'}`,
  }),
}),
```

---

### P1.6 - Validation stricte dans parseDecision (orchestrator)

**Priorité:** 🟠 HAUTE
**Effort:** 2 heures
**Fichier:** `app/lib/agents/agents/orchestrator.ts`

**Problème (Ligne 887-947):**
Le parsing des décisions est basique sans validation des inputs.

**Solution:**

```typescript
// Remplacer parseDecision avec validation stricte
private parseDecision(response: AgentMessage): OrchestratorDecision {
  // Chercher les tool_use blocks
  const toolUseBlocks = response.toolCalls || [];

  for (const block of toolUseBlocks) {
    const input = block.input as Record<string, unknown>;

    switch (block.name) {
      case 'delegate_to_agent': {
        // Validation stricte
        const agent = input.agent as string;
        const validAgents = ['explore', 'coder', 'builder', 'tester', 'deployer', 'reviewer', 'fixer', 'architect'];

        if (!agent || !validAgents.includes(agent)) {
          this.log('error', `Invalid agent in delegate: ${agent}`, { validAgents });
          throw new Error(`Invalid agent: ${agent}. Must be one of: ${validAgents.join(', ')}`);
        }

        const task = input.task as string;
        if (!task || typeof task !== 'string' || task.trim().length === 0) {
          throw new Error('Task description is required for delegation');
        }

        return {
          action: 'delegate',
          targetAgent: agent as AgentType,
          reasoning: task,
        };
      }

      case 'create_subtasks': {
        const subtasks = input.subtasks as Array<{ description: string; agent: string }>;

        if (!Array.isArray(subtasks) || subtasks.length === 0) {
          throw new Error('At least one subtask is required');
        }

        // Valider chaque subtask
        for (const subtask of subtasks) {
          if (!subtask.description || typeof subtask.description !== 'string') {
            throw new Error('Each subtask must have a description');
          }
          // agent est optionnel
        }

        return {
          action: 'decompose',
          subtasks: subtasks.map(s => ({
            description: s.description,
            agent: s.agent as AgentType | undefined,
          })),
          reasoning: input.reasoning as string || 'Task decomposition',
        };
      }

      case 'complete_task': {
        const summary = input.summary as string;
        if (!summary || typeof summary !== 'string') {
          throw new Error('Summary is required to complete task');
        }

        return {
          action: 'complete',
          response: summary,
          reasoning: input.reasoning as string || 'Task completed',
        };
      }

      // ... autres cas
    }
  }

  // Si aucun tool_use, vérifier si c'est une réponse directe valide
  if (response.content && response.content.trim().length > 0) {
    return {
      action: 'execute_directly',
      response: response.content,
      reasoning: 'Direct response without tool use',
    };
  }

  throw new Error('Unable to parse orchestrator decision: no valid tool use or response');
}
```

---

### P1.7 - Implémenter DLQ avec reprise automatique

**Priorité:** 🟠 HAUTE
**Effort:** 4 heures
**Fichier:** `app/lib/agents/persistence/dead-letter-queue.ts`

**Problème:**
Les tâches échouées vont dans la DLQ mais ne sont pas retentées automatiquement.

**Solution:**

```typescript
// Ajouter dans dead-letter-queue.ts

interface DLQConfig {
  maxRetries: number;           // Max retries avant abandon définitif
  retryDelayMs: number;         // Délai initial entre retries
  backoffMultiplier: number;    // Multiplicateur de backoff
  maxRetryDelayMs: number;      // Délai max entre retries
  autoRetryEnabled: boolean;    // Activer retry automatique
  autoRetryIntervalMs: number;  // Intervalle de vérification
}

const DEFAULT_DLQ_CONFIG: DLQConfig = {
  maxRetries: 3,
  retryDelayMs: 5000,
  backoffMultiplier: 2,
  maxRetryDelayMs: 60000,
  autoRetryEnabled: true,
  autoRetryIntervalMs: 30000,
};

class DeadLetterQueue {
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(private config: DLQConfig = DEFAULT_DLQ_CONFIG) {
    if (this.config.autoRetryEnabled) {
      this.startAutoRetry();
    }
  }

  private startAutoRetry(): void {
    this.retryTimer = setInterval(() => {
      this.processRetries();
    }, this.config.autoRetryIntervalMs);
  }

  private async processRetries(): Promise<void> {
    const now = Date.now();
    const entries = this.getRetryableEntries();

    for (const entry of entries) {
      // Vérifier si le délai de retry est passé
      const retryDelay = this.calculateRetryDelay(entry.retryCount);
      const nextRetryTime = entry.lastAttemptAt.getTime() + retryDelay;

      if (now >= nextRetryTime) {
        await this.retryEntry(entry);
      }
    }
  }

  private calculateRetryDelay(retryCount: number): number {
    const delay = this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, retryCount);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  private async retryEntry(entry: DLQEntry): Promise<void> {
    if (entry.retryCount >= this.config.maxRetries) {
      // Marquer comme définitivement échoué
      entry.status = 'permanent_failure';
      logger.error(`Task permanently failed after ${entry.retryCount} retries`, {
        taskId: entry.task.id,
      });
      return;
    }

    try {
      logger.info(`Retrying DLQ task`, {
        taskId: entry.task.id,
        retryCount: entry.retryCount + 1,
      });

      // Réexécuter la tâche
      const result = await this.taskQueue.enqueue(entry.task);

      if (result.success) {
        // Supprimer de la DLQ
        this.remove(entry.id);
        logger.info(`DLQ task succeeded on retry`, { taskId: entry.task.id });
      } else {
        // Mettre à jour le compteur
        entry.retryCount++;
        entry.lastAttemptAt = new Date();
        entry.lastError = result.errors?.[0]?.message || 'Unknown error';
      }
    } catch (error) {
      entry.retryCount++;
      entry.lastAttemptAt = new Date();
      entry.lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  // Méthode pour identifier les poison pills
  isPoisonPill(entry: DLQEntry): boolean {
    // Même erreur à chaque tentative
    if (entry.errorHistory.length >= 3) {
      const lastThreeErrors = entry.errorHistory.slice(-3);
      const uniqueErrors = new Set(lastThreeErrors.map(e => e.message));
      return uniqueErrors.size === 1;
    }
    return false;
  }

  shutdown(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
```

---

## 4. PHASE 2 - MOYENNES (P2)

> **Objectif:** Optimisation, refactoring, et amélioration de la maintenabilité.

---

### P2.1 - Refactorer BaseAgent (SRP)

**Priorité:** 🟡 MOYENNE
**Effort:** 8 heures
**Fichiers:**
- `app/lib/agents/core/base-agent.ts`
- Créer: `app/lib/agents/core/llm-client.ts`
- Créer: `app/lib/agents/core/message-history.ts`
- Créer: `app/lib/agents/core/tool-executor.ts`

**Problème:**
BaseAgent gère 7 responsabilités distinctes (violation SRP).

**Solution:**
Extraire les responsabilités dans des classes séparées.

```
BaseAgent (actuel - 1300 lignes)
├── Cycle de vie des tâches      → BaseAgent (réduit)
├── Communication LLM            → LLMClient
├── Exécution d'outils           → ToolExecutor
├── Historique des messages      → MessageHistory
├── Système d'événements         → EventEmitter (existant)
├── Retry strategies             → RetryManager
└── Logging                      → ScopedLogger (existant)
```

**Structure cible:**

```typescript
// llm-client.ts
export class LLMClient {
  constructor(private config: LLMConfig) {}

  async call(messages: Message[], options?: CallOptions): Promise<LLMResponse> {
    // Logique de callLLM extraite
  }

  async callWithRetry(messages: Message[], options?: RetryOptions): Promise<LLMResponse> {
    // Retry logic
  }
}

// message-history.ts
export class MessageHistory {
  private messages: AgentMessage[] = [];
  private tokenCount: number = 0;

  add(message: AgentMessage): void { }
  trim(maxMessages: number): void { }
  compress(): void { }
  getMessages(): AgentMessage[] { }
  estimateTokens(): number { }
}

// tool-executor.ts
export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> { }
  async executeAll(calls: ToolCall[]): Promise<ToolResult[]> { }
}

// base-agent.ts (refactoré)
export abstract class BaseAgent {
  protected llmClient: LLMClient;
  protected messageHistory: MessageHistory;
  protected toolExecutor: ToolExecutor;

  constructor(config: AgentConfig) {
    this.llmClient = new LLMClient(config.llm);
    this.messageHistory = new MessageHistory(config.history);
    this.toolExecutor = new ToolExecutor(this.toolRegistry);
  }

  // Seulement la logique de haut niveau
  async run(task: Task, apiKey: string): Promise<TaskResult> { }
  protected async runAgentLoop(prompt: string): Promise<TaskResult> { }
  abstract execute(task: Task): Promise<TaskResult>;
}
```

---

### P2.2 - Remplacer polling par EventEmitter (waitForTask)

**Priorité:** 🟡 MOYENNE
**Effort:** 3 heures
**Fichier:** `app/lib/agents/core/task-queue.ts`

**Problème (Ligne 519-535):**
`waitForTask()` utilise un polling à 100ms, inefficace et peut attendre longtemps.

**Solution:**

```typescript
// Utiliser un système d'événements
import { EventEmitter } from 'events';

class TaskQueue {
  private taskEvents = new EventEmitter();

  // Quand une tâche se termine
  private completeTask(taskId: string, result: TaskResult): void {
    this.completed.set(taskId, result);
    this.taskEvents.emit(`completed:${taskId}`, result);
    this.taskEvents.emit('task:completed', { taskId, result });
  }

  private failTask(taskId: string, error: TaskResult): void {
    this.failed.set(taskId, { task: this.running.get(taskId)!.task, error: error.output });
    this.taskEvents.emit(`failed:${taskId}`, error);
    this.taskEvents.emit('task:failed', { taskId, error });
  }

  // Attendre une tâche avec événements
  async waitForTask(taskId: string, timeout = 300000): Promise<TaskResult> {
    // Vérifier si déjà terminé
    if (this.completed.has(taskId)) {
      return this.completed.get(taskId)!;
    }
    if (this.failed.has(taskId)) {
      throw new Error(`Task failed: ${taskId}`);
    }

    // Vérifier si la tâche existe
    const exists = this.queue.some(item => item.task.id === taskId) ||
                   this.running.has(taskId);
    if (!exists) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Attendre avec événements
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for task: ${taskId}`));
      }, timeout);

      const onComplete = (result: TaskResult) => {
        cleanup();
        resolve(result);
      };

      const onFail = (error: TaskResult) => {
        cleanup();
        reject(new Error(`Task failed: ${error.output}`));
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.taskEvents.off(`completed:${taskId}`, onComplete);
        this.taskEvents.off(`failed:${taskId}`, onFail);
      };

      this.taskEvents.once(`completed:${taskId}`, onComplete);
      this.taskEvents.once(`failed:${taskId}`, onFail);
    });
  }
}
```

---

### P2.3 - Circuit breaker avec fallback dégradé

**Priorité:** 🟡 MOYENNE
**Effort:** 3 heures
**Fichier:** `app/lib/agents/utils/circuit-breaker.ts`

**Problème:**
Quand un circuit est OPEN, on retourne juste une erreur sans fallback.

**Solution:**

```typescript
// Ajouter support de fallback
interface CircuitBreakerConfig {
  // ... config existante
  fallbackFn?: (error: Error) => Promise<any>;
  degradedMode?: {
    enabled: boolean;
    maxConcurrency: number;  // Limiter les requêtes en mode dégradé
    timeout: number;         // Timeout réduit en mode dégradé
  };
}

class CircuitBreaker {
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Tenter le fallback si disponible
      if (this.config.fallbackFn) {
        this.log('info', 'Circuit open, using fallback');
        return this.config.fallbackFn(new Error('Circuit is open'));
      }

      // Mode dégradé si configuré
      if (this.config.degradedMode?.enabled) {
        return this.executeInDegradedMode(fn);
      }

      throw new Error('Circuit breaker is open');
    }

    // ... reste de la logique
  }

  private async executeInDegradedMode<T>(fn: () => Promise<T>): Promise<T> {
    // Limiter la concurrence
    if (this.currentDegradedRequests >= this.config.degradedMode!.maxConcurrency) {
      throw new Error('Degraded mode at capacity');
    }

    this.currentDegradedRequests++;
    try {
      // Timeout réduit
      return await withTimeout(
        fn(),
        this.config.degradedMode!.timeout,
        'Degraded mode execution'
      );
    } finally {
      this.currentDegradedRequests--;
    }
  }
}
```

---

### P2.4 - Détection des poison pills

**Priorité:** 🟡 MOYENNE
**Effort:** 2 heures
**Fichier:** `app/lib/agents/persistence/dead-letter-queue.ts`

**Problème:**
Les tâches qui échouent toujours de la même manière ne sont pas détectées.

**Solution:**

```typescript
interface PoisonPillDetection {
  enabled: boolean;
  minFailures: number;          // Nombre min d'échecs identiques
  errorSimilarityThreshold: number;  // Seuil de similarité (0-1)
  action: 'quarantine' | 'alert' | 'skip';
}

class DeadLetterQueue {
  detectPoisonPill(entry: DLQEntry): boolean {
    if (entry.errorHistory.length < this.config.poisonPill.minFailures) {
      return false;
    }

    // Vérifier si les erreurs sont similaires
    const recentErrors = entry.errorHistory.slice(-this.config.poisonPill.minFailures);
    const errorMessages = recentErrors.map(e => e.message);

    // Calculer la similarité
    const similarity = this.calculateErrorSimilarity(errorMessages);

    if (similarity >= this.config.poisonPill.errorSimilarityThreshold) {
      this.handlePoisonPill(entry);
      return true;
    }

    return false;
  }

  private calculateErrorSimilarity(errors: string[]): number {
    if (errors.length < 2) return 0;

    // Comparer les erreurs deux à deux
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < errors.length - 1; i++) {
      for (let j = i + 1; j < errors.length; j++) {
        totalSimilarity += this.stringSimilarity(errors[i], errors[j]);
        comparisons++;
      }
    }

    return totalSimilarity / comparisons;
  }

  private stringSimilarity(a: string, b: string): number {
    // Algorithme de Levenshtein simplifié
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1;

    const distance = this.levenshteinDistance(a, b);
    return 1 - distance / maxLength;
  }

  private handlePoisonPill(entry: DLQEntry): void {
    switch (this.config.poisonPill.action) {
      case 'quarantine':
        entry.status = 'quarantined';
        entry.quarantinedAt = new Date();
        logger.error(`Poison pill detected and quarantined`, { taskId: entry.task.id });
        break;

      case 'alert':
        // Émettre une alerte
        this.emit('poison_pill_detected', entry);
        logger.error(`Poison pill detected - ALERT`, { taskId: entry.task.id });
        break;

      case 'skip':
        entry.status = 'skipped';
        logger.warn(`Poison pill detected and skipped`, { taskId: entry.task.id });
        break;
    }
  }
}
```

---

### P2.5 - Audit logging centralisé

**Priorité:** 🟡 MOYENNE
**Effort:** 4 heures
**Fichiers:**
- Créer: `app/lib/agents/logging/audit-logger.ts`
- Modifier: Tous les handlers d'outils

**Problème:**
Pas de logging centralisé pour les opérations importantes.

**Solution:**

```typescript
// audit-logger.ts
interface AuditEntry {
  id: string;
  timestamp: Date;
  type: 'file_operation' | 'shell_command' | 'git_operation' | 'api_call' | 'security_event';
  action: string;
  agent: string;
  taskId: string;
  details: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'blocked';
  duration?: number;
}

class AuditLogger {
  private entries: AuditEntry[] = [];
  private storage: AuditStorage;

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...entry,
    };

    this.entries.push(fullEntry);

    // Persister si configuré
    if (this.storage) {
      await this.storage.save(fullEntry);
    }

    // Logger aussi dans la console
    const level = entry.outcome === 'failure' ? 'error' :
                  entry.outcome === 'blocked' ? 'warn' : 'info';
    logger[level](`AUDIT: ${entry.action}`, {
      type: entry.type,
      agent: entry.agent,
      outcome: entry.outcome,
      ...entry.details,
    });
  }

  // Recherche dans l'historique
  query(filter: Partial<AuditEntry>): AuditEntry[] {
    return this.entries.filter(e => {
      for (const [key, value] of Object.entries(filter)) {
        if (e[key as keyof AuditEntry] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  // Export pour analyse
  export(format: 'json' | 'csv'): string {
    if (format === 'json') {
      return JSON.stringify(this.entries, null, 2);
    }
    // CSV implementation...
  }
}

// Singleton global
export const auditLogger = new AuditLogger();

// Utilisation dans les handlers
// write-tools.ts
write_file: async (input) => {
  const startTime = Date.now();

  try {
    // ... logique existante

    await auditLogger.log({
      type: 'file_operation',
      action: 'write_file',
      agent: currentAgent, // Passé via contexte
      taskId: currentTaskId,
      details: { path, contentLength: content.length },
      outcome: 'success',
      duration: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    await auditLogger.log({
      type: 'file_operation',
      action: 'write_file',
      agent: currentAgent,
      taskId: currentTaskId,
      details: { path, error: error.message },
      outcome: 'failure',
      duration: Date.now() - startTime,
    });
    throw error;
  }
};
```

---

### P2.6 - Cache getDefinitions() dans ToolRegistry

**Priorité:** 🟡 MOYENNE
**Effort:** 1 heure
**Fichier:** `app/lib/agents/core/tool-registry.ts`

**Problème (Ligne 262-266):**
`getDefinitions()` alloue et trie un array à chaque appel LLM.

**Solution:**

```typescript
class ToolRegistry {
  private cachedDefinitions: ToolDefinition[] | null = null;
  private cacheInvalidated: boolean = true;

  // Invalider le cache quand les outils changent
  register(definition: ToolDefinition, handler: ToolHandler, options?: RegisterOptions): void {
    // ... logique existante
    this.cacheInvalidated = true;
  }

  unregister(name: string): boolean {
    // ... logique existante
    this.cacheInvalidated = true;
    return result;
  }

  getDefinitions(): ToolDefinition[] {
    if (this.cacheInvalidated || !this.cachedDefinitions) {
      this.cachedDefinitions = Array.from(this.tools.values())
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map((t) => t.definition);
      this.cacheInvalidated = false;
    }
    return this.cachedDefinitions;
  }
}
```

---

## 5. PHASE 3 - AMÉLIORATIONS (P3)

> **Objectif:** Améliorations de confort, performance et polish.

---

### P3.1 - Ajouter métriques de performance

**Effort:** 4 heures

```typescript
// metrics.ts
interface AgentMetrics {
  totalCalls: number;
  successRate: number;
  averageLatency: number;
  p95Latency: number;
  tokensUsed: number;
  toolsExecuted: Record<string, number>;
}

class MetricsCollector {
  recordAgentCall(agent: string, duration: number, success: boolean, tokens: number): void;
  recordToolExecution(tool: string, duration: number, success: boolean): void;
  getAgentMetrics(agent: string): AgentMetrics;
  exportPrometheus(): string;
}
```

---

### P3.2 - Rate limiting par agent

**Effort:** 2 heures

```typescript
// rate-limiter.ts
class AgentRateLimiter {
  private limits: Map<string, { requests: number; window: number }> = new Map([
    ['orchestrator', { requests: 100, window: 60000 }],
    ['coder', { requests: 50, window: 60000 }],
    ['builder', { requests: 30, window: 60000 }],
    // ...
  ]);

  async acquire(agent: string): Promise<void>;
  release(agent: string): void;
}
```

---

### P3.3 - Dashboard de monitoring

**Effort:** 8 heures

Créer un dashboard simple pour visualiser:
- Agents actifs
- Tâches en cours
- Métriques de performance
- Logs en temps réel
- Alertes

---

## 6. TESTS ET VALIDATION

### 6.1 Tests Unitaires à Ajouter

```typescript
// tests/core/base-agent.spec.ts
describe('BaseAgent', () => {
  describe('executeToolCalls', () => {
    it('should handle partial tool failures with Promise.allSettled');
    it('should respect timeout configuration');
    it('should not allow concurrent executions');
  });
});

// tests/core/agent-registry.spec.ts
describe('AgentRegistry', () => {
  describe('getAsync', () => {
    it('should load lazy agent only once even with concurrent calls');
    it('should return cached agent on subsequent calls');
  });
});

// tests/security/secret-scanner.spec.ts
describe('SecretScanner', () => {
  it('should detect Stripe keys');
  it('should detect AWS credentials');
  it('should detect GitHub tokens');
  it('should not false positive on variable names');
});

// tests/tools/write-tools.spec.ts
describe('write-tools', () => {
  it('should block files containing secrets');
  it('should respect dry-run mode');
  it('should validate paths against traversal');
});
```

### 6.2 Tests d'Intégration

```typescript
// tests/integration/agent-flow.spec.ts
describe('Agent Flow', () => {
  it('should complete explore → coder → tester flow');
  it('should handle failures with handoffs');
  it('should respect circuit breaker');
  it('should recover from DLQ');
});
```

### 6.3 Tests de Charge

```typescript
// tests/load/concurrent-agents.spec.ts
describe('Concurrent Agents', () => {
  it('should handle 10 concurrent tasks without deadlock');
  it('should not exceed memory limits');
  it('should maintain response times under load');
});
```

---

## 7. CHECKLIST DE DÉPLOIEMENT

### Avant Déploiement

- [ ] Tous les tests P0 passent
- [ ] Tous les tests P1 passent
- [ ] Audit de sécurité validé
- [ ] Performance baseline établie
- [ ] Documentation mise à jour
- [ ] Rollback plan défini

### Configuration Production

```typescript
// config/production.ts
export const PRODUCTION_CONFIG = {
  dryRun: {
    enabled: false,  // Désactivé en prod (attention!)
    blockIrreversible: true,
  },
  agents: {
    defaultTimeout: 180000,
    maxRetries: 2,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000,
  },
  rateLimiting: {
    enabled: true,
    global: { requests: 1000, window: 60000 },
  },
  audit: {
    enabled: true,
    retention: '30d',
  },
};
```

### Monitoring Post-Déploiement

- [ ] Alertes configurées pour erreurs critiques
- [ ] Dashboard de métriques accessible
- [ ] Logs centralisés et indexés
- [ ] Circuit breakers monitorés
- [ ] DLQ vérifiée régulièrement

---

## ANNEXES

### A. Fichiers à Créer

```
app/lib/agents/
├── security/
│   └── secret-scanner.ts         # P0.5
├── core/
│   ├── llm-client.ts             # P2.1
│   ├── message-history.ts        # P2.1
│   └── tool-executor.ts          # P2.1
├── logging/
│   └── audit-logger.ts           # P2.5
└── utils/
    └── timeout-wrapper.ts        # P1.2
```

### B. Fichiers à Modifier

```
app/lib/agents/
├── agents/
│   ├── coder-agent.ts            # P0.1, P1.3
│   ├── builder-agent.ts          # P0.1
│   ├── tester-agent.ts           # P0.1, P1.1
│   ├── deployer-agent.ts         # P0.1, P1.1
│   ├── reviewer-agent.ts         # P0.1, P1.1
│   ├── fixer-agent.ts            # P0.1, P1.1
│   └── orchestrator.ts           # P1.6
├── core/
│   ├── base-agent.ts             # P0.2, P2.1
│   ├── agent-registry.ts         # P0.3
│   ├── task-queue.ts             # P2.2
│   └── tool-registry.ts          # P2.6
├── tools/
│   ├── write-tools.ts            # P0.4, P0.5, P1.2
│   ├── git-tools.ts              # P0.4, P1.4
│   ├── web-tools.ts              # P0.7
│   ├── integration-tools.ts      # P0.6
│   └── shell-tools.ts            # P0.4, P1.2
├── utils/
│   ├── dry-run.ts                # P0.4
│   ├── swarm-coordinator.ts      # P1.5
│   └── circuit-breaker.ts        # P2.3
├── persistence/
│   └── dead-letter-queue.ts      # P1.7, P2.4
└── types.ts                      # P1.1
```

### C. Commandes Utiles

```bash
# Vérifier les timeout/retries dans tous les agents
grep -rn "timeout:" app/lib/agents/agents/
grep -rn "maxRetries:" app/lib/agents/agents/

# Chercher les Promise.all non sécurisés
grep -rn "Promise.all" app/lib/agents/ | grep -v "allSettled"

# Vérifier les patterns de secrets
grep -rn "sk_live_\|pk_live_\|AKIA\|ghp_" app/

# Lancer les tests
npm run test:agents
npm run test:security
npm run test:integration
```

---

**FIN DU PLAN DE CORRECTION**

*Dernière mise à jour: 18 Janvier 2026*
