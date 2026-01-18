/**
 * @fileoverview Registre centralisé des agents BAVINI
 *
 * Ce module fournit un singleton pour gérer l'enregistrement, la récupération
 * et le suivi des agents du système multi-agent. Il permet:
 * - Enregistrement/désenregistrement dynamique d'agents
 * - Récupération d'agents par nom ou capacité
 * - Suivi des statistiques d'utilisation
 * - Propagation des événements des agents
 *
 * @module agents/core/agent-registry
 * @see {@link BaseAgent} pour la classe de base des agents
 *
 * @example
 * ```typescript
 * // Obtenir l'instance du registre
 * const registry = AgentRegistry.getInstance();
 *
 * // Enregistrer un agent
 * registry.register(new CoderAgent());
 *
 * // Récupérer et utiliser un agent
 * const coder = registry.get('coder');
 * if (coder?.isAvailable()) {
 *   await coder.run(task, apiKey);
 * }
 * ```
 */

import type { BaseAgent } from './base-agent';
import type { AgentType, AgentStatus, AgentEventCallback, AgentEvent } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AgentRegistry');

/**
 * Factory function for lazy agent creation
 */
export type AgentFactory = () => BaseAgent;

/**
 * Lazy agent registration info
 */
export interface LazyAgentInfo {
  factory: AgentFactory;
  instance: BaseAgent | null;
  registeredAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
  isLoaded: boolean;
}

/**
 * Information sur un agent enregistré
 */
export interface RegisteredAgent {
  agent: BaseAgent;
  registeredAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
}

/**
 * Statistiques du registre
 */
export interface RegistryStats {
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  agentsByType: Record<AgentType, number>;
}

/**
 * Registre singleton des agents BAVINI
 *
 * Cette classe implémente le pattern Singleton pour centraliser la gestion
 * de tous les agents du système. Elle offre:
 * - Enregistrement et désenregistrement d'agents
 * - Recherche par nom, statut ou capacité
 * - Statistiques d'utilisation
 * - Système d'événements pour le monitoring
 *
 * @class AgentRegistry
 * @example
 * ```typescript
 * // Pattern Singleton - obtenir l'instance
 * const registry = AgentRegistry.getInstance();
 *
 * // Enregistrer tous les agents
 * registry.register(new ExplorerAgent());
 * registry.register(new CoderAgent());
 *
 * // Trouver les agents disponibles
 * const available = registry.getAvailable();
 * console.log(`${available.length} agents prêts`);
 *
 * // Écouter les événements
 * registry.subscribe((event) => {
 *   console.log(`Agent ${event.agentName}: ${event.type}`);
 * });
 * ```
 */
export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<AgentType, RegisteredAgent> = new Map();
  private lazyAgents: Map<AgentType, LazyAgentInfo> = new Map();
  private eventCallbacks: Set<AgentEventCallback> = new Set();

  // Store unsubscribe functions to prevent memory leaks
  private agentUnsubscribes: Map<AgentType, () => void> = new Map();

  // Protection contre les race conditions lors du chargement lazy
  // Stocke les Promises de chargement en cours pour éviter les doubles instanciations
  private lazyLoadPromises: Map<AgentType, Promise<BaseAgent | null>> = new Map();

  private constructor() {
    logger.info('AgentRegistry initialized');
  }

  /**
   * Obtenir l'instance singleton du registre
   *
   * @static
   * @returns {AgentRegistry} L'instance unique du registre
   *
   * @example
   * ```typescript
   * const registry = AgentRegistry.getInstance();
   * ```
   */
  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }

    return AgentRegistry.instance;
  }

  /**
   * Réinitialiser le registre (utile pour les tests)
   */
  static resetInstance(): void {
    if (AgentRegistry.instance) {
      AgentRegistry.instance.clear();
    }

    AgentRegistry.instance = new AgentRegistry();
  }

  /*
   * ============================================================================
   * LAZY LOADING
   * ============================================================================
   */

  /**
   * Enregistrer une factory d'agent pour le chargement différé
   *
   * L'agent ne sera créé que lors du premier appel à get().
   * Cela réduit le temps de démarrage et la consommation mémoire.
   *
   * @param {AgentType} name - Nom de l'agent
   * @param {AgentFactory} factory - Fonction qui crée l'agent
   *
   * @example
   * ```typescript
   * registry.registerLazy('coder', () => new CoderAgent());
   * // L'agent n'est pas encore créé
   *
   * const coder = registry.get('coder');
   * // Maintenant l'agent est créé et retourné
   * ```
   */
  registerLazy(name: AgentType, factory: AgentFactory): void {
    if (this.agents.has(name) || this.lazyAgents.has(name)) {
      logger.warn(`Agent ${name} already registered, replacing with lazy`);
      this.agents.delete(name);
    }

    this.lazyAgents.set(name, {
      factory,
      instance: null,
      registeredAt: new Date(),
      usageCount: 0,
      isLoaded: false,
    });

    logger.info(`Lazy agent registered: ${name}`);
  }

  /**
   * Charger un agent lazy (créer l'instance) - Version synchrone
   * ATTENTION: Cette méthode peut créer des race conditions si appelée
   * en parallèle. Préférer getAsync() pour les appels concurrents.
   */
  private loadLazyAgent(name: AgentType): BaseAgent | undefined {
    const lazyInfo = this.lazyAgents.get(name);

    if (!lazyInfo) {
      return undefined;
    }

    // Already loaded?
    if (lazyInfo.instance) {
      return lazyInfo.instance;
    }

    // Create the instance
    const startTime = Date.now();
    const agent = lazyInfo.factory();

    lazyInfo.instance = agent;
    lazyInfo.isLoaded = true;

    // Subscribe to agent events and store unsubscribe function
    const unsubscribe = agent.subscribe((event) => this.handleAgentEvent(event));
    this.agentUnsubscribes.set(name, unsubscribe);

    logger.info(`Lazy agent loaded: ${name}`, {
      loadTime: Date.now() - startTime,
    });

    this.emitEvent({
      type: 'agent:started',
      timestamp: new Date(),
      agentName: name,
      data: { action: 'lazy-loaded' },
    });

    return agent;
  }

  /**
   * Charger un agent lazy de manière thread-safe
   * Utilise un système de promesses partagées pour éviter les doubles instanciations
   */
  private async loadLazyAgentSafe(name: AgentType): Promise<BaseAgent | null> {
    const lazyInfo = this.lazyAgents.get(name);

    if (!lazyInfo) {
      return null;
    }

    // Double-check: déjà chargé?
    if (lazyInfo.instance) {
      return lazyInfo.instance;
    }

    try {
      const startTime = Date.now();
      const agent = lazyInfo.factory();

      // Vérifier à nouveau (un autre thread a pu charger entre-temps)
      if (lazyInfo.instance) {
        logger.warn(`Lazy agent ${name} was loaded by another thread, discarding duplicate`);
        return lazyInfo.instance;
      }

      lazyInfo.instance = agent;
      lazyInfo.isLoaded = true;

      // Subscribe to agent events
      const unsubscribe = agent.subscribe((event) => this.handleAgentEvent(event));
      this.agentUnsubscribes.set(name, unsubscribe);

      logger.info(`Lazy agent loaded (safe): ${name}`, {
        loadTime: Date.now() - startTime,
      });

      this.emitEvent({
        type: 'agent:started',
        timestamp: new Date(),
        agentName: name,
        data: { action: 'lazy-loaded' },
      });

      return agent;
    } catch (error) {
      logger.error(`Failed to load lazy agent ${name}:`, error);
      return null;
    }
  }

  /**
   * Obtenir un agent de manière asynchrone et thread-safe
   * Garantit qu'un agent lazy n'est instancié qu'une seule fois
   * même en cas d'appels concurrents.
   *
   * @param {AgentType} name - Le nom de l'agent
   * @returns {Promise<BaseAgent | undefined>} L'agent ou undefined si non trouvé
   *
   * @example
   * ```typescript
   * // Sûr même avec des appels parallèles
   * const [agent1, agent2] = await Promise.all([
   *   registry.getAsync('coder'),
   *   registry.getAsync('coder'),
   * ]);
   * // agent1 === agent2 (même instance)
   * ```
   */
  async getAsync(name: AgentType): Promise<BaseAgent | undefined> {
    // Vérifier d'abord le cache direct (agents non-lazy)
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

    // Si déjà chargé, retourner directement
    if (lazyInfo.instance) {
      lazyInfo.lastUsedAt = new Date();
      lazyInfo.usageCount++;
      return lazyInfo.instance;
    }

    // Vérifier si un chargement est déjà en cours
    const existingPromise = this.lazyLoadPromises.get(name);
    if (existingPromise) {
      logger.debug(`Waiting for existing load of ${name}`);
      const agent = await existingPromise;
      if (agent) {
        lazyInfo.lastUsedAt = new Date();
        lazyInfo.usageCount++;
      }
      return agent ?? undefined;
    }

    // Créer une nouvelle promesse de chargement
    const loadPromise = this.loadLazyAgentSafe(name);
    this.lazyLoadPromises.set(name, loadPromise);

    try {
      const agent = await loadPromise;
      if (agent) {
        lazyInfo.lastUsedAt = new Date();
        lazyInfo.usageCount++;
      }
      return agent ?? undefined;
    } finally {
      // Nettoyer la promesse après chargement
      this.lazyLoadPromises.delete(name);
    }
  }

  /**
   * Vérifier si un agent est chargé (pour les agents lazy)
   */
  isLoaded(name: AgentType): boolean {
    if (this.agents.has(name)) {
      return true;
    }

    const lazyInfo = this.lazyAgents.get(name);
    return lazyInfo?.isLoaded ?? false;
  }

  /**
   * Obtenir les statistiques de chargement lazy
   */
  getLazyStats(): {
    totalLazy: number;
    loadedLazy: number;
    pendingLazy: number;
  } {
    let loaded = 0;
    let pending = 0;

    for (const info of this.lazyAgents.values()) {
      if (info.isLoaded) {
        loaded++;
      } else {
        pending++;
      }
    }

    return {
      totalLazy: this.lazyAgents.size,
      loadedLazy: loaded,
      pendingLazy: pending,
    };
  }

  /*
   * ============================================================================
   * ENREGISTREMENT
   * ============================================================================
   */

  /**
   * Enregistrer un agent dans le registre
   *
   * L'agent sera disponible pour la récupération et le registre
   * s'abonnera automatiquement à ses événements.
   *
   * @param {BaseAgent} agent - L'agent à enregistrer
   * @returns {void}
   * @emits agent:started - Avec action='registered' lors de l'enregistrement
   *
   * @example
   * ```typescript
   * const coder = new CoderAgent();
   * registry.register(coder);
   * // L'agent est maintenant disponible via registry.get('coder')
   * ```
   */
  register(agent: BaseAgent): void {
    const name = agent.getName() as AgentType;

    if (this.agents.has(name)) {
      logger.warn(`Agent ${name} already registered, replacing`);
    }

    // Unsubscribe from previous agent if replacing
    const existingUnsubscribe = this.agentUnsubscribes.get(name);
    if (existingUnsubscribe) {
      existingUnsubscribe();
    }

    this.agents.set(name, {
      agent,
      registeredAt: new Date(),
      usageCount: 0,
    });

    // S'abonner aux événements de l'agent et stocker la fonction unsubscribe
    const unsubscribe = agent.subscribe((event) => this.handleAgentEvent(event));
    this.agentUnsubscribes.set(name, unsubscribe);

    logger.info(`Agent registered: ${name}`, {
      description: agent.getDescription(),
    });

    this.emitEvent({
      type: 'agent:started',
      timestamp: new Date(),
      agentName: name,
      data: { action: 'registered' },
    });
  }

  /**
   * Supprimer un agent du registre
   */
  unregister(name: AgentType): boolean {
    const registered = this.agents.get(name);

    if (!registered) {
      logger.warn(`Agent ${name} not found for unregistration`);
      return false;
    }

    // Vérifier que l'agent n'est pas en cours d'exécution
    if (registered.agent.getStatus() !== 'idle') {
      logger.warn(`Cannot unregister busy agent: ${name}`);
      return false;
    }

    // Unsubscribe from agent events to prevent memory leaks
    const unsubscribe = this.agentUnsubscribes.get(name);
    if (unsubscribe) {
      unsubscribe();
      this.agentUnsubscribes.delete(name);
    }

    this.agents.delete(name);
    logger.info(`Agent unregistered: ${name}`);

    return true;
  }

  /**
   * Vider le registre (agents normaux et lazy)
   */
  clear(): void {
    // Unsubscribe from all agent events to prevent memory leaks
    this.agentUnsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.agentUnsubscribes.clear();

    // Clear regular agents
    this.agents.forEach((registered) => {
      if (registered.agent.getStatus() !== 'idle') {
        registered.agent.abort();
      }
    });

    // Clear loaded lazy agents
    this.lazyAgents.forEach((lazyInfo) => {
      if (lazyInfo.instance && lazyInfo.instance.getStatus() !== 'idle') {
        lazyInfo.instance.abort();
      }
    });

    this.agents.clear();
    this.lazyAgents.clear();
    logger.info('Registry cleared (including lazy agents)');
  }

  /*
   * ============================================================================
   * RÉCUPÉRATION
   * ============================================================================
   */

  /**
   * Obtenir un agent par son nom
   *
   * Incrémente automatiquement le compteur d'utilisation
   * et met à jour lastUsedAt. Pour les agents lazy, déclenche
   * le chargement si nécessaire.
   *
   * @param {AgentType} name - Le nom de l'agent (ex: 'coder', 'explorer')
   * @returns {BaseAgent | undefined} L'agent ou undefined si non trouvé
   *
   * @example
   * ```typescript
   * const explorer = registry.get('explorer');
   * if (explorer && explorer.isAvailable()) {
   *   const result = await explorer.run(task, apiKey);
   * }
   * ```
   */
  get(name: AgentType): BaseAgent | undefined {
    // Check regular agents first
    const registered = this.agents.get(name);

    if (registered) {
      registered.lastUsedAt = new Date();
      registered.usageCount++;

      return registered.agent;
    }

    // Check lazy agents and load if needed
    const lazyInfo = this.lazyAgents.get(name);

    if (lazyInfo) {
      const agent = this.loadLazyAgent(name);

      if (agent) {
        lazyInfo.lastUsedAt = new Date();
        lazyInfo.usageCount++;
      }

      return agent;
    }

    return undefined;
  }

  /**
   * Vérifier si un agent existe (inclut les agents lazy non chargés)
   */
  has(name: AgentType): boolean {
    return this.agents.has(name) || this.lazyAgents.has(name);
  }

  /**
   * Obtenir tous les agents
   */
  getAll(): Map<AgentType, BaseAgent> {
    const result = new Map<AgentType, BaseAgent>();

    for (const [name, registered] of this.agents) {
      result.set(name, registered.agent);
    }

    return result;
  }

  /**
   * Obtenir les noms de tous les agents (inclut les agents lazy)
   */
  getNames(): AgentType[] {
    const names = new Set<AgentType>();

    for (const name of this.agents.keys()) {
      names.add(name);
    }

    for (const name of this.lazyAgents.keys()) {
      names.add(name);
    }

    return Array.from(names);
  }

  /**
   * Obtenir les informations d'enregistrement d'un agent
   */
  getInfo(name: AgentType): RegisteredAgent | undefined {
    return this.agents.get(name);
  }

  /*
   * ============================================================================
   * FILTRAGE
   * ============================================================================
   */

  /**
   * Obtenir les agents disponibles (idle)
   */
  getAvailable(): BaseAgent[] {
    const available: BaseAgent[] = [];

    for (const registered of this.agents.values()) {
      if (registered.agent.isAvailable()) {
        available.push(registered.agent);
      }
    }

    return available;
  }

  /**
   * Obtenir les agents par statut
   */
  getByStatus(status: AgentStatus): BaseAgent[] {
    const result: BaseAgent[] = [];

    for (const registered of this.agents.values()) {
      if (registered.agent.getStatus() === status) {
        result.push(registered.agent);
      }
    }

    return result;
  }

  /**
   * Trouver le meilleur agent pour une tâche donnée
   *
   * Sélectionne un agent disponible basé sur la description de la tâche
   * et ses capacités. Par défaut, exclut l'orchestrateur.
   *
   * @param {string} taskDescription - Description de la tâche à accomplir
   * @param {boolean} [excludeOrchestrator=true] - Exclure l'orchestrateur de la recherche
   * @returns {BaseAgent | null} L'agent le plus adapté ou null si aucun disponible
   *
   * @example
   * ```typescript
   * const agent = registry.findBestAgent('Génère du code TypeScript');
   * if (agent) {
   *   console.log(`Agent sélectionné: ${agent.getName()}`);
   * }
   * ```
   */
  findBestAgent(taskDescription: string, excludeOrchestrator = true): BaseAgent | null {
    const available = this.getAvailable();

    // Filtrer l'orchestrateur si demandé
    const candidates = excludeOrchestrator ? available.filter((a) => a.getName() !== 'orchestrator') : available;

    if (candidates.length === 0) {
      return null;
    }

    // Score candidates by description relevance to task keywords
    const taskKeywords = taskDescription.toLowerCase().split(/\s+/);
    let bestAgent = candidates[0];
    let bestScore = 0;

    for (const agent of candidates) {
      const agentDesc = agent.getConfig().description.toLowerCase();
      let score = 0;

      for (const keyword of taskKeywords) {
        if (keyword.length > 2 && agentDesc.includes(keyword)) {
          score++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  /**
   * Trouver un agent par capacité (présence d'un outil)
   */
  findByCapability(toolName: string): BaseAgent[] {
    const result: BaseAgent[] = [];

    for (const registered of this.agents.values()) {
      const config = registered.agent.getConfig();
      const hasTool = config.tools.some((t) => t.name === toolName);

      if (hasTool) {
        result.push(registered.agent);
      }
    }

    return result;
  }

  /*
   * ============================================================================
   * STATISTIQUES
   * ============================================================================
   */

  /**
   * Obtenir les statistiques du registre
   */
  getStats(): RegistryStats {
    const stats: RegistryStats = {
      totalAgents: this.agents.size,
      availableAgents: 0,
      busyAgents: 0,
      agentsByType: {} as Record<AgentType, number>,
    };

    for (const [name, registered] of this.agents) {
      stats.agentsByType[name] = 1;

      if (registered.agent.isAvailable()) {
        stats.availableAgents++;
      } else {
        stats.busyAgents++;
      }
    }

    return stats;
  }

  /**
   * Obtenir les informations de tous les agents
   */
  getAgentsInfo(): Array<{
    name: AgentType;
    status: AgentStatus;
    description: string;
    usageCount: number;
    registeredAt: Date;
    lastUsedAt?: Date;
  }> {
    const info = [];

    for (const [name, registered] of this.agents) {
      info.push({
        name,
        status: registered.agent.getStatus(),
        description: registered.agent.getDescription(),
        usageCount: registered.usageCount,
        registeredAt: registered.registeredAt,
        lastUsedAt: registered.lastUsedAt,
      });
    }

    return info;
  }

  /*
   * ============================================================================
   * ÉVÉNEMENTS
   * ============================================================================
   */

  /**
   * S'abonner aux événements du registre
   */
  subscribe(callback: AgentEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Gérer un événement d'agent
   */
  private handleAgentEvent(event: AgentEvent): void {
    // Propager l'événement aux abonnés du registre
    this.emitEvent(event);
  }

  /**
   * Émettre un événement
   */
  private emitEvent(event: AgentEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error('Event callback error', { error });
      }
    }
  }
}

// Export de l'instance par défaut
export const agentRegistry = AgentRegistry.getInstance();
