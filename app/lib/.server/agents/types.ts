/**
 * Types et interfaces pour le système d'agents BAVINI
 *
 * Ce module définit les contrats pour les agents Chat Mode et Agent Mode,
 * permettant une analyse intelligente avant l'exécution d'actions.
 */

/*
 * =============================================================================
 * Agent Capabilities & Restrictions
 * =============================================================================
 */

/**
 * Capacités disponibles pour les agents
 */
export type AgentCapability =
  | 'read_files'
  | 'analyze_code'
  | 'inspect_logs'
  | 'explain_errors'
  | 'suggest_solutions'
  | 'plan_features'
  | 'create_files'
  | 'modify_files'
  | 'execute_shell'
  | 'install_packages'
  | 'deploy';

/**
 * Modes d'opération des agents
 * - 'chat': Analyse seule (lecture seule, pas de modifications)
 * - 'agent': Mode action (BAVINI peut créer/modifier du code)
 * - 'plan': Mode planification (exploration + plan avant exécution)
 */
export type AgentMode = 'chat' | 'agent' | 'plan';

/*
 * =============================================================================
 * Plan Mode Types
 * =============================================================================
 */

/**
 * État du mode planification
 */
export interface PlanModeState {
  /** Mode plan actif */
  isActive: boolean;

  /** Phase actuelle */
  phase: PlanPhase;

  /** Le plan en cours de rédaction */
  currentPlan: Plan | null;

  /** Permissions demandées */
  requestedPermissions: PlanPermission[];

  /** Le plan a-t-il été approuvé */
  isApproved: boolean;
}

/**
 * Phases du mode plan
 */
export type PlanPhase = 'exploring' | 'drafting' | 'awaiting_approval' | 'approved' | 'rejected';

/**
 * Structure d'un plan
 */
export interface Plan {
  /** ID unique du plan */
  id: string;

  /** Titre du plan */
  title: string;

  /** Description résumée */
  summary: string;

  /** Contenu détaillé du plan (markdown) */
  content: string;

  /** Étapes du plan */
  steps: PlanStep[];

  /** Fichiers critiques identifiés */
  criticalFiles: string[];

  /** Estimations */
  estimates: PlanEstimates;

  /** Permissions nécessaires */
  permissions: PlanPermission[];

  /** Date de création */
  createdAt: Date;

  /** Date de mise à jour */
  updatedAt: Date;
}

/**
 * Étape d'un plan
 */
export interface PlanStep {
  /** Numéro de l'étape */
  order: number;

  /** Description de l'étape */
  description: string;

  /** Type d'action */
  actionType: 'create' | 'modify' | 'delete' | 'command' | 'test' | 'review';

  /** Fichiers concernés */
  files?: string[];

  /** Commandes à exécuter */
  commands?: string[];

  /** Dépend des étapes */
  dependsOn?: number[];

  /** Risque */
  risk: 'low' | 'medium' | 'high';
}

/**
 * Permission demandée pour le plan
 */
export interface PlanPermission {
  /** Type de permission */
  type: 'bash' | 'file_write' | 'file_delete' | 'install' | 'git';

  /** Description sémantique */
  description: string;

  /** Pattern ou scope */
  scope?: string;

  /** Accordée ou non */
  granted: boolean;
}

/*
 * =============================================================================
 * Agent Context
 * =============================================================================
 */

/**
 * Contexte fourni à l'agent pour l'analyse
 */
export interface AgentContext {
  /** Fichiers du projet pertinents */
  files: ProjectFile[];

  /** Historique des messages */
  messageHistory: AgentMessage[];

  /** État actuel du projet */
  projectState: ProjectState;

  /** Erreurs récentes */
  recentErrors: ProjectError[];

  /** Logs récents */
  recentLogs: string[];
}

/**
 * Fichier du projet
 */
export interface ProjectFile {
  path: string;
  content: string;
  language: string;
  lastModified?: Date;
}

/**
 * Message dans l'historique
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  mode?: AgentMode;
}

/**
 * État du projet
 */
export interface ProjectState {
  /** Le projet est-il en cours de build */
  isBuilding: boolean;

  /** Le projet a-t-il des erreurs */
  hasErrors: boolean;

  /** Nombre de fichiers */
  fileCount: number;

  /** Stack technique détectée */
  techStack: string[];

  /** Score de qualité actuel */
  qualityScore?: number;
}

/**
 * Erreur du projet
 */
export interface ProjectError {
  type: 'build' | 'runtime' | 'lint' | 'type';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  timestamp: Date;
}

/*
 * =============================================================================
 * Agent Responses
 * =============================================================================
 */

/**
 * Réponse du Chat Mode Agent
 */
export interface ChatModeResponse {
  /** Type de réponse */
  type: 'analysis';

  /** Contenu de l'analyse */
  content: string;

  /** Sections structurées de la réponse */
  sections: ChatResponseSections;

  /** Suggestions d'amélioration */
  suggestions: string[];

  /** Peut-on passer en mode Agent ? */
  canProceedToAgentMode: boolean;

  /** Actions proposées si passage en Agent Mode */
  proposedActions: ProposedAction[];
}

/**
 * Sections de la réponse Chat Mode
 */
export interface ChatResponseSections {
  /** Analyse de la situation */
  analysis?: string;

  /** Diagnostic du problème */
  diagnostic?: string;

  /** Suggestions d'amélioration */
  suggestions?: string;

  /** Prochaines étapes */
  nextSteps?: string;
}

/**
 * Réponse du Agent Mode
 */
export interface AgentModeResponse {
  /** Type de réponse */
  type: 'execution' | 'plan' | 'response';

  /** Statut de l'exécution */
  status?: 'ready' | 'awaiting_approval' | 'no_action' | 'completed' | 'failed';

  /** Plan d'exécution */
  plan?: ExecutionPlan;

  /** Résultats des actions */
  results?: ActionResult[];

  /** Message de réponse */
  message?: string;

  /** Résumé de l'exécution */
  summary?: string;

  /** Erreurs rencontrées */
  errors?: ExecutionError[];

  /** Suggestions */
  suggestions?: string[];

  /** Peut-on exécuter le plan */
  canExecute?: boolean;
}

/*
 * =============================================================================
 * Execution Planning
 * =============================================================================
 */

/**
 * Plan d'exécution pour le Agent Mode
 */
export interface ExecutionPlan {
  /** ID unique du plan */
  id?: string;

  /** Description du plan */
  description?: string;

  /** Actions à exécuter */
  actions: ProposedAction[];

  /** Ordre d'exécution */
  executionOrder?: string[];

  /** Dépendances entre actions */
  dependencies?: ActionDependency[] | Array<{ from: string; to: string }>;

  /** Estimations */
  estimates: PlanEstimates;

  /** Le plan nécessite-t-il validation ? */
  requiresApproval?: boolean;
}

/**
 * Action proposée
 */
export interface ProposedAction {
  /** ID unique de l'action */
  id: string;

  /** Type d'action */
  type: ActionType;

  /** Description lisible */
  description: string;

  /** Détails de l'action */
  details: ActionDetails;

  /** Risque associé */
  risk: 'low' | 'medium' | 'high';

  /** Action réversible ? */
  reversible: boolean;
}

/**
 * Types d'actions possibles
 */
export type ActionType =
  | 'create_file'
  | 'modify_file'
  | 'delete_file'
  | 'run_command'
  | 'install_package'
  | 'git_operation'
  | 'deploy';

/**
 * Détails spécifiques à chaque type d'action
 */
export type ActionDetails =
  | CreateFileDetails
  | ModifyFileDetails
  | DeleteFileDetails
  | RunCommandDetails
  | InstallPackageDetails
  | GitOperationDetails
  | DeployDetails;

export interface CreateFileDetails {
  type: 'create_file';
  path: string;
  content: string;
  language: string;
}

export interface ModifyFileDetails {
  type: 'modify_file';
  path: string;
  changes: FileChange[];
}

export interface FileChange {
  /** Type de changement */
  type: 'insert' | 'replace' | 'delete';

  /** Ligne de début (1-indexed) */
  startLine?: number;

  /** Ligne de fin (1-indexed) */
  endLine?: number;

  /** Ancien contenu (pour replace/delete) */
  oldContent?: string;

  /** Nouveau contenu (pour insert/replace) */
  newContent?: string;

  /** Contenu à insérer/remplacer */
  content: string;

  /** Position d'insertion (pour insert) */
  position?: number;

  /** Pattern à rechercher (pour replace/delete) */
  search?: string | RegExp;
}

export interface DeleteFileDetails {
  type: 'delete_file';
  path: string;
}

export interface RunCommandDetails {
  type: 'run_command';
  command: string;

  /** Répertoire de travail */
  cwd?: string;

  /** Alias pour cwd */
  workingDirectory?: string;
}

export interface InstallPackageDetails {
  type: 'install_package';

  /** Nom du package */
  packageName: string;

  /** Alias pour packageName */
  name?: string;

  /** Version spécifique */
  version?: string;

  /** Dépendance de développement */
  isDev: boolean;

  /** Gestionnaire de packages */
  packageManager?: 'npm' | 'pnpm' | 'yarn';
}

export interface GitOperationDetails {
  type: 'git_operation';
  operation: 'commit' | 'push' | 'pull' | 'branch' | 'merge' | 'checkout';

  /** Paramètres de l'opération */
  params: Record<string, string>;

  /** Branche cible */
  branch?: string;

  /** Message de commit */
  message?: string;
}

export interface DeployDetails {
  type: 'deploy';
  platform: string;
  environment: string;
}

/**
 * Dépendance entre actions
 */
export interface ActionDependency {
  actionId: string;
  dependsOn: string[];
}

/**
 * Estimations du plan
 */
export interface PlanEstimates {
  /** Durée estimée */
  duration: string;

  /** Nombre de fichiers affectés */
  filesAffected: number;

  /** Lignes de code modifiées */
  linesChanged: number;

  /** Niveau de risque */
  risk: 'low' | 'medium' | 'high';

  /** Nombre total d'actions */
  totalActions?: number;

  /** Fichiers à créer */
  filesToCreate?: number;

  /** Fichiers à modifier */
  filesToModify?: number;

  /** Commandes à exécuter */
  commandsToRun?: number;
}

/*
 * =============================================================================
 * Action Results
 * =============================================================================
 */

/**
 * Résultat d'une action exécutée
 */
export interface ActionResult {
  /** ID de l'action */
  actionId: string;

  /** Succès ou échec */
  success: boolean;

  /** Message de résultat */
  message: string;

  /** Sortie de la commande si applicable */
  output?: string;

  /** Durée d'exécution en ms */
  duration: number;

  /** Données de rollback */
  rollbackData?: RollbackData;
}

/**
 * Type de rollback
 */
export type RollbackType = 'delete' | 'restore' | 'create' | 'uninstall';

/**
 * Données pour annuler une action
 */
export interface RollbackData {
  actionId: string;
  type: RollbackType;
  data: RollbackFileData | RollbackPackageData;
}

/**
 * Données de rollback pour les fichiers
 */
export interface RollbackFileData {
  path: string;
  content?: string;
}

/**
 * Données de rollback pour les packages
 */
export interface RollbackPackageData {
  name: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn';
}

/**
 * Erreur d'exécution
 */
export interface ExecutionError {
  /** ID de l'action (optionnel pour erreurs générales) */
  actionId?: string;

  /** Code d'erreur */
  code: string;

  /** Message d'erreur */
  message: string;

  /** Stack trace */
  stack?: string;

  /** L'erreur est-elle récupérable */
  recoverable?: boolean;
}

/*
 * =============================================================================
 * Agent Configuration
 * =============================================================================
 */

/**
 * Configuration d'un agent
 */
export interface AgentConfig {
  /** Mode de l'agent */
  mode: AgentMode;

  /** Capacités activées */
  capabilities: AgentCapability[];

  /** Restrictions */
  restrictions: AgentCapability[];

  /** Langue de réponse */
  language: 'fr' | 'en';

  /** Verbosité des réponses */
  verbosity: 'concise' | 'normal' | 'detailed';

  /** Validation automatique ou manuelle */
  autoApprove: boolean;
}

/**
 * Configuration par défaut du Chat Mode
 */
export const CHAT_MODE_CONFIG: AgentConfig = {
  mode: 'chat',
  capabilities: ['read_files', 'analyze_code', 'inspect_logs', 'explain_errors', 'suggest_solutions', 'plan_features'],
  restrictions: ['create_files', 'modify_files', 'execute_shell', 'install_packages', 'deploy'],
  language: 'fr',
  verbosity: 'normal',
  autoApprove: false,
};

/**
 * Configuration par défaut du Agent Mode
 */
export const AGENT_MODE_CONFIG: AgentConfig = {
  mode: 'agent',
  capabilities: [
    'read_files',
    'analyze_code',
    'inspect_logs',
    'explain_errors',
    'suggest_solutions',
    'plan_features',
    'create_files',
    'modify_files',
    'execute_shell',
    'install_packages',
    'deploy',
  ],
  restrictions: [],
  language: 'fr',
  verbosity: 'normal',
  autoApprove: false,
};

/**
 * Configuration par défaut du Plan Mode
 * Mode lecture seule pour exploration, puis rédaction du plan
 */
export const PLAN_MODE_CONFIG: AgentConfig = {
  mode: 'plan',
  capabilities: ['read_files', 'analyze_code', 'inspect_logs', 'explain_errors', 'suggest_solutions', 'plan_features'],
  restrictions: ['create_files', 'modify_files', 'execute_shell', 'install_packages', 'deploy'],
  language: 'fr',
  verbosity: 'detailed',
  autoApprove: false,
};
