# Protocole de Sécurité - Phase 3: Backend Automatique

> **Document de référence** pour garantir la fiabilité et la sécurité de la génération backend automatique.
> **Version:** 1.0 | **Date:** 2025-12-27

---

## Table des Matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Validation NLP - Extraction d'Entités](#2-validation-nlp---extraction-dentités)
3. [Validation SQL - Prévention d'Erreurs](#3-validation-sql---prévention-derreurs)
4. [Système de Rollback](#4-système-de-rollback)
5. [Sandbox de Test](#5-sandbox-de-test)
6. [Revue et Approbation](#6-revue-et-approbation)
7. [Logging et Audit](#7-logging-et-audit)
8. [Checklist de Validation](#8-checklist-de-validation)

---

## 1. Vue d'ensemble

### Risques identifiés et mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Extraction NLP incorrecte | Élevé | Moyenne | Validation multi-niveaux + confirmation utilisateur |
| Génération SQL incorrecte | Critique | Moyenne | Validation syntaxique + exécution sandbox |
| Conflits de schémas | Moyen | Élevée | Diff intelligent + migrations incrémentales |
| Perte de données | Critique | Faible | Rollback automatique + backups |
| Injection SQL | Critique | Faible | Échappement + requêtes paramétrées |

### Architecture de sécurité

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Pipeline de Génération Sécurisé                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │   NLP    │───▶│   SQL    │───▶│ Sandbox  │───▶│  Review  │      │
│  │ Validator│    │ Validator│    │  Test    │    │ & Approve│      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│       │               │               │               │             │
│       ▼               ▼               ▼               ▼             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Confidence│   │ Syntax   │    │ Execution│    │ Human    │      │
│  │   Score  │    │  Check   │    │  Result  │    │ Confirm  │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Rollback Manager                           │   │
│  │  (Sauvegarde automatique avant chaque opération critique)    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Audit Logger                              │   │
│  │  (Trace complète de toutes les opérations)                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Validation NLP - Extraction d'Entités

### 2.1 Score de Confiance

Chaque entité extraite reçoit un score de confiance (0-100).

```typescript
// app/lib/.server/supabase/validators/NLPValidator.ts

export interface EntityConfidence {
  entity: ExtractedEntity;
  confidence: number;        // 0-100
  source: 'explicit' | 'inferred' | 'default';
  warnings: string[];
}

export interface ValidationResult {
  isValid: boolean;
  entities: EntityConfidence[];
  overallConfidence: number;
  requiresConfirmation: boolean;
  suggestedQuestions: string[];
}

export const CONFIDENCE_THRESHOLDS = {
  AUTO_ACCEPT: 85,           // Procéder automatiquement
  SUGGEST_REVIEW: 70,        // Suggérer une revue
  REQUIRE_CONFIRMATION: 50,  // Confirmation obligatoire
  REJECT: 30,                // Trop incertain, demander clarification
} as const;
```

### 2.2 Règles de Validation NLP

| Règle | Description | Action si échec |
|-------|-------------|-----------------|
| **Nom valide** | Nom d'entité valide (snake_case, pas de mots réservés) | Suggérer correction |
| **Type détecté** | Au moins un type de données détecté par colonne | Demander clarification |
| **Relation cohérente** | Relations 1-N/N-N cohérentes | Afficher avertissement |
| **Pas de conflit** | Pas de conflit avec schéma existant | Proposer renommage |
| **Limite colonnes** | Max 50 colonnes par table | Suggérer découpage |

### 2.3 Processus de Validation

```typescript
// Workflow de validation NLP

export class NLPValidator {
  async validate(input: string, existingSchema?: Schema): Promise<ValidationResult> {
    // Étape 1: Extraction des entités
    const extracted = await this.extractEntities(input);

    // Étape 2: Validation des noms
    const nameValidation = this.validateNames(extracted);

    // Étape 3: Validation des types
    const typeValidation = this.validateTypes(extracted);

    // Étape 4: Détection des conflits
    const conflictCheck = existingSchema
      ? this.checkConflicts(extracted, existingSchema)
      : { hasConflicts: false, conflicts: [] };

    // Étape 5: Calcul du score de confiance
    const confidence = this.calculateConfidence({
      nameValidation,
      typeValidation,
      conflictCheck,
    });

    // Étape 6: Décision
    return {
      isValid: confidence >= CONFIDENCE_THRESHOLDS.REJECT,
      entities: extracted.map(e => ({
        entity: e,
        confidence: this.getEntityConfidence(e),
        source: e.source,
        warnings: this.getWarnings(e),
      })),
      overallConfidence: confidence,
      requiresConfirmation: confidence < CONFIDENCE_THRESHOLDS.AUTO_ACCEPT,
      suggestedQuestions: this.generateClarificationQuestions(extracted),
    };
  }
}
```

### 2.4 Questions de Clarification Automatiques

Si le score de confiance est < 70, générer des questions:

```typescript
export const CLARIFICATION_TEMPLATES = {
  ambiguousType: (field: string, options: string[]) =>
    `Pour le champ "${field}", quel type souhaitez-vous ? Options: ${options.join(', ')}`,

  missingRelation: (entity1: string, entity2: string) =>
    `Quelle est la relation entre "${entity1}" et "${entity2}" ? (1-N, N-N, ou aucune)`,

  conflictingName: (name: string, existing: string) =>
    `Le nom "${name}" est similaire à "${existing}" existant. Voulez-vous les fusionner ou renommer ?`,

  unclearCardinality: (field: string) =>
    `Le champ "${field}" peut-il avoir plusieurs valeurs ? (ex: tags, catégories)`,
};
```

---

## 3. Validation SQL - Prévention d'Erreurs

### 3.1 Validateur Syntaxique

```typescript
// app/lib/.server/supabase/validators/SQLValidator.ts

export interface SQLValidationResult {
  isValid: boolean;
  errors: SQLError[];
  warnings: SQLWarning[];
  sanitizedSQL: string;
  securityIssues: SecurityIssue[];
}

export class SQLValidator {
  // Mots-clés dangereux interdits
  private readonly FORBIDDEN_KEYWORDS = [
    'DROP DATABASE',
    'DROP SCHEMA',
    'TRUNCATE',
    'DELETE FROM pg_',
    'ALTER SYSTEM',
    'COPY FROM PROGRAM',
  ];

  // Patterns d'injection SQL
  private readonly INJECTION_PATTERNS = [
    /;\s*DROP/i,
    /;\s*DELETE/i,
    /;\s*UPDATE.*SET/i,
    /UNION\s+SELECT/i,
    /--.*$/gm,
    /\/\*[\s\S]*?\*\//g,
  ];

  async validate(sql: string): Promise<SQLValidationResult> {
    const errors: SQLError[] = [];
    const warnings: SQLWarning[] = [];
    const securityIssues: SecurityIssue[] = [];

    // 1. Vérification des mots-clés interdits
    for (const keyword of this.FORBIDDEN_KEYWORDS) {
      if (sql.toUpperCase().includes(keyword)) {
        errors.push({
          type: 'forbidden_keyword',
          message: `Mot-clé interdit détecté: ${keyword}`,
          severity: 'critical',
        });
      }
    }

    // 2. Détection des patterns d'injection
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(sql)) {
        securityIssues.push({
          type: 'potential_injection',
          pattern: pattern.source,
          severity: 'high',
        });
      }
    }

    // 3. Validation syntaxique PostgreSQL
    const syntaxResult = await this.validatePostgresSyntax(sql);
    errors.push(...syntaxResult.errors);

    // 4. Vérification des bonnes pratiques
    warnings.push(...this.checkBestPractices(sql));

    // 5. Sanitization
    const sanitizedSQL = this.sanitize(sql);

    return {
      isValid: errors.length === 0 && securityIssues.length === 0,
      errors,
      warnings,
      sanitizedSQL,
      securityIssues,
    };
  }

  private sanitize(sql: string): string {
    // Échapper les caractères spéciaux
    // Normaliser les espaces
    // Retirer les commentaires
    return sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```

### 3.2 Validation de Structure

```typescript
export class SchemaStructureValidator {
  // Règles de structure obligatoires
  private readonly REQUIRED_COLUMNS = {
    id: { type: 'uuid', default: 'gen_random_uuid()' },
    created_at: { type: 'timestamptz', default: 'now()' },
    updated_at: { type: 'timestamptz', default: 'now()' },
  };

  validate(tables: Table[]): StructureValidationResult {
    const issues: StructureIssue[] = [];

    for (const table of tables) {
      // Vérifier les colonnes obligatoires
      for (const [colName, colDef] of Object.entries(this.REQUIRED_COLUMNS)) {
        if (!table.columns.find(c => c.name === colName)) {
          issues.push({
            table: table.name,
            type: 'missing_required_column',
            column: colName,
            suggestion: `ALTER TABLE ${table.name} ADD COLUMN ${colName} ${colDef.type} DEFAULT ${colDef.default};`,
          });
        }
      }

      // Vérifier les clés primaires
      if (!table.columns.some(c => c.isPrimaryKey)) {
        issues.push({
          table: table.name,
          type: 'missing_primary_key',
          suggestion: `La table ${table.name} doit avoir une clé primaire`,
        });
      }

      // Vérifier les foreign keys
      for (const column of table.columns) {
        if (column.isForeignKey && !column.references) {
          issues.push({
            table: table.name,
            type: 'invalid_foreign_key',
            column: column.name,
            suggestion: `Définir la référence pour ${column.name}`,
          });
        }
      }
    }

    return { isValid: issues.length === 0, issues };
  }
}
```

### 3.3 Validation RLS

```typescript
export class RLSValidator {
  validate(policies: RLSPolicy[]): RLSValidationResult {
    const issues: RLSIssue[] = [];

    for (const policy of policies) {
      // Vérifier que la politique n'est pas trop permissive
      if (policy.check === 'true' || policy.using === 'true') {
        issues.push({
          policy: policy.name,
          type: 'overly_permissive',
          severity: 'warning',
          message: 'La politique autorise tout - vérifier si intentionnel',
        });
      }

      // Vérifier l'utilisation de auth.uid()
      if (!policy.check?.includes('auth.uid()') &&
          !policy.using?.includes('auth.uid()') &&
          !policy.check?.includes('auth.jwt()') &&
          !policy.using?.includes('auth.jwt()')) {
        issues.push({
          policy: policy.name,
          type: 'no_auth_check',
          severity: 'high',
          message: 'La politique ne vérifie pas l\'authentification',
        });
      }

      // Vérifier la syntaxe PostgreSQL
      const syntaxValid = this.validatePolicySyntax(policy);
      if (!syntaxValid.isValid) {
        issues.push(...syntaxValid.errors);
      }
    }

    return { isValid: issues.filter(i => i.severity === 'high').length === 0, issues };
  }
}
```

---

## 4. Système de Rollback

### 4.1 Architecture

```typescript
// app/lib/.server/supabase/RollbackManager.ts

export interface Checkpoint {
  id: string;
  timestamp: Date;
  type: 'schema' | 'data' | 'full';
  tables: string[];
  schema: Schema;
  data?: Record<string, unknown[]>;  // Optionnel pour rollback données
  migration?: Migration;
}

export class RollbackManager {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private maxCheckpoints = 10;

  /**
   * Crée un checkpoint avant une opération critique
   */
  async createCheckpoint(
    type: Checkpoint['type'],
    tables: string[],
    supabaseClient: SupabaseClient
  ): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      tables,
      schema: await this.captureSchema(supabaseClient, tables),
    };

    if (type === 'data' || type === 'full') {
      checkpoint.data = await this.captureData(supabaseClient, tables);
    }

    this.checkpoints.set(checkpoint.id, checkpoint);
    this.pruneOldCheckpoints();

    logger.info('Checkpoint created', { id: checkpoint.id, tables });

    return checkpoint;
  }

  /**
   * Restaure à un checkpoint donné
   */
  async rollback(checkpointId: string, supabaseClient: SupabaseClient): Promise<RollbackResult> {
    const checkpoint = this.checkpoints.get(checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} non trouvé`);
    }

    logger.warn('Starting rollback', { checkpointId, timestamp: checkpoint.timestamp });

    try {
      // 1. Générer la migration inverse
      const currentSchema = await this.captureSchema(supabaseClient, checkpoint.tables);
      const rollbackMigration = this.generateRollbackMigration(currentSchema, checkpoint.schema);

      // 2. Valider la migration
      const validation = await this.validateRollbackMigration(rollbackMigration);
      if (!validation.isValid) {
        throw new Error(`Migration de rollback invalide: ${validation.errors.join(', ')}`);
      }

      // 3. Exécuter en transaction
      await this.executeRollback(supabaseClient, rollbackMigration, checkpoint);

      logger.info('Rollback completed', { checkpointId });

      return { success: true, checkpoint };
    } catch (error) {
      logger.error('Rollback failed', { checkpointId, error });
      throw error;
    }
  }

  /**
   * Wrapper pour exécuter une opération avec rollback automatique
   */
  async withRollback<T>(
    supabaseClient: SupabaseClient,
    tables: string[],
    operation: () => Promise<T>
  ): Promise<T> {
    const checkpoint = await this.createCheckpoint('schema', tables, supabaseClient);

    try {
      const result = await operation();
      return result;
    } catch (error) {
      logger.warn('Operation failed, initiating rollback', { checkpointId: checkpoint.id });
      await this.rollback(checkpoint.id, supabaseClient);
      throw error;
    }
  }
}
```

### 4.2 Points de Rollback Automatiques

| Opération | Checkpoint Auto | Type |
|-----------|-----------------|------|
| Création de table | ✅ | schema |
| Modification de colonne | ✅ | schema |
| Ajout de RLS | ✅ | schema |
| Suppression de données | ✅ | full |
| Migration | ✅ | full |
| Import de données | ✅ | data |

---

## 5. Sandbox de Test

### 5.1 Environnement Sandbox

```typescript
// app/lib/.server/supabase/SandboxExecutor.ts

export interface SandboxResult {
  success: boolean;
  executionTime: number;
  affectedRows: number;
  errors: ExecutionError[];
  warnings: string[];
  schema?: Schema;  // Schéma résultant
}

export class SandboxExecutor {
  private readonly SANDBOX_PREFIX = '_sandbox_';
  private readonly CLEANUP_DELAY = 5000; // 5 secondes

  /**
   * Exécute du SQL dans un environnement sandbox
   */
  async execute(sql: string, supabaseClient: SupabaseClient): Promise<SandboxResult> {
    const sandboxId = crypto.randomUUID().slice(0, 8);
    const startTime = Date.now();

    try {
      // 1. Créer le schéma sandbox
      const sandboxSchema = `${this.SANDBOX_PREFIX}${sandboxId}`;
      await supabaseClient.rpc('create_sandbox_schema', { schema_name: sandboxSchema });

      // 2. Modifier le SQL pour utiliser le schéma sandbox
      const sandboxedSQL = this.rewriteForSandbox(sql, sandboxSchema);

      // 3. Exécuter dans une transaction
      const result = await this.executeInTransaction(supabaseClient, sandboxedSQL);

      // 4. Capturer le schéma résultant
      const schema = await this.captureSchema(supabaseClient, sandboxSchema);

      return {
        success: true,
        executionTime: Date.now() - startTime,
        affectedRows: result.rowCount,
        errors: [],
        warnings: result.warnings,
        schema,
      };
    } catch (error) {
      return {
        success: false,
        executionTime: Date.now() - startTime,
        affectedRows: 0,
        errors: [this.parseError(error)],
        warnings: [],
      };
    } finally {
      // Cleanup sandbox après délai
      setTimeout(() => this.cleanupSandbox(supabaseClient, sandboxId), this.CLEANUP_DELAY);
    }
  }

  /**
   * Teste une migration sans l'appliquer
   */
  async testMigration(migration: Migration, supabaseClient: SupabaseClient): Promise<MigrationTestResult> {
    // Exécuter UP
    const upResult = await this.execute(migration.up, supabaseClient);
    if (!upResult.success) {
      return {
        success: false,
        phase: 'up',
        error: upResult.errors[0],
      };
    }

    // Exécuter DOWN pour vérifier la réversibilité
    const downResult = await this.execute(migration.down, supabaseClient);
    if (!downResult.success) {
      return {
        success: false,
        phase: 'down',
        error: downResult.errors[0],
        warning: 'La migration UP fonctionne mais DOWN échoue - migration non réversible',
      };
    }

    return {
      success: true,
      executionTime: upResult.executionTime + downResult.executionTime,
      schemaAfterUp: upResult.schema,
    };
  }
}
```

### 5.2 Tests de Régression

```typescript
export class RegressionTester {
  /**
   * Vérifie qu'une migration ne casse pas les requêtes existantes
   */
  async testQueries(
    migration: Migration,
    testQueries: TestQuery[],
    supabaseClient: SupabaseClient
  ): Promise<RegressionResult> {
    const sandbox = new SandboxExecutor();
    const failures: QueryFailure[] = [];

    // Appliquer la migration en sandbox
    const migrationResult = await sandbox.execute(migration.up, supabaseClient);
    if (!migrationResult.success) {
      return { success: false, migrationFailed: true, failures: [] };
    }

    // Tester chaque requête
    for (const query of testQueries) {
      try {
        const result = await sandbox.execute(query.sql, supabaseClient);

        if (!result.success) {
          failures.push({
            query: query.name,
            error: result.errors[0].message,
            severity: query.critical ? 'critical' : 'warning',
          });
        }
      } catch (error) {
        failures.push({
          query: query.name,
          error: error instanceof Error ? error.message : 'Unknown error',
          severity: 'critical',
        });
      }
    }

    return {
      success: failures.filter(f => f.severity === 'critical').length === 0,
      migrationFailed: false,
      failures,
    };
  }
}
```

---

## 6. Revue et Approbation

### 6.1 Niveaux de Revue

| Opération | Niveau de Revue | Approbation Requise |
|-----------|-----------------|---------------------|
| Création table simple | Auto | Confiance > 85% |
| Modification colonne | Suggéré | Confiance > 70% |
| Suppression table | Obligatoire | Toujours |
| RLS policies | Suggéré | Confiance > 80% |
| Migration destructive | Obligatoire | Toujours |
| Foreign keys | Auto | Confiance > 85% |

### 6.2 Interface de Revue

```typescript
export interface ReviewRequest {
  id: string;
  type: 'schema' | 'migration' | 'rls' | 'api';
  operation: OperationDetails;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  autoApproved: boolean;

  // Informations pour la revue
  preview: {
    before: string;  // État avant
    after: string;   // État après
    diff: string;    // Diff visuel
  };

  // Actions suggérées
  suggestedAction: 'approve' | 'modify' | 'reject';
  warnings: string[];
  recommendations: string[];
}

export class ReviewManager {
  async requestReview(operation: Operation): Promise<ReviewRequest> {
    const riskLevel = this.assessRisk(operation);
    const confidence = await this.calculateConfidence(operation);

    const autoApproved =
      riskLevel === 'low' &&
      confidence >= CONFIDENCE_THRESHOLDS.AUTO_ACCEPT;

    return {
      id: crypto.randomUUID(),
      type: operation.type,
      operation: operation.details,
      riskLevel,
      confidence,
      autoApproved,
      preview: await this.generatePreview(operation),
      suggestedAction: this.suggestAction(riskLevel, confidence),
      warnings: this.collectWarnings(operation),
      recommendations: this.generateRecommendations(operation),
    };
  }

  private assessRisk(operation: Operation): ReviewRequest['riskLevel'] {
    // Opérations destructives = risque critique
    if (operation.isDestructive) return 'critical';

    // Modification de structure = risque élevé
    if (operation.modifiesStructure) return 'high';

    // Ajout simple = risque faible
    if (operation.isAdditive) return 'low';

    return 'medium';
  }
}
```

### 6.3 Format de Confirmation Utilisateur

```typescript
// Message affiché à l'utilisateur pour approbation

export const REVIEW_MESSAGE_TEMPLATES = {
  schemaCreation: (tables: string[]) => `
## Création de schéma

Je vais créer les tables suivantes:
${tables.map(t => `- \`${t}\``).join('\n')}

### Détails
\`\`\`sql
${generateSQL(tables)}
\`\`\`

### Politiques RLS
${generateRLSSummary(tables)}

**Voulez-vous procéder ?**
- ✅ Approuver et créer
- ✏️ Modifier avant création
- ❌ Annuler
`,

  destructiveChange: (operation: string, affected: string[]) => `
## ⚠️ Opération Destructive

**Action:** ${operation}

**Éléments affectés:**
${affected.map(a => `- \`${a}\``).join('\n')}

**Cette action est irréversible.** Un backup sera créé avant exécution.

**Confirmez-vous cette opération ?**
`,

  migrationReview: (migration: Migration, testResult: MigrationTestResult) => `
## Revue de Migration

### Changements
\`\`\`sql
${migration.up}
\`\`\`

### Tests Sandbox
${testResult.success ? '✅ Tous les tests passent' : '❌ Erreurs détectées'}

${testResult.warnings?.map(w => `⚠️ ${w}`).join('\n') || ''}

**Appliquer cette migration ?**
`,
};
```

---

## 7. Logging et Audit

### 7.1 Structure des Logs

```typescript
// app/lib/.server/supabase/AuditLogger.ts

export interface AuditEntry {
  id: string;
  timestamp: Date;

  // Contexte
  sessionId: string;
  userId?: string;

  // Opération
  operation: {
    type: 'create' | 'modify' | 'delete' | 'migrate' | 'rollback';
    target: 'table' | 'column' | 'policy' | 'function' | 'index';
    name: string;
  };

  // Détails
  input: {
    description?: string;  // Description NLP originale
    sql?: string;          // SQL généré
    validation?: ValidationResult;
  };

  // Résultat
  result: {
    success: boolean;
    error?: string;
    duration: number;
    affectedRows?: number;
  };

  // Sécurité
  security: {
    riskLevel: string;
    validationsPassed: string[];
    warnings: string[];
    checkpointId?: string;
  };
}

export class AuditLogger {
  private entries: AuditEntry[] = [];

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...entry,
    };

    this.entries.push(fullEntry);

    // Persister dans la base de données
    await this.persist(fullEntry);

    // Log selon le niveau de risque
    if (entry.security.riskLevel === 'critical') {
      logger.warn('Critical operation logged', {
        operation: entry.operation,
        success: entry.result.success
      });
    }
  }

  async getHistory(filters: AuditFilters): Promise<AuditEntry[]> {
    return this.entries.filter(e => this.matchesFilters(e, filters));
  }

  async exportAuditTrail(startDate: Date, endDate: Date): Promise<string> {
    const entries = await this.getHistory({ startDate, endDate });
    return JSON.stringify(entries, null, 2);
  }
}
```

### 7.2 Métriques de Sécurité

```typescript
export interface SecurityMetrics {
  // Validations
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;

  // Opérations
  totalOperations: number;
  successfulOperations: number;
  rolledBackOperations: number;

  // Risques
  lowRiskOperations: number;
  mediumRiskOperations: number;
  highRiskOperations: number;
  criticalRiskOperations: number;

  // Tendances
  avgConfidenceScore: number;
  avgValidationTime: number;
  rollbackRate: number;
}

export class MetricsCollector {
  async collect(period: { start: Date; end: Date }): Promise<SecurityMetrics> {
    const entries = await this.auditLogger.getHistory({
      startDate: period.start,
      endDate: period.end,
    });

    return {
      totalValidations: entries.length,
      passedValidations: entries.filter(e => e.result.success).length,
      failedValidations: entries.filter(e => !e.result.success).length,
      // ... calculer les autres métriques
    };
  }
}
```

---

## 8. Checklist de Validation

### 8.1 Avant Chaque Génération

```markdown
## Pre-Generation Checklist

### Validation NLP
- [ ] Score de confiance ≥ 70%
- [ ] Tous les noms d'entités valides
- [ ] Types de données détectés pour chaque colonne
- [ ] Relations explicites ou clarifiées
- [ ] Pas de conflit avec schéma existant

### Validation SQL
- [ ] Syntaxe PostgreSQL valide
- [ ] Aucun mot-clé interdit
- [ ] Pas de pattern d'injection détecté
- [ ] Colonnes obligatoires présentes (id, created_at, updated_at)
- [ ] Clés primaires définies
- [ ] Foreign keys avec références valides

### Sécurité RLS
- [ ] Politique définie pour chaque table
- [ ] Vérification auth.uid() ou auth.jwt()
- [ ] Pas de politique "true" sans justification
- [ ] Actions CRUD couvertes
```

### 8.2 Avant Chaque Migration

```markdown
## Pre-Migration Checklist

### Tests Sandbox
- [ ] Migration UP exécutée avec succès
- [ ] Migration DOWN exécutée avec succès
- [ ] Schéma résultant conforme aux attentes
- [ ] Aucune régression sur requêtes existantes

### Rollback
- [ ] Checkpoint créé
- [ ] Point de rollback testé
- [ ] Backup des données si destructif

### Approbation
- [ ] Risque évalué
- [ ] Revue si risque ≥ medium
- [ ] Confirmation utilisateur si destructif
```

### 8.3 Après Chaque Opération

```markdown
## Post-Operation Checklist

### Vérification
- [ ] Schéma correspond aux attentes
- [ ] RLS policies actives
- [ ] Indexes créés si nécessaire
- [ ] Types TypeScript générés

### Audit
- [ ] Entrée d'audit créée
- [ ] Métriques mises à jour
- [ ] Checkpoint conservé (24h minimum)

### Cleanup
- [ ] Sandbox nettoyé
- [ ] Fichiers temporaires supprimés
- [ ] Cache invalidé si nécessaire
```

---

## Implémentation

### Fichiers à Créer

| Fichier | Description |
|---------|-------------|
| `app/lib/.server/supabase/validators/NLPValidator.ts` | Validation extraction NLP |
| `app/lib/.server/supabase/validators/SQLValidator.ts` | Validation SQL |
| `app/lib/.server/supabase/validators/RLSValidator.ts` | Validation RLS |
| `app/lib/.server/supabase/validators/StructureValidator.ts` | Validation structure |
| `app/lib/.server/supabase/RollbackManager.ts` | Gestion rollback |
| `app/lib/.server/supabase/SandboxExecutor.ts` | Exécution sandbox |
| `app/lib/.server/supabase/ReviewManager.ts` | Revue et approbation |
| `app/lib/.server/supabase/AuditLogger.ts` | Logging d'audit |
| `app/lib/.server/supabase/MetricsCollector.ts` | Collecte métriques |

### Tests Requis

| Test | Couverture |
|------|------------|
| `NLPValidator.spec.ts` | Extraction, confiance, clarification |
| `SQLValidator.spec.ts` | Syntaxe, injection, sanitization |
| `RollbackManager.spec.ts` | Checkpoint, rollback, recovery |
| `SandboxExecutor.spec.ts` | Isolation, exécution, cleanup |
| `AuditLogger.spec.ts` | Logging, export, métriques |

---

*Ce protocole garantit la sécurité et la fiabilité de la génération backend automatique. Chaque opération critique passe par des validations multiples avant exécution.*
