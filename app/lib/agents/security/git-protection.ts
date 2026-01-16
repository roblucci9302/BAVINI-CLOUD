/**
 * Git Protection - Sécurité pour les opérations Git du Deployer Agent
 *
 * Protections implémentées:
 * - Liste des branches protégées (main, master, develop, production)
 * - Vérification pre-push (uncommitted changes, empty commits)
 * - Blocage des force-push sur branches protégées
 * - Validation des messages de commit
 * - Détection des fichiers sensibles
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitProtection');

/*
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */

export interface GitProtectionConfig {
  /** Branches protégées (pas de force-push, warnings pour push direct) */
  protectedBranches: string[];

  /** Branches bloquées (aucun push direct autorisé) */
  blockedBranches: string[];

  /** Patterns de fichiers sensibles à ne pas commiter */
  sensitiveFilePatterns: RegExp[];

  /** Longueur minimale des messages de commit */
  minCommitMessageLength: number;

  /** Activer la vérification pre-push */
  enablePrePushCheck: boolean;

  /** Activer la validation des commits */
  enableCommitValidation: boolean;
}

const DEFAULT_CONFIG: GitProtectionConfig = {
  protectedBranches: ['main', 'master', 'develop', 'production', 'staging', 'release'],
  blockedBranches: [], // Aucune branche bloquée par défaut
  sensitiveFilePatterns: [
    /\.env$/i,
    /\.env\..+$/i,
    /credentials\.json$/i,
    /secrets?\.(json|yaml|yml)$/i,
    /\.pem$/i,
    /\.key$/i,
    /id_rsa/i,
    /\.p12$/i,
    /\.pfx$/i,
    /password/i,
    /api[_-]?key/i,
  ],
  minCommitMessageLength: 10,
  enablePrePushCheck: true,
  enableCommitValidation: true,
};

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface GitProtectionResult {
  allowed: boolean;
  warnings: string[];
  errors: string[];
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

export interface CommitValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface PrePushCheckResult {
  safe: boolean;
  warnings: string[];
  errors: string[];
  uncommittedChanges: boolean;
  sensitiveFiles: string[];
}

/*
 * ============================================================================
 * BRANCH PROTECTION
 * ============================================================================
 */

/**
 * Vérifie si une branche est protégée
 */
export function isProtectedBranch(branchName: string, config: GitProtectionConfig = DEFAULT_CONFIG): boolean {
  const normalizedName = branchName.toLowerCase().trim();
  return config.protectedBranches.some(
    (pattern) => normalizedName === pattern.toLowerCase() || normalizedName.startsWith(`${pattern.toLowerCase()}/`),
  );
}

/**
 * Vérifie si une branche est complètement bloquée
 */
export function isBlockedBranch(branchName: string, config: GitProtectionConfig = DEFAULT_CONFIG): boolean {
  const normalizedName = branchName.toLowerCase().trim();
  return config.blockedBranches.some((pattern) => normalizedName === pattern.toLowerCase());
}

/**
 * Valide une opération push
 */
export function validatePushOperation(
  targetBranch: string,
  options: {
    force?: boolean;
    currentBranch?: string;
  } = {},
  config: GitProtectionConfig = DEFAULT_CONFIG,
): GitProtectionResult {
  const result: GitProtectionResult = {
    allowed: true,
    warnings: [],
    errors: [],
    requiresConfirmation: false,
  };

  const branch = targetBranch || options.currentBranch || 'unknown';

  // Vérifier si la branche est bloquée
  if (isBlockedBranch(branch, config)) {
    result.allowed = false;
    result.errors.push(`❌ Push direct vers '${branch}' est interdit. Utilisez une Pull Request.`);
    return result;
  }

  // Vérifier les force-push sur branches protégées
  if (options.force && isProtectedBranch(branch, config)) {
    result.allowed = false;
    result.errors.push(
      `🚫 Force-push vers la branche protégée '${branch}' est INTERDIT.`,
      `Cette action pourrait causer une perte de données irréversible.`,
      `Si vous devez absolument effectuer cette action, faites-le manuellement avec précaution.`,
    );
    return result;
  }

  // Warning pour push direct vers branche protégée
  if (isProtectedBranch(branch, config)) {
    result.warnings.push(
      `⚠️ Vous poussez vers la branche protégée '${branch}'.`,
      `Assurez-vous que vos changements sont testés et validés.`,
    );
    result.requiresConfirmation = true;
    result.confirmationMessage = `Confirmer le push vers la branche protégée '${branch}'?`;
  }

  // Warning pour force-push même sur branche non-protégée
  if (options.force) {
    result.warnings.push(
      `⚠️ Force-push peut réécrire l'historique et causer des problèmes pour les autres contributeurs.`,
    );
    result.requiresConfirmation = true;
    result.confirmationMessage = `Confirmer le force-push vers '${branch}'?`;
  }

  return result;
}

/*
 * ============================================================================
 * COMMIT VALIDATION
 * ============================================================================
 */

/**
 * Valide un message de commit
 */
export function validateCommitMessage(
  message: string,
  config: GitProtectionConfig = DEFAULT_CONFIG,
): CommitValidationResult {
  const result: CommitValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  if (!config.enableCommitValidation) {
    return result;
  }

  // Vérifier la longueur
  if (message.length < config.minCommitMessageLength) {
    result.valid = false;
    result.errors.push(
      `Message de commit trop court (${message.length} caractères, minimum ${config.minCommitMessageLength}).`,
    );
  }

  // Vérifier les messages génériques
  const genericMessages = [/^fix$/i, /^update$/i, /^change$/i, /^wip$/i, /^test$/i, /^\.+$/, /^-+$/];

  if (genericMessages.some((pattern) => pattern.test(message.trim()))) {
    result.warnings.push(`Message de commit trop générique. Décrivez les changements de manière plus précise.`);
  }

  // Vérifier le format conventionnel (optionnel, juste un warning)
  const conventionalPattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?:\s.+/i;
  if (!conventionalPattern.test(message) && message.length > 20) {
    result.warnings.push(
      `Conseil: Utilisez le format Conventional Commits (feat:, fix:, docs:, etc.) pour de meilleurs logs.`,
    );
  }

  return result;
}

/**
 * Vérifie si des fichiers sensibles sont inclus
 */
export function checkSensitiveFiles(
  files: string[],
  config: GitProtectionConfig = DEFAULT_CONFIG,
): { hasSensitive: boolean; sensitiveFiles: string[] } {
  const sensitiveFiles: string[] = [];

  for (const file of files) {
    const fileName = file.split('/').pop() || file;
    for (const pattern of config.sensitiveFilePatterns) {
      if (pattern.test(fileName) || pattern.test(file)) {
        sensitiveFiles.push(file);
        break;
      }
    }
  }

  return {
    hasSensitive: sensitiveFiles.length > 0,
    sensitiveFiles,
  };
}

/*
 * ============================================================================
 * PRE-PUSH VERIFICATION
 * ============================================================================
 */

/**
 * Effectue une vérification pre-push complète
 */
export async function prePushCheck(
  gitStatus: {
    files: Array<{ path: string; staged: boolean; status: string }>;
    ahead: number;
    behind: number;
  },
  stagedFiles: string[],
  config: GitProtectionConfig = DEFAULT_CONFIG,
): Promise<PrePushCheckResult> {
  const result: PrePushCheckResult = {
    safe: true,
    warnings: [],
    errors: [],
    uncommittedChanges: false,
    sensitiveFiles: [],
  };

  if (!config.enablePrePushCheck) {
    return result;
  }

  // Vérifier les changements non commités
  const uncommittedCount = gitStatus.files.filter((f) => !f.staged && f.status !== 'untracked').length;

  if (uncommittedCount > 0) {
    result.uncommittedChanges = true;
    result.warnings.push(
      `⚠️ ${uncommittedCount} fichier(s) modifié(s) non commité(s). Ces changements ne seront pas poussés.`,
    );
  }

  // Vérifier les fichiers sensibles dans les changements stagés
  const sensitiveCheck = checkSensitiveFiles(stagedFiles, config);
  if (sensitiveCheck.hasSensitive) {
    result.safe = false;
    result.sensitiveFiles = sensitiveCheck.sensitiveFiles;
    result.errors.push(
      `🚨 ATTENTION: Fichiers sensibles détectés dans le commit:`,
      ...sensitiveCheck.sensitiveFiles.map((f) => `  - ${f}`),
      `Ces fichiers peuvent contenir des secrets ou des credentials.`,
      `Ajoutez-les à .gitignore si ce sont des fichiers de configuration locale.`,
    );
  }

  // Vérifier si on est en retard par rapport au remote
  if (gitStatus.behind > 0) {
    result.warnings.push(
      `⚠️ Votre branche est en retard de ${gitStatus.behind} commit(s).`,
      `Effectuez un pull avant de push pour éviter les conflits.`,
    );
  }

  // Vérifier si on essaie de push sans commits
  if (gitStatus.ahead === 0) {
    result.warnings.push(`ℹ️ Aucun nouveau commit à pousser. Votre branche est à jour avec le remote.`);
  }

  return result;
}

/*
 * ============================================================================
 * BRANCH OPERATIONS
 * ============================================================================
 */

/**
 * Valide une opération de suppression de branche
 */
export function validateBranchDelete(
  branchName: string,
  force: boolean = false,
  config: GitProtectionConfig = DEFAULT_CONFIG,
): GitProtectionResult {
  const result: GitProtectionResult = {
    allowed: true,
    warnings: [],
    errors: [],
    requiresConfirmation: false,
  };

  // Interdire la suppression des branches protégées
  if (isProtectedBranch(branchName, config)) {
    result.allowed = false;
    result.errors.push(
      `❌ Impossible de supprimer la branche protégée '${branchName}'.`,
      `Les branches protégées (${config.protectedBranches.join(', ')}) ne peuvent pas être supprimées.`,
    );
    return result;
  }

  // Warning pour force delete
  if (force) {
    result.warnings.push(`⚠️ Force-delete supprimera la branche même si elle contient des commits non fusionnés.`);
    result.requiresConfirmation = true;
    result.confirmationMessage = `Confirmer la suppression forcée de '${branchName}'?`;
  }

  return result;
}

/**
 * Valide un checkout vers une branche
 */
export function validateBranchCheckout(targetBranch: string, hasUncommittedChanges: boolean): GitProtectionResult {
  const result: GitProtectionResult = {
    allowed: true,
    warnings: [],
    errors: [],
    requiresConfirmation: false,
  };

  if (hasUncommittedChanges) {
    result.warnings.push(
      `⚠️ Vous avez des changements non commités.`,
      `Ces changements seront conservés lors du checkout, mais pourraient causer des conflits.`,
      `Conseil: Commitez ou stashez vos changements avant de changer de branche.`,
    );
    result.requiresConfirmation = true;
    result.confirmationMessage = `Changer de branche avec des changements non commités?`;
  }

  return result;
}

/*
 * ============================================================================
 * CONFIGURATION HELPERS
 * ============================================================================
 */

/**
 * Créer une configuration personnalisée
 */
export function createGitProtectionConfig(overrides: Partial<GitProtectionConfig> = {}): GitProtectionConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    protectedBranches: overrides.protectedBranches || DEFAULT_CONFIG.protectedBranches,
    blockedBranches: overrides.blockedBranches || DEFAULT_CONFIG.blockedBranches,
    sensitiveFilePatterns: overrides.sensitiveFilePatterns || DEFAULT_CONFIG.sensitiveFilePatterns,
  };
}

/**
 * Obtenir la configuration par défaut
 */
export function getDefaultGitProtectionConfig(): GitProtectionConfig {
  return { ...DEFAULT_CONFIG };
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default {
  isProtectedBranch,
  isBlockedBranch,
  validatePushOperation,
  validateCommitMessage,
  checkSensitiveFiles,
  prePushCheck,
  validateBranchDelete,
  validateBranchCheckout,
  createGitProtectionConfig,
  getDefaultGitProtectionConfig,
};
