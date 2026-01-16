/**
 * Liste blanche des commandes shell autorisées pour les agents BAVINI
 *
 * Niveaux d'autorisation:
 * - 'allowed': Exécution automatique sans approbation
 * - 'approval_required': Nécessite approbation utilisateur
 * - 'blocked': Toujours refusé
 */

export type CommandAuthorizationLevel = 'allowed' | 'approval_required' | 'blocked';

export interface CommandRule {
  /** Pattern de la commande (regex ou string exacte) */
  pattern: string | RegExp;

  /** Niveau d'autorisation */
  level: CommandAuthorizationLevel;

  /** Description pour l'utilisateur */
  description: string;

  /** Raison du niveau d'autorisation */
  reason: string;
}

/**
 * Règles de commandes par défaut
 * L'ordre est important : première règle qui matche gagne
 */
export const DEFAULT_COMMAND_RULES: CommandRule[] = [
  /*
   * ============================================================================
   * COMMANDES BLOQUÉES (dangereuses)
   * ============================================================================
   */
  {
    pattern: /^rm\s+(-rf?|--recursive)/i,
    level: 'blocked',
    description: 'Suppression récursive',
    reason: 'Commande dangereuse pouvant supprimer des fichiers importants',
  },
  {
    pattern: /^rm\s+/i,
    level: 'blocked',
    description: 'Suppression de fichiers',
    reason: 'Utiliser les outils de fichiers des agents à la place',
  },
  {
    pattern: /^(curl|wget|fetch)\s+/i,
    level: 'blocked',
    description: 'Téléchargement externe',
    reason: 'Risque de sécurité - téléchargement de contenu externe',
  },
  {
    pattern: /^(sudo|su)\s+/i,
    level: 'blocked',
    description: 'Élévation de privilèges',
    reason: 'Élévation de privilèges non autorisée',
  },
  {
    pattern: /^chmod\s+/i,
    level: 'blocked',
    description: 'Modification permissions',
    reason: 'Modification des permissions non autorisée',
  },
  {
    pattern: /^chown\s+/i,
    level: 'blocked',
    description: 'Modification propriétaire',
    reason: 'Modification du propriétaire non autorisée',
  },
  {
    pattern: /[;&|`$()]/,
    level: 'blocked',
    description: 'Caractères shell spéciaux',
    reason: 'Injection de commandes potentielle détectée',
  },
  {
    pattern: /\.\.\//,
    level: 'blocked',
    description: 'Traversée de répertoire',
    reason: 'Tentative de sortir du projet détectée',
  },

  /*
   * ============================================================================
   * COMMANDES NÉCESSITANT APPROBATION
   * ============================================================================
   */
  {
    pattern: /^git\s+(push|reset|rebase|merge|checkout\s+-)/i,
    level: 'approval_required',
    description: 'Commande Git sensible',
    reason: "Cette commande Git peut modifier l'historique ou pousser du code",
  },
  {
    pattern: /^git\s+/i,
    level: 'approval_required',
    description: 'Commande Git',
    reason: 'Les opérations Git nécessitent une vérification',
  },
  {
    pattern: /^npx\s+/i,
    level: 'approval_required',
    description: 'Exécution npx',
    reason: 'npx peut télécharger et exécuter du code arbitraire',
  },
  {
    pattern: /^npm\s+publish/i,
    level: 'approval_required',
    description: 'Publication npm',
    reason: 'Publication sur npm registry',
  },
  {
    pattern: /^npm\s+link/i,
    level: 'approval_required',
    description: 'Lien npm',
    reason: 'Création de lien symbolique npm',
  },
  {
    pattern: /^(mv|cp)\s+/i,
    level: 'approval_required',
    description: 'Déplacement/copie de fichiers',
    reason: 'Opération de fichiers - vérification recommandée',
  },

  /*
   * ============================================================================
   * COMMANDES AUTORISÉES (sûres)
   * ============================================================================
   */
  {
    pattern: /^npm\s+install(\s+|$)/i,
    level: 'allowed',
    description: 'Installation npm',
    reason: 'Installation de dépendances du projet',
  },
  {
    pattern: /^npm\s+i(\s+|$)/i,
    level: 'allowed',
    description: 'Installation npm (raccourci)',
    reason: 'Installation de dépendances du projet',
  },
  {
    pattern: /^npm\s+ci(\s+|$)/i,
    level: 'allowed',
    description: 'Installation npm clean',
    reason: 'Installation propre des dépendances',
  },
  {
    pattern: /^npm\s+run\s+(dev|start|build|test|lint|format|preview)/i,
    level: 'allowed',
    description: 'Script npm standard',
    reason: 'Script de développement standard',
  },
  {
    pattern: /^npm\s+run\s+\w+/i,
    level: 'approval_required',
    description: 'Script npm personnalisé',
    reason: 'Script personnalisé - vérification recommandée',
  },
  {
    pattern: /^npm\s+(ls|list|outdated|audit|view|info)/i,
    level: 'allowed',
    description: 'Commande npm lecture seule',
    reason: 'Commande de lecture uniquement',
  },
  {
    pattern: /^pnpm\s+(install|i|add|run\s+(dev|start|build|test|lint))/i,
    level: 'allowed',
    description: 'Commande pnpm standard',
    reason: 'Commande pnpm de développement standard',
  },
  {
    pattern: /^yarn\s+(install|add|run\s+(dev|start|build|test|lint))/i,
    level: 'allowed',
    description: 'Commande yarn standard',
    reason: 'Commande yarn de développement standard',
  },
  {
    pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|grep|find)\s*/i,
    level: 'allowed',
    description: 'Commande lecture seule',
    reason: 'Commande de lecture/affichage uniquement',
  },
  {
    pattern: /^mkdir\s+/i,
    level: 'allowed',
    description: 'Création de dossier',
    reason: 'Création de dossier dans le projet',
  },
  {
    pattern: /^touch\s+/i,
    level: 'allowed',
    description: 'Création de fichier vide',
    reason: 'Création de fichier vide',
  },
  {
    pattern: /^node\s+/i,
    level: 'approval_required',
    description: 'Exécution Node.js',
    reason: 'Exécution de script Node.js',
  },
  {
    pattern: /^tsc(\s+|$)/i,
    level: 'allowed',
    description: 'Compilation TypeScript',
    reason: 'Compilation TypeScript',
  },
  {
    pattern: /^eslint(\s+|$)/i,
    level: 'allowed',
    description: 'Linting ESLint',
    reason: 'Vérification du code',
  },
  {
    pattern: /^prettier(\s+|$)/i,
    level: 'allowed',
    description: 'Formatage Prettier',
    reason: 'Formatage du code',
  },
];

/**
 * Résultat de la vérification d'une commande
 */
export interface CommandCheckResult {
  /** La commande est-elle autorisée ? */
  allowed: boolean;

  /** Niveau d'autorisation */
  level: CommandAuthorizationLevel;

  /** Message explicatif */
  message: string;

  /** Règle qui a matché (si applicable) */
  matchedRule?: CommandRule;

  /** La commande originale */
  command: string;
}

/**
 * Vérifie si une commande est autorisée selon la liste blanche
 */
export function checkCommand(command: string, rules: CommandRule[] = DEFAULT_COMMAND_RULES): CommandCheckResult {
  const trimmedCommand = command.trim();

  // Commande vide
  if (!trimmedCommand) {
    return {
      allowed: false,
      level: 'blocked',
      message: 'Commande vide',
      command: trimmedCommand,
    };
  }

  // Vérifier chaque règle dans l'ordre
  for (const rule of rules) {
    const matches =
      typeof rule.pattern === 'string'
        ? trimmedCommand.toLowerCase().startsWith(rule.pattern.toLowerCase())
        : rule.pattern.test(trimmedCommand);

    if (matches) {
      return {
        allowed: rule.level === 'allowed',
        level: rule.level,
        message:
          rule.level === 'blocked'
            ? `Commande bloquée: ${rule.reason}`
            : rule.level === 'approval_required'
              ? `Approbation requise: ${rule.reason}`
              : `Commande autorisée: ${rule.description}`,
        matchedRule: rule,
        command: trimmedCommand,
      };
    }
  }

  // Par défaut : bloquer les commandes non reconnues
  return {
    allowed: false,
    level: 'blocked',
    message: 'Commande non reconnue - bloquée par défaut pour des raisons de sécurité',
    command: trimmedCommand,
  };
}

/**
 * Vérifie si une commande nécessite une approbation
 */
export function requiresApproval(command: string, rules: CommandRule[] = DEFAULT_COMMAND_RULES): boolean {
  const result = checkCommand(command, rules);
  return result.level === 'approval_required';
}

/**
 * Vérifie si une commande est bloquée
 */
export function isBlocked(command: string, rules: CommandRule[] = DEFAULT_COMMAND_RULES): boolean {
  const result = checkCommand(command, rules);
  return result.level === 'blocked';
}

/**
 * Vérifie si une commande est directement autorisée (sans approbation)
 */
export function isDirectlyAllowed(command: string, rules: CommandRule[] = DEFAULT_COMMAND_RULES): boolean {
  const result = checkCommand(command, rules);
  return result.level === 'allowed';
}

/**
 * Obtenir une description user-friendly d'une commande
 */
export function getCommandDescription(command: string, rules: CommandRule[] = DEFAULT_COMMAND_RULES): string {
  const result = checkCommand(command, rules);
  return result.matchedRule?.description || 'Commande shell';
}
