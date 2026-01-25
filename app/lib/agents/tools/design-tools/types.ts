/**
 * =============================================================================
 * BAVINI CLOUD - Design Tools Types
 * =============================================================================
 * Type definitions for design brief generation and patterns.
 *
 * @module lib/agents/tools/design-tools/types
 * =============================================================================
 */

/**
 * Brief de design généré
 */
export interface DesignBrief {
  /** Style visuel général */
  style: {
    mood: string;
    keywords: string[];
    references: string[];
  };

  /** Palette de couleurs recommandée */
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };

  /** Typographie */
  typography: {
    headingFont: string;
    bodyFont: string;
    monoFont: string;
    scale: 'compact' | 'comfortable' | 'spacious';
  };

  /** Structure de layout */
  layout: {
    type: 'single-column' | 'sidebar' | 'dashboard' | 'magazine' | 'cards';
    maxWidth: string;
    spacing: 'tight' | 'normal' | 'relaxed' | 'comfortable' | 'spacious';
    borderRadius: 'none' | 'subtle' | 'rounded' | 'pill';
  };

  /** Composants UI recommandés */
  components: {
    buttons: 'solid' | 'outline' | 'ghost' | 'gradient';
    cards: 'flat' | 'elevated' | 'bordered' | 'glass';
    inputs: 'underline' | 'outlined' | 'filled';
    navigation: 'top' | 'side' | 'bottom' | 'floating';
  };

  /** Effets visuels */
  effects: {
    shadows: boolean;
    gradients: boolean;
    glassmorphism: boolean;
    animations: 'none' | 'subtle' | 'playful';
    darkMode: boolean;
  };

  /** Recommandations spécifiques */
  recommendations: string[];
}

/**
 * Patterns de design par type de projet
 */
export interface DesignPattern {
  keywords: string[];
  style: DesignBrief['style'];
  colors: Partial<DesignBrief['colors']>;
  layout: Partial<DesignBrief['layout']>;
  components: Partial<DesignBrief['components']>;
  effects: Partial<DesignBrief['effects']>;
  recommendations: string[];
}

/**
 * Color mood type for palette variations
 */
export type ColorMood = 'modern' | 'warm' | 'cool' | 'nature' | 'luxury' | 'playful' | 'corporate' | 'minimal';
