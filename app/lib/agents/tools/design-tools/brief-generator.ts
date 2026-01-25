/**
 * =============================================================================
 * BAVINI CLOUD - Design Brief Generator
 * =============================================================================
 * Functions for generating and formatting design briefs.
 *
 * @module lib/agents/tools/design-tools/brief-generator
 * =============================================================================
 */

import type { DesignBrief } from './types';
import { COLOR_MOODS, detectPattern } from './patterns';

/**
 * Générer une palette dark mode
 */
export function generateDarkModeColors(colors: DesignBrief['colors']): DesignBrief['colors'] {
  return {
    ...colors,
    background: '#0F172A',
    surface: '#1E293B',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: '#334155',
  };
}

/**
 * Créer le brief de design complet
 */
export function createDesignBrief(
  goal: string,
  context?: string,
  mood?: string,
  darkMode?: boolean,
): DesignBrief {
  const pattern = detectPattern(goal, context);

  // Couleurs de base
  const moodColors = mood && COLOR_MOODS[mood] ? COLOR_MOODS[mood] : {};

  let colors: DesignBrief['colors'] = {
    primary: '#6366F1',
    secondary: '#8B5CF6',
    accent: '#06B6D4',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    text: '#0F172A',
    textMuted: '#64748B',
    border: '#E2E8F0',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    ...pattern.colors,
    ...moodColors,
  };

  // Appliquer dark mode si demandé
  if (darkMode) {
    colors = generateDarkModeColors(colors);
  }

  // Construire le brief
  const brief: DesignBrief = {
    style: pattern.style,
    colors,
    typography: {
      headingFont: 'Inter, system-ui, sans-serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      monoFont: 'JetBrains Mono, Fira Code, monospace',
      scale: pattern.layout?.spacing === 'tight' ? 'compact' : 'comfortable',
    },
    layout: {
      type: pattern.layout?.type || 'single-column',
      maxWidth: pattern.layout?.maxWidth || '1280px',
      spacing: pattern.layout?.spacing || 'normal',
      borderRadius: pattern.layout?.borderRadius || 'rounded',
    },
    components: {
      buttons: pattern.components?.buttons || 'solid',
      cards: pattern.components?.cards || 'bordered',
      inputs: pattern.components?.inputs || 'outlined',
      navigation: pattern.components?.navigation || 'top',
    },
    effects: {
      shadows: pattern.effects?.shadows ?? true,
      gradients: pattern.effects?.gradients ?? false,
      glassmorphism: pattern.effects?.glassmorphism ?? false,
      animations: pattern.effects?.animations || 'subtle',
      darkMode: darkMode ?? pattern.effects?.darkMode ?? true,
    },
    recommendations: [...pattern.recommendations],
  };

  // Ajouter des recommandations basées sur le contexte
  if (context) {
    if (context.toLowerCase().includes('mobile')) {
      brief.recommendations.push('Priorité mobile-first avec touch targets de 44px minimum');
    }
    if (context.toLowerCase().includes('accessib')) {
      brief.recommendations.push('Contraste WCAG AA minimum, focus visible, ARIA labels');
    }
    if (context.toLowerCase().includes('performance') || context.toLowerCase().includes('rapide')) {
      brief.recommendations.push('Optimiser les images, lazy loading, minimal JavaScript');
    }
  }

  return brief;
}

/**
 * Formater le brief en texte lisible
 */
export function formatBriefAsText(brief: DesignBrief): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    📐 BRIEF DE DESIGN                          ',
    '═══════════════════════════════════════════════════════════════',
    '',
    '## 🎨 STYLE VISUEL',
    `   Mood: ${brief.style.mood}`,
    `   Mots-clés: ${brief.style.keywords.join(', ')}`,
    `   Références: ${brief.style.references.join(', ')}`,
    '',
    '## 🎨 PALETTE DE COULEURS',
    `   Primary:    ${brief.colors.primary}`,
    `   Secondary:  ${brief.colors.secondary}`,
    `   Accent:     ${brief.colors.accent}`,
    `   Background: ${brief.colors.background}`,
    `   Surface:    ${brief.colors.surface}`,
    `   Text:       ${brief.colors.text}`,
    `   TextMuted:  ${brief.colors.textMuted}`,
    `   Border:     ${brief.colors.border}`,
    '',
    '## 📝 TYPOGRAPHIE',
    `   Headings: ${brief.typography.headingFont}`,
    `   Body:     ${brief.typography.bodyFont}`,
    `   Code:     ${brief.typography.monoFont}`,
    `   Scale:    ${brief.typography.scale}`,
    '',
    '## 📐 LAYOUT',
    `   Type:         ${brief.layout.type}`,
    `   Max Width:    ${brief.layout.maxWidth}`,
    `   Spacing:      ${brief.layout.spacing}`,
    `   Border Radius: ${brief.layout.borderRadius}`,
    '',
    '## 🧩 COMPOSANTS',
    `   Buttons:    ${brief.components.buttons}`,
    `   Cards:      ${brief.components.cards}`,
    `   Inputs:     ${brief.components.inputs}`,
    `   Navigation: ${brief.components.navigation}`,
    '',
    '## ✨ EFFETS',
    `   Shadows:      ${brief.effects.shadows ? 'Oui' : 'Non'}`,
    `   Gradients:    ${brief.effects.gradients ? 'Oui' : 'Non'}`,
    `   Glassmorphism: ${brief.effects.glassmorphism ? 'Oui' : 'Non'}`,
    `   Animations:   ${brief.effects.animations}`,
    `   Dark Mode:    ${brief.effects.darkMode ? 'Supporté' : 'Non'}`,
    '',
    '## 💡 RECOMMANDATIONS',
    ...brief.recommendations.map((r, i) => `   ${i + 1}. ${r}`),
    '',
    '═══════════════════════════════════════════════════════════════',
    '',
    '⚠️  IMPORTANT: Applique ces recommandations dans le code généré.',
    '    Utilise les couleurs exactes et respecte le style défini.',
    '',
  ];

  return lines.join('\n');
}
