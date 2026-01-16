/**
 * Rule Registry - Registre central de toutes les règles d'analyse
 */

import { BaseRule, type RuleContext, type RuleDocumentation } from './base-rule';
import { SECURITY_RULES } from './security';
import { PERFORMANCE_RULES } from './performance';
import { MAINTAINABILITY_RULES } from './maintainability';
import type { RuleCategory, RuleConfig } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RuleRegistry');

/*
 * ============================================================================
 * RULE REGISTRY
 * ============================================================================
 */

/**
 * Registre central des règles d'analyse
 */
export class RuleRegistry {
  private static instance: RuleRegistry;
  private rules: Map<string, BaseRule> = new Map();

  private constructor() {
    // Initialiser avec toutes les règles
    this.registerRules();
  }

  /**
   * Obtenir l'instance singleton
   */
  static getInstance(): RuleRegistry {
    if (!RuleRegistry.instance) {
      RuleRegistry.instance = new RuleRegistry();
    }

    return RuleRegistry.instance;
  }

  /**
   * Réinitialiser l'instance (pour les tests)
   */
  static resetInstance(): void {
    RuleRegistry.instance = new RuleRegistry();
  }

  /**
   * Enregistrer toutes les règles built-in
   */
  private registerRules(): void {
    // Security rules
    for (const RuleClass of SECURITY_RULES) {
      this.register(new RuleClass());
    }

    // Performance rules
    for (const RuleClass of PERFORMANCE_RULES) {
      this.register(new RuleClass());
    }

    // Maintainability rules
    for (const RuleClass of MAINTAINABILITY_RULES) {
      this.register(new RuleClass());
    }

    logger.info(`Registered ${this.rules.size} rules`);
  }

  /**
   * Enregistrer une règle
   */
  register(rule: BaseRule): void {
    if (this.rules.has(rule.id)) {
      logger.warn(`Rule '${rule.id}' already registered, overwriting`);
    }

    this.rules.set(rule.id, rule);
    logger.debug(`Registered rule: ${rule.id}`);
  }

  /**
   * Désinscrire une règle
   */
  unregister(id: string): boolean {
    return this.rules.delete(id);
  }

  /**
   * Obtenir une règle par ID
   */
  get(id: string): BaseRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Vérifier si une règle existe
   */
  has(id: string): boolean {
    return this.rules.has(id);
  }

  /**
   * Obtenir toutes les règles
   */
  getAll(): BaseRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Obtenir les règles activées
   */
  getEnabled(): BaseRule[] {
    return this.getAll().filter((rule) => rule.enabled);
  }

  /**
   * Obtenir les règles par catégorie
   */
  getByCategory(category: RuleCategory): BaseRule[] {
    return this.getAll().filter((rule) => rule.category === category);
  }

  /**
   * Obtenir les IDs de toutes les règles
   */
  getIds(): string[] {
    return Array.from(this.rules.keys());
  }

  /**
   * Configurer une règle
   */
  configure(id: string, config: Partial<RuleConfig>): boolean {
    const rule = this.rules.get(id);

    if (!rule) {
      logger.warn(`Cannot configure unknown rule: ${id}`);
      return false;
    }

    rule.configure(config);

    return true;
  }

  /**
   * Configurer plusieurs règles
   */
  configureAll(configs: Record<string, Partial<RuleConfig>>): void {
    for (const [id, config] of Object.entries(configs)) {
      this.configure(id, config);
    }
  }

  /**
   * Activer une règle
   */
  enable(id: string): boolean {
    return this.configure(id, { enabled: true });
  }

  /**
   * Désactiver une règle
   */
  disable(id: string): boolean {
    return this.configure(id, { enabled: false });
  }

  /**
   * Activer toutes les règles d'une catégorie
   */
  enableCategory(category: RuleCategory): void {
    for (const rule of this.getByCategory(category)) {
      rule.configure({ enabled: true });
    }
  }

  /**
   * Désactiver toutes les règles d'une catégorie
   */
  disableCategory(category: RuleCategory): void {
    for (const rule of this.getByCategory(category)) {
      rule.configure({ enabled: false });
    }
  }

  /**
   * Obtenir la documentation de toutes les règles
   */
  getDocumentation(): RuleDocumentation[] {
    return this.getAll().map((rule) => rule.getDocumentation());
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): RuleRegistryStats {
    const rules = this.getAll();
    const byCategory: Record<RuleCategory, number> = {
      security: 0,
      performance: 0,
      maintainability: 0,
      style: 0,
      error: 0,
    };

    let enabled = 0;

    for (const rule of rules) {
      byCategory[rule.category]++;

      if (rule.enabled) {
        enabled++;
      }
    }

    return {
      total: rules.length,
      enabled,
      disabled: rules.length - enabled,
      byCategory,
    };
  }

  /**
   * Nombre total de règles
   */
  get size(): number {
    return this.rules.size;
  }
}

/**
 * Statistiques du registre
 */
export interface RuleRegistryStats {
  total: number;
  enabled: number;
  disabled: number;
  byCategory: Record<RuleCategory, number>;
}

/*
 * ============================================================================
 * FACTORY FUNCTIONS
 * ============================================================================
 */

/**
 * Obtenir toutes les règles (raccourci)
 */
export function getAllRules(): BaseRule[] {
  return RuleRegistry.getInstance().getAll();
}

/**
 * Obtenir les règles activées (raccourci)
 */
export function getEnabledRules(): BaseRule[] {
  return RuleRegistry.getInstance().getEnabled();
}

/**
 * Obtenir une règle par ID (raccourci)
 */
export function getRule(id: string): BaseRule | undefined {
  return RuleRegistry.getInstance().get(id);
}

/**
 * Configurer des règles (raccourci)
 */
export function configureRules(configs: Record<string, Partial<RuleConfig>>): void {
  RuleRegistry.getInstance().configureAll(configs);
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export { BaseRule, type RuleContext } from './base-rule';
export { SECURITY_RULES } from './security';
export { PERFORMANCE_RULES } from './performance';
export { MAINTAINABILITY_RULES } from './maintainability';
