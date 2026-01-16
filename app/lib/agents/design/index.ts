/**
 * Design System BAVINI 2.0
 *
 * Système de design moderne pour la génération d'interfaces belles
 * Inclut des composants, palettes 2025, animations et 10 templates complets
 *
 * @module agents/design
 */

// Composants modernes
export * from './modern-components';

// Palettes de couleurs 2025
export * from './palettes-2025';

// Presets d'animation Framer Motion
export * from './animation-presets';

// Templates complets prêts à l'emploi (10 templates)
export * from './templates';

// Re-export des fonctions utilitaires
export { TEMPLATES_METADATA, getTemplateByName, getTemplatesByUseCase, getTemplatesByPalette } from './templates';
