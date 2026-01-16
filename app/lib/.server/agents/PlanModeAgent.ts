/**
 * PlanModeAgent - Agent de planification
 *
 * Cet agent permet de planifier une implémentation avant de l'exécuter.
 * Il explore le codebase, rédige un plan détaillé, et demande l'approbation
 * de l'utilisateur avant de passer en mode exécution.
 *
 * Workflow:
 * 1. Entrée en mode plan (exploration autorisée, modifications bloquées)
 * 2. Exploration du codebase pour comprendre le contexte
 * 3. Rédaction du plan avec étapes détaillées
 * 4. Demande de permissions groupées
 * 5. Attente de l'approbation utilisateur
 * 6. Si approuvé: sortie du mode plan et exécution
 */

import { BaseAgent } from './BaseAgent';
import type { Plan, PlanStep, PlanPermission, PlanPhase, PlanModeState, PlanEstimates } from './types';
import { PLAN_MODE_CONFIG } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PlanModeAgent');

/**
 * Réponse du mode Plan
 */
export interface PlanModeResponse {
  /** Type de réponse */
  type: 'exploration' | 'plan_draft' | 'plan_ready' | 'error';

  /** Phase actuelle */
  phase: PlanPhase;

  /** Message de statut */
  message: string;

  /** Le plan (si disponible) */
  plan?: Plan;

  /** Fichiers explorés */
  exploredFiles?: string[];

  /** Questions pour l'utilisateur */
  questions?: PlanQuestion[];
}

/**
 * Question pour clarifier le plan
 */
export interface PlanQuestion {
  id: string;
  question: string;
  options?: string[];
  required: boolean;
}

/**
 * Agent en mode Planification
 *
 * Capacités:
 * - Lire des fichiers (exploration)
 * - Analyser le code
 * - Rechercher des patterns
 * - Rédiger un plan structuré
 *
 * Restrictions (en mode plan):
 * - Pas de création de fichiers
 * - Pas de modification de fichiers
 * - Pas d'exécution de commandes
 * - Pas d'installation de packages
 */
export class PlanModeAgent extends BaseAgent<PlanModeResponse> {
  private state: PlanModeState;
  private exploredFiles: Set<string> = new Set();

  constructor() {
    super(PLAN_MODE_CONFIG);
    this.state = this.createInitialState();
    logger.debug('PlanModeAgent initialized');
  }

  /**
   * Crée l'état initial du mode plan
   */
  private createInitialState(): PlanModeState {
    return {
      isActive: false,
      phase: 'exploring',
      currentPlan: null,
      requestedPermissions: [],
      isApproved: false,
    };
  }

  /**
   * Entre en mode planification
   */
  enterPlanMode(): void {
    logger.info('Entering plan mode');
    this.state = {
      ...this.createInitialState(),
      isActive: true,
      phase: 'exploring',
    };
    this.exploredFiles.clear();
  }

  /**
   * Sort du mode planification
   */
  exitPlanMode(approved: boolean): void {
    logger.info('Exiting plan mode', { approved });
    this.state.isActive = false;
    this.state.phase = approved ? 'approved' : 'rejected';
    this.state.isApproved = approved;
  }

  /**
   * Vérifie si le mode plan est actif
   */
  isPlanModeActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Retourne l'état actuel
   */
  getState(): PlanModeState {
    return { ...this.state };
  }

  /**
   * Retourne le plan actuel
   */
  getCurrentPlan(): Plan | null {
    return this.state.currentPlan;
  }

  /**
   * Traite un message en mode plan
   */
  async process(userMessage: string): Promise<PlanModeResponse> {
    logger.debug('Processing message in Plan mode', {
      phase: this.state.phase,
      messageLength: userMessage.length,
    });

    if (!this.state.isActive) {
      return {
        type: 'error',
        phase: this.state.phase,
        message: "Le mode plan n'est pas actif. Utilisez enterPlanMode() d'abord.",
      };
    }

    // En mode plan, on retourne une réponse indiquant qu'on est prêt à explorer
    return {
      type: 'exploration',
      phase: this.state.phase,
      message: 'Mode plan actif. Je peux explorer le codebase et rédiger un plan.',
      exploredFiles: Array.from(this.exploredFiles),
    };
  }

  /**
   * Marque un fichier comme exploré
   */
  markFileExplored(path: string): void {
    this.exploredFiles.add(path);
  }

  /**
   * Crée un nouveau plan
   */
  createPlan(params: {
    title: string;
    summary: string;
    content: string;
    steps: Omit<PlanStep, 'order'>[];
    criticalFiles: string[];
    permissions: Omit<PlanPermission, 'granted'>[];
  }): Plan {
    const plan: Plan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: params.title,
      summary: params.summary,
      content: params.content,
      steps: params.steps.map((step, index) => ({
        ...step,
        order: index + 1,
      })),
      criticalFiles: params.criticalFiles,
      estimates: this.estimatePlan(params.steps),
      permissions: params.permissions.map((p) => ({ ...p, granted: false })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.state.currentPlan = plan;
    this.state.requestedPermissions = plan.permissions;
    this.state.phase = 'awaiting_approval';

    logger.info('Plan created', {
      planId: plan.id,
      stepsCount: plan.steps.length,
      permissionsCount: plan.permissions.length,
    });

    return plan;
  }

  /**
   * Met à jour le plan existant
   */
  updatePlan(updates: Partial<Omit<Plan, 'id' | 'createdAt'>>): Plan | null {
    if (!this.state.currentPlan) {
      logger.warn('No plan to update');
      return null;
    }

    this.state.currentPlan = {
      ...this.state.currentPlan,
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.steps) {
      this.state.currentPlan.estimates = this.estimatePlan(updates.steps);
    }

    logger.debug('Plan updated', { planId: this.state.currentPlan.id });

    return this.state.currentPlan;
  }

  /**
   * Accorde une permission
   */
  grantPermission(permissionIndex: number): void {
    if (this.state.currentPlan && this.state.currentPlan.permissions[permissionIndex]) {
      this.state.currentPlan.permissions[permissionIndex].granted = true;
      this.state.requestedPermissions = this.state.currentPlan.permissions;
      logger.debug('Permission granted', { index: permissionIndex });
    }
  }

  /**
   * Accorde toutes les permissions
   */
  grantAllPermissions(): void {
    if (this.state.currentPlan) {
      this.state.currentPlan.permissions.forEach((p) => (p.granted = true));
      this.state.requestedPermissions = this.state.currentPlan.permissions;
      logger.debug('All permissions granted');
    }
  }

  /**
   * Approuve le plan
   */
  approvePlan(): Plan | null {
    if (!this.state.currentPlan) {
      logger.warn('No plan to approve');
      return null;
    }

    // Vérifier que toutes les permissions sont accordées
    const ungrantedPermissions = this.state.currentPlan.permissions.filter((p) => !p.granted);

    if (ungrantedPermissions.length > 0) {
      logger.warn('Cannot approve plan: some permissions not granted', {
        ungranted: ungrantedPermissions.map((p) => p.description),
      });
      return null;
    }

    this.state.phase = 'approved';
    this.state.isApproved = true;

    logger.info('Plan approved', { planId: this.state.currentPlan.id });

    return this.state.currentPlan;
  }

  /**
   * Rejette le plan
   */
  rejectPlan(reason?: string): void {
    logger.info('Plan rejected', {
      planId: this.state.currentPlan?.id,
      reason,
    });
    this.state.phase = 'rejected';
    this.state.isApproved = false;
  }

  /**
   * Estime les ressources nécessaires pour le plan
   */
  private estimatePlan(steps: Omit<PlanStep, 'order'>[]): PlanEstimates {
    const filesToCreate = steps.filter((s) => s.actionType === 'create').length;
    const filesToModify = steps.filter((s) => s.actionType === 'modify').length;
    const commandsToRun = steps.filter((s) => s.actionType === 'command').length;
    const testsToRun = steps.filter((s) => s.actionType === 'test').length;

    // Calculer le risque global
    const highRiskSteps = steps.filter((s) => s.risk === 'high').length;
    const mediumRiskSteps = steps.filter((s) => s.risk === 'medium').length;

    let overallRisk: 'low' | 'medium' | 'high' = 'low';

    if (highRiskSteps > 0) {
      overallRisk = 'high';
    } else if (mediumRiskSteps > steps.length / 2) {
      overallRisk = 'medium';
    }

    // Estimer la durée (très approximatif)
    const totalFiles = filesToCreate + filesToModify;
    const estimatedMinutes = totalFiles * 2 + commandsToRun * 1 + testsToRun * 3;

    return {
      duration:
        estimatedMinutes < 5
          ? 'Quelques minutes'
          : estimatedMinutes < 15
            ? '10-15 minutes'
            : estimatedMinutes < 30
              ? '20-30 minutes'
              : 'Plus de 30 minutes',
      filesAffected: totalFiles,
      linesChanged: 0, // Sera mis à jour après génération du contenu
      risk: overallRisk,
      totalActions: steps.length,
      filesToCreate,
      filesToModify,
      commandsToRun,
    };
  }

  /**
   * Retourne le prompt système pour le mode Plan
   */
  getSystemPrompt(): string {
    return PLAN_MODE_SYSTEM_PROMPT;
  }

  /**
   * Convertit le plan en markdown pour affichage
   */
  planToMarkdown(plan: Plan): string {
    const lines: string[] = [`# ${plan.title}`, '', plan.summary, '', '## Étapes du plan', ''];

    for (const step of plan.steps) {
      const riskIcon = step.risk === 'high' ? '🔴' : step.risk === 'medium' ? '🟡' : '🟢';
      lines.push(`### ${step.order}. ${step.description} ${riskIcon}`);

      if (step.files && step.files.length > 0) {
        lines.push('');
        lines.push('**Fichiers:**');
        step.files.forEach((f) => lines.push(`- \`${f}\``));
      }

      if (step.commands && step.commands.length > 0) {
        lines.push('');
        lines.push('**Commandes:**');
        step.commands.forEach((c) => lines.push(`\`\`\`bash\n${c}\n\`\`\``));
      }

      lines.push('');
    }

    lines.push('## Estimations');
    lines.push('');
    lines.push(`- **Durée estimée:** ${plan.estimates.duration}`);
    lines.push(`- **Fichiers affectés:** ${plan.estimates.filesAffected}`);
    lines.push(`- **Risque global:** ${plan.estimates.risk}`);
    lines.push('');

    if (plan.permissions.length > 0) {
      lines.push('## Permissions requises');
      lines.push('');
      plan.permissions.forEach((p) => {
        const status = p.granted ? '✅' : '⏳';
        lines.push(`${status} ${p.description}`);
      });
    }

    return lines.join('\n');
  }
}

/*
 * =============================================================================
 * Plan Mode System Prompt
 * =============================================================================
 */

export const PLAN_MODE_SYSTEM_PROMPT = `
Tu es BAVINI en MODE PLAN. Dans ce mode, tu explores et planifies AVANT d'exécuter.

## RÈGLES DU MODE PLAN

### Ce que tu PEUX faire:
- Lire des fichiers (read_file, grep, glob, list_directory)
- Analyser le code existant
- Rechercher des patterns et dépendances
- Poser des questions de clarification
- Rédiger un plan détaillé

### Ce que tu NE PEUX PAS faire:
- Créer des fichiers
- Modifier des fichiers
- Exécuter des commandes shell
- Installer des packages

## WORKFLOW

### 1. Phase d'exploration
- Explore le codebase pour comprendre la structure
- Identifie les fichiers critiques à modifier
- Analyse les dépendances et impacts potentiels
- Note les patterns et conventions existants

### 2. Phase de rédaction du plan
Quand tu as assez d'informations, rédige un plan structuré:

\`\`\`markdown
# [Titre du plan]

## Résumé
[Description courte de ce qui sera fait]

## Étapes

### 1. [Première étape]
**Type:** create/modify/command
**Fichiers:** \`path/to/file.ts\`
**Risque:** low/medium/high
**Description:** [Ce qui sera fait]

### 2. [Deuxième étape]
...

## Fichiers critiques
- \`file1.ts\` - [raison]
- \`file2.ts\` - [raison]

## Permissions requises
- [ ] Exécuter des commandes npm
- [ ] Créer des fichiers dans src/
- [ ] Modifier des fichiers existants
\`\`\`

### 3. Demande d'approbation
Une fois le plan rédigé, demande l'approbation de l'utilisateur.
N'exécute RIEN sans approbation explicite.

## FORMAT DE RÉPONSE

### Pendant l'exploration:
"Je vais d'abord explorer [aspect] pour comprendre [objectif]."
[Utilise les outils de lecture]
"J'ai trouvé que [découverte]. Cela implique [conséquence]."

### Quand le plan est prêt:
"Voici mon plan d'implémentation:"
[Plan en markdown]
"Voulez-vous que je procède avec ce plan ?"

## RÈGLES IMPORTANTES

1. JAMAIS d'exécution sans approbation du plan
2. Pose des questions si les requirements sont ambigus
3. Identifie les risques et les mentionne explicitement
4. Propose des alternatives si pertinent
5. Sois exhaustif dans l'exploration avant de planifier
6. Réponds en français
`;

export default PlanModeAgent;
