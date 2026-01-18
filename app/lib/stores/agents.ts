/**
 * Store Nanostores pour la gestion de l'état des agents BAVINI
 * Gère le statut, les logs, et les tâches des agents
 */

import { atom, map, computed } from 'nanostores';
import type { AgentType, AgentStatus, Task, TaskStatus, LogEntry, AgentEvent, TaskResult } from '../agents/types';
import { CircularBuffer } from '~/lib/utils/circular-buffer';

// Re-export types for consumers
export type { LogEntry, AgentType, AgentStatus, LogLevel } from '../agents/types';

/*
 * ============================================================================
 * BUFFERS CIRCULAIRES POUR OPTIMISATION O(1)
 * ============================================================================
 * LAZY INITIALIZATION: Les buffers ne sont créés que lors du premier accès
 * pour éviter de bloquer le chargement de la page.
 */

const AGENT_LOGS_CAPACITY = 100;
const SYSTEM_LOGS_CAPACITY = 500;
const COMPLETED_TASKS_CAPACITY = 100;

// Buffers pour chaque agent - initialisés à la demande
let _agentLogBuffers: Record<AgentType, CircularBuffer<LogEntry>> | null = null;
let _systemLogsBuffer: CircularBuffer<LogEntry> | null = null;
let _completedTasksBuffer: CircularBuffer<Task & { result: TaskResult }> | null = null;

/**
 * Obtient les buffers de logs des agents, les créant si nécessaire.
 * Utilise l'initialisation lazy pour éviter de bloquer le chargement initial.
 */
function getAgentLogBuffers(): Record<AgentType, CircularBuffer<LogEntry>> {
  if (!_agentLogBuffers) {
    _agentLogBuffers = {
      orchestrator: new CircularBuffer(AGENT_LOGS_CAPACITY),
      explore: new CircularBuffer(AGENT_LOGS_CAPACITY),
      coder: new CircularBuffer(AGENT_LOGS_CAPACITY),
      builder: new CircularBuffer(AGENT_LOGS_CAPACITY),
      tester: new CircularBuffer(AGENT_LOGS_CAPACITY),
      deployer: new CircularBuffer(AGENT_LOGS_CAPACITY),
      reviewer: new CircularBuffer(AGENT_LOGS_CAPACITY),
      fixer: new CircularBuffer(AGENT_LOGS_CAPACITY),
      architect: new CircularBuffer(AGENT_LOGS_CAPACITY),
    };
  }
  return _agentLogBuffers;
}

/**
 * Obtient le buffer de logs système, le créant si nécessaire.
 */
function getSystemLogsBuffer(): CircularBuffer<LogEntry> {
  if (!_systemLogsBuffer) {
    _systemLogsBuffer = new CircularBuffer<LogEntry>(SYSTEM_LOGS_CAPACITY);
  }
  return _systemLogsBuffer;
}

/**
 * Obtient le buffer des tâches complétées, le créant si nécessaire.
 */
function getCompletedTasksBuffer(): CircularBuffer<Task & { result: TaskResult }> {
  if (!_completedTasksBuffer) {
    _completedTasksBuffer = new CircularBuffer<Task & { result: TaskResult }>(COMPLETED_TASKS_CAPACITY);
  }
  return _completedTasksBuffer;
}

/*
 * ============================================================================
 * STORES D'ÉTAT DES AGENTS
 * ============================================================================
 */

/**
 * Statut de chaque agent
 */
export const agentStatusStore = map<Record<AgentType, AgentStatus>>({
  orchestrator: 'idle',
  explore: 'idle',
  coder: 'idle',
  builder: 'idle',
  tester: 'idle',
  deployer: 'idle',
  reviewer: 'idle',
  fixer: 'idle',
  architect: 'idle',
});

/**
 * Agents actuellement actifs (en cours d'exécution)
 */
export const activeAgentsStore = atom<AgentType[]>([]);

/**
 * Tâche en cours pour chaque agent
 */
export const currentTasksStore = map<Record<AgentType, Task | null>>({
  orchestrator: null,
  explore: null,
  coder: null,
  builder: null,
  tester: null,
  deployer: null,
  reviewer: null,
  fixer: null,
  architect: null,
});

/*
 * ============================================================================
 * STORES DE LOGS
 * ============================================================================
 */

/**
 * Logs de chaque agent (derniers 100 par agent)
 */
export const agentLogsStore = map<Record<AgentType, LogEntry[]>>({
  orchestrator: [],
  explore: [],
  coder: [],
  builder: [],
  tester: [],
  deployer: [],
  reviewer: [],
  fixer: [],
  architect: [],
});

/**
 * Logs globaux du système (derniers 500)
 */
export const systemLogsStore = atom<LogEntry[]>([]);

/*
 * ============================================================================
 * STORES DE TÂCHES
 * ============================================================================
 */

/**
 * Queue des tâches en attente
 */
export const taskQueueStore = atom<Task[]>([]);

/**
 * Historique des tâches complétées
 */
export const completedTasksStore = atom<Array<Task & { result: TaskResult }>>([]);

/**
 * Tâche actuellement en cours d'exécution par l'orchestrateur
 */
export const currentOrchestratorTaskStore = atom<Task | null>(null);

/**
 * Action en cours d'exécution (pour UI indicators)
 */
export interface CurrentAction {
  type: string;
  description: string;
  filePath?: string;
  agentName?: AgentType;
}

export const currentActionStore = atom<CurrentAction | null>(null);

/**
 * Définit l'action actuellement en cours d'exécution.
 * Utilisé pour afficher des indicateurs visuels dans l'UI.
 *
 * @param action - L'action en cours (type, description, filePath, agentName) ou null
 * @returns void
 */
export function setCurrentAction(action: CurrentAction | null): void {
  currentActionStore.set(action);
}

/*
 * ============================================================================
 * MEMOIZATION UTILITIES
 * ============================================================================
 */

/**
 * Shallow equality check for memoization.
 * Prevents unnecessary re-renders when computed values haven't actually changed.
 */
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  if (a === null || b === null) {
    return false;
  }

  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }

    return true;
  }

  // Object comparison
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Create a memoized computed store that only triggers updates when the value actually changes.
 * Uses shallow equality for comparison.
 */
function memoizedComputed<T, R>(
  store: { subscribe: (cb: (value: T) => void) => () => void; get: () => T },
  transform: (value: T) => R,
): { subscribe: (cb: (value: R) => void) => () => void; get: () => R } {
  let lastValue: R | undefined;
  let initialized = false;

  const computedStore = computed(store, (value) => {
    const newValue = transform(value);

    // On first call or if value changed, update
    if (!initialized || !shallowEqual(lastValue as R, newValue)) {
      lastValue = newValue;
      initialized = true;
    }

    // Return cached value to prevent unnecessary object creation
    return lastValue as R;
  });

  return computedStore;
}

/*
 * ============================================================================
 * STORES CALCULÉS
 * ============================================================================
 */

/**
 * Nombre d'agents actifs
 */
export const activeAgentCountStore = computed(activeAgentsStore, (agents) => agents.length);

/**
 * Agents disponibles (idle)
 */
export const availableAgentsStore = computed(agentStatusStore, (statuses) => {
  return (Object.keys(statuses) as AgentType[]).filter((agent) => statuses[agent] === 'idle');
});

/**
 * Statistiques globales
 */
export const agentStatsStore = computed(
  [agentStatusStore, completedTasksStore, taskQueueStore],
  (statuses, completed, queue) => {
    const agents = Object.keys(statuses) as AgentType[];

    return {
      totalAgents: agents.length,
      idleAgents: agents.filter((a) => statuses[a] === 'idle').length,
      busyAgents: agents.filter((a) => statuses[a] !== 'idle').length,
      completedTasks: completed.length,
      pendingTasks: queue.length,
      successfulTasks: completed.filter((t) => t.result.success).length,
      failedTasks: completed.filter((t) => !t.result.success).length,
    };
  },
);

/**
 * Computed stores for individual agent logs
 * These allow subscribing to a specific agent's logs without
 * re-rendering when other agents' logs change.
 *
 * OPTIMIZED: Uses memoization to prevent unnecessary re-renders
 * when the logs array reference changes but contents are the same.
 */
export const orchestratorLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.orchestrator);
export const exploreLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.explore);
export const coderLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.coder);
export const builderLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.builder);
export const testerLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.tester);
export const deployerLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.deployer);
export const reviewerLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.reviewer);
export const fixerLogsStore = memoizedComputed(agentLogsStore, (logs) => logs.fixer);

/**
 * Factory function to get logs store for a specific agent
 * More efficient than subscribing to the full agentLogsStore
 */
export function getAgentLogsStore(agent: AgentType) {
  switch (agent) {
    case 'orchestrator':
      return orchestratorLogsStore;
    case 'explore':
      return exploreLogsStore;
    case 'coder':
      return coderLogsStore;
    case 'builder':
      return builderLogsStore;
    case 'tester':
      return testerLogsStore;
    case 'deployer':
      return deployerLogsStore;
    case 'reviewer':
      return reviewerLogsStore;
    case 'fixer':
      return fixerLogsStore;
    default:
      return orchestratorLogsStore;
  }
}

/**
 * Total log count across all agents
 */
export const totalLogCountStore = computed(agentLogsStore, (logs) => {
  return Object.values(logs).reduce((sum, agentLogs) => sum + agentLogs.length, 0);
});

/*
 * ============================================================================
 * ACTIONS
 * ============================================================================
 */

/**
 * Timers pour le retrait différé des agents de la liste active
 */
const agentRemovalTimers: Map<AgentType, ReturnType<typeof setTimeout>> = new Map();

/**
 * Met à jour le statut d'un agent et maintient la liste des agents actifs.
 *
 * @param agent - Le type d'agent à mettre à jour
 * @param status - Le nouveau statut ('idle', 'thinking', 'executing', etc.)
 * @returns void
 *
 * @example
 * ```ts
 * updateAgentStatus('coder', 'executing');
 * updateAgentStatus('builder', 'idle');
 * ```
 */
export function updateAgentStatus(agent: AgentType, status: AgentStatus): void {
  // Annuler tout timer de retrait en cours pour cet agent
  const existingTimer = agentRemovalTimers.get(agent);

  if (existingTimer) {
    clearTimeout(existingTimer);
    agentRemovalTimers.delete(agent);
  }

  agentStatusStore.setKey(agent, status);

  // Mettre à jour la liste des agents actifs
  const active = activeAgentsStore.get();

  if (status === 'idle') {
    // Retrait immédiat pour idle
    activeAgentsStore.set(active.filter((a) => a !== agent));
  } else if (status === 'completed' || status === 'failed' || status === 'aborted') {
    // Retrait différé pour les statuts terminaux (garde visible pendant 1.5s)
    if (!active.includes(agent)) {
      activeAgentsStore.set([...active, agent]);
    }

    const timer = setTimeout(() => {
      const currentActive = activeAgentsStore.get();
      activeAgentsStore.set(currentActive.filter((a) => a !== agent));
      agentRemovalTimers.delete(agent);
    }, 1500);
    agentRemovalTimers.set(agent, timer);
  } else if (!active.includes(agent)) {
    // Ajouter l'agent s'il n'est pas déjà actif
    activeAgentsStore.set([...active, agent]);
  }
}

/**
 * Définit la tâche actuellement en cours d'exécution pour un agent.
 *
 * @param agent - Le type d'agent
 * @param task - La tâche en cours, ou null pour effacer
 * @returns void
 */
export function setCurrentTask(agent: AgentType, task: Task | null): void {
  currentTasksStore.setKey(agent, task);
}

/**
 * Ajoute une entrée de log pour un agent spécifique.
 * Le log est ajouté à la fois au store de l'agent et au store système.
 *
 * @param agent - Le type d'agent qui génère le log
 * @param log - L'entrée de log (sans timestamp, ajouté automatiquement)
 * @returns void
 *
 * @example
 * ```ts
 * addAgentLog('coder', {
 *   level: 'info',
 *   message: 'Fichier créé: Button.tsx',
 *   data: { path: '/src/Button.tsx' },
 * });
 * ```
 */
export function addAgentLog(agent: AgentType, log: Omit<LogEntry, 'timestamp'>): void {
  const entry: LogEntry = {
    ...log,
    timestamp: new Date(),
    agentName: agent,
  };

  // Utiliser les buffers circulaires O(1) au lieu de slice O(n)
  const agentBuffer = getAgentLogBuffers()[agent];
  agentBuffer.push(entry);
  agentLogsStore.setKey(agent, agentBuffer.toArray());

  // Ajouter au log système
  const systemBuffer = getSystemLogsBuffer();
  systemBuffer.push(entry);
  systemLogsStore.set(systemBuffer.toArray());
}

/**
 * Ajoute une tâche à la queue d'exécution.
 *
 * @param task - La tâche à ajouter
 * @returns void
 */
export function enqueueTask(task: Task): void {
  const queue = taskQueueStore.get();
  taskQueueStore.set([...queue, task]);
}

/**
 * Retire et retourne la première tâche de la queue (FIFO).
 *
 * @returns La tâche retirée, ou undefined si la queue est vide
 */
export function dequeueTask(): Task | undefined {
  const queue = taskQueueStore.get();

  if (queue.length === 0) {
    return undefined;
  }

  const [task, ...rest] = queue;
  taskQueueStore.set(rest);

  return task;
}

/**
 * Marque une tâche comme complétée et l'ajoute à l'historique.
 *
 * @param task - La tâche complétée
 * @param result - Le résultat de l'exécution (success, output, error)
 * @returns void
 */
export function completeTask(task: Task, result: TaskResult): void {
  // Utiliser le buffer circulaire O(1) au lieu de slice O(n)
  const completedTask = { ...task, status: 'completed' as TaskStatus, result };
  const buffer = getCompletedTasksBuffer();
  buffer.push(completedTask);
  completedTasksStore.set(buffer.toArray());
}

/**
 * Traite un événement émis par un agent et met à jour les stores appropriés.
 * Gère les événements de cycle de vie: started, completed, failed, tool_call, etc.
 *
 * @param event - L'événement à traiter (type, agentName, data)
 * @returns void
 *
 * @example
 * ```ts
 * handleAgentEvent({
 *   type: 'agent:started',
 *   agentName: 'coder',
 *   data: { taskId: 'task-123' },
 * });
 * ```
 */
export function handleAgentEvent(event: AgentEvent): void {
  const agent = event.agentName;

  if (!agent) {
    return;
  }

  switch (event.type) {
    case 'agent:started':
      updateAgentStatus(agent, 'executing');
      break;

    case 'agent:completed':
      updateAgentStatus(agent, 'completed');

      // Note: Le retrait différé est géré dans updateAgentStatus
      break;

    case 'agent:failed':
      updateAgentStatus(agent, 'failed');
      addAgentLog(agent, {
        level: 'error',
        message: `Agent failed: ${JSON.stringify(event.data)}`,
      });

      // Note: Le retrait différé est géré dans updateAgentStatus
      break;

    case 'agent:tool_call':
      updateAgentStatus(agent, 'waiting_for_tool');
      addAgentLog(agent, {
        level: 'debug',
        message: `Tool call: ${event.data.toolName}`,
        data: event.data,
      });
      break;

    case 'agent:tool_result':
      updateAgentStatus(agent, 'executing');
      break;

    case 'task:created':
      addAgentLog(agent, {
        level: 'info',
        message: `Task created: ${event.data.taskId}`,
        data: event.data,
      });
      break;

    case 'task:started':
      updateAgentStatus(agent, 'executing');
      addAgentLog(agent, {
        level: 'info',
        message: `Task started: ${event.data.taskId}`,
      });
      break;

    case 'task:completed':
      addAgentLog(agent, {
        level: 'info',
        message: `Task completed: ${event.data.taskId}`,
        data: event.data,
      });
      break;

    case 'task:failed':
      addAgentLog(agent, {
        level: 'error',
        message: `Task failed: ${event.data.taskId}`,
        data: event.data,
      });
      break;

    case 'orchestrator:decision':
      addAgentLog(agent, {
        level: 'info',
        message: `Decision: ${event.data.action}`,
        data: event.data,
      });
      break;

    case 'orchestrator:delegated':
      addAgentLog(agent, {
        level: 'info',
        message: `Delegated to: ${event.data.targetAgent}`,
        data: event.data,
      });
      break;
  }
}

/**
 * Efface les logs système tout en conservant l'état des agents.
 * Utilisé pour nettoyer l'historique des logs sans réinitialiser les tâches.
 *
 * @returns void
 */
export function clearSystemLogs(): void {
  if (_systemLogsBuffer) {
    _systemLogsBuffer.clear();
  }
  systemLogsStore.set([]);
}

/**
 * Efface les logs d'un agent spécifique.
 *
 * @param agent - Le type d'agent dont les logs doivent être effacés
 * @returns void
 */
export function clearAgentLogs(agent: AgentType): void {
  if (_agentLogBuffers) {
    const buffer = _agentLogBuffers[agent];
    if (buffer) {
      buffer.clear();
    }
  }
  agentLogsStore.setKey(agent, []);
}

/**
 * Efface tous les logs (système et agents).
 *
 * @returns void
 */
export function clearAllLogs(): void {
  // Clear system logs
  if (_systemLogsBuffer) {
    _systemLogsBuffer.clear();
  }
  systemLogsStore.set([]);

  // Clear all agent logs
  if (_agentLogBuffers) {
    Object.values(_agentLogBuffers).forEach((buffer) => {
      buffer.clear();
    });
  }

  agentLogsStore.set({
    orchestrator: [],
    explore: [],
    coder: [],
    builder: [],
    tester: [],
    deployer: [],
    reviewer: [],
    fixer: [],
    architect: [],
  });
}

/**
 * Réinitialise tous les stores d'agents à leur état initial.
 * Utilisé lors du démarrage d'une nouvelle session ou pour nettoyer l'état.
 *
 * @returns void
 */
export function resetAgentStores(): void {
  // Nettoyer tous les timers de retrait
  agentRemovalTimers.forEach((timer) => clearTimeout(timer));
  agentRemovalTimers.clear();

  agentStatusStore.set({
    orchestrator: 'idle',
    explore: 'idle',
    coder: 'idle',
    builder: 'idle',
    tester: 'idle',
    deployer: 'idle',
    reviewer: 'idle',
    fixer: 'idle',
    architect: 'idle',
  });

  activeAgentsStore.set([]);

  currentTasksStore.set({
    orchestrator: null,
    explore: null,
    coder: null,
    builder: null,
    tester: null,
    deployer: null,
    reviewer: null,
    fixer: null,
    architect: null,
  });

  // Réinitialiser les buffers circulaires (seulement s'ils ont été créés)
  if (_agentLogBuffers) {
    Object.values(_agentLogBuffers).forEach((buffer) => buffer.clear());
  }
  if (_systemLogsBuffer) {
    _systemLogsBuffer.clear();
  }
  if (_completedTasksBuffer) {
    _completedTasksBuffer.clear();
  }

  agentLogsStore.set({
    orchestrator: [],
    explore: [],
    coder: [],
    builder: [],
    tester: [],
    deployer: [],
    reviewer: [],
    fixer: [],
    architect: [],
  });

  systemLogsStore.set([]);
  taskQueueStore.set([]);
  completedTasksStore.set([]);
  currentOrchestratorTaskStore.set(null);
  currentActionStore.set(null);
}

/**
 * Obtient un résumé complet de l'état du système multi-agents.
 *
 * @returns Objet contenant:
 *   - agents: État de chaque agent (statut et tâche en cours)
 *   - stats: Statistiques globales (agents actifs, tâches complétées, etc.)
 *   - recentLogs: Les 10 derniers logs système
 *
 * @example
 * ```ts
 * const summary = getSystemSummary();
 * console.log(`${summary.stats.busyAgents} agents actifs`);
 * ```
 */
export function getSystemSummary(): {
  agents: Record<AgentType, { status: AgentStatus; currentTask: string | null }>;
  stats: ReturnType<typeof agentStatsStore.get>;
  recentLogs: LogEntry[];
} {
  const statuses = agentStatusStore.get();
  const tasks = currentTasksStore.get();
  const agents = Object.keys(statuses) as AgentType[];

  return {
    agents: agents.reduce(
      (acc, agent) => {
        acc[agent] = {
          status: statuses[agent],
          currentTask: tasks[agent]?.prompt.substring(0, 50) || null,
        };
        return acc;
      },
      {} as Record<AgentType, { status: AgentStatus; currentTask: string | null }>,
    ),
    stats: agentStatsStore.get(),
    recentLogs: systemLogsStore.get().slice(-10),
  };
}
