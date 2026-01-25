/**
 * Design Guidelines Store
 *
 * Gère l'état du plugin frontend-design dans BAVINI.
 * Permet aux utilisateurs d'activer/désactiver les guidelines
 * et de choisir le niveau de détail.
 *
 * @module stores/design-guidelines
 */

import { atom, computed } from 'nanostores';
import type { GuidelinesLevel } from '~/lib/skills/skill-loader';

/*
 * =============================================================================
 * CONSTANTS
 * =============================================================================
 */

export const STORAGE_KEY_ENABLED = 'bavini:designGuidelines:enabled';
export const STORAGE_KEY_LEVEL = 'bavini:designGuidelines:level';

export const DEFAULT_ENABLED = true;
export const DEFAULT_LEVEL: GuidelinesLevel = 'standard';

/*
 * =============================================================================
 * STORES
 * =============================================================================
 */

/**
 * État principal : guidelines activées ou non
 */
export const designGuidelinesEnabledStore = atom<boolean>(DEFAULT_ENABLED);

/**
 * Niveau de guidelines : minimal (off), standard, full
 */
export const guidelinesLevelStore = atom<GuidelinesLevel>(DEFAULT_LEVEL);

/**
 * Computed : configuration complète pour l'API
 */
export const designGuidelinesConfigStore = computed(
  [designGuidelinesEnabledStore, guidelinesLevelStore],
  (enabled, level) => ({
    enabled,
    level,
    // Si désactivé, forcer le niveau à minimal pour économiser des tokens
    effectiveLevel: enabled ? level : ('minimal' as GuidelinesLevel),
  })
);

/**
 * Computed : doit-on injecter les guidelines dans le prompt ?
 */
export const shouldInjectGuidelinesStore = computed(
  [designGuidelinesEnabledStore, guidelinesLevelStore],
  (enabled, level) => enabled && level !== 'minimal'
);

/*
 * =============================================================================
 * ACTIONS
 * =============================================================================
 */

/**
 * Active ou désactive les design guidelines
 */
export function setDesignGuidelinesEnabled(enabled: boolean): void {
  designGuidelinesEnabledStore.set(enabled);

  // Persister dans localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(enabled));
    } catch {
      // localStorage peut échouer (mode privé, quota dépassé)
    }
  }
}

/**
 * Définit le niveau de guidelines
 */
export function setGuidelinesLevel(level: GuidelinesLevel): void {
  guidelinesLevelStore.set(level);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_LEVEL, level);
    } catch {
      // Silently fail
    }
  }
}

/**
 * Toggle on/off
 */
export function toggleDesignGuidelines(): void {
  const current = designGuidelinesEnabledStore.get();
  setDesignGuidelinesEnabled(!current);
}

/**
 * Cycle à travers les niveaux : minimal → standard → full → minimal
 */
export function cycleGuidelinesLevel(): void {
  const current = guidelinesLevelStore.get();
  const levels: GuidelinesLevel[] = ['minimal', 'standard', 'full'];
  const currentIndex = levels.indexOf(current);
  const nextIndex = (currentIndex + 1) % levels.length;
  setGuidelinesLevel(levels[nextIndex]);
}

/**
 * Reset aux valeurs par défaut
 */
export function resetDesignGuidelines(): void {
  setDesignGuidelinesEnabled(DEFAULT_ENABLED);
  setGuidelinesLevel(DEFAULT_LEVEL);
}

/*
 * =============================================================================
 * INITIALIZATION
 * =============================================================================
 */

let initialized = false;

/**
 * Initialise le store depuis localStorage
 */
export function initDesignGuidelinesStore(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;

  try {
    // Charger enabled
    const savedEnabled = localStorage.getItem(STORAGE_KEY_ENABLED);

    if (savedEnabled !== null) {
      const enabled = JSON.parse(savedEnabled);

      if (typeof enabled === 'boolean') {
        designGuidelinesEnabledStore.set(enabled);
      }
    }

    // Charger level
    const savedLevel = localStorage.getItem(STORAGE_KEY_LEVEL);

    if (savedLevel && ['minimal', 'standard', 'full'].includes(savedLevel)) {
      guidelinesLevelStore.set(savedLevel as GuidelinesLevel);
    }
  } catch {
    // localStorage parse error - use defaults
  }
}

// Auto-init sur le client (non-blocking)
if (typeof window !== 'undefined' && typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => initDesignGuidelinesStore(), { timeout: 100 });
} else if (typeof window !== 'undefined') {
  setTimeout(initDesignGuidelinesStore, 0);
}

/*
 * =============================================================================
 * HELPERS
 * =============================================================================
 */

/**
 * Retourne la description du niveau actuel
 */
export function getGuidelinesLevelDescription(level: GuidelinesLevel): string {
  switch (level) {
    case 'minimal':
      return 'Désactivé - Design par défaut de Claude';
    case 'standard':
      return 'Standard - Esthétique + Accessibilité (~1000 tokens)';
    case 'full':
      return 'Complet - Toutes les guidelines (~7500 tokens)';
    default:
      return '';
  }
}

/**
 * Retourne l'estimation de tokens pour un niveau
 */
export function getEstimatedTokens(level: GuidelinesLevel): number {
  switch (level) {
    case 'minimal':
      return 0;
    case 'standard':
      return 1000;
    case 'full':
      return 7500;
    default:
      return 0;
  }
}

/*
 * =============================================================================
 * TYPES EXPORT
 * =============================================================================
 */

export type { GuidelinesLevel };

export interface DesignGuidelinesConfig {
  enabled: boolean;
  level: GuidelinesLevel;
  effectiveLevel: GuidelinesLevel;
}
