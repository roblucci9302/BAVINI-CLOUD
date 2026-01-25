/**
 * =============================================================================
 * BAVINI CLOUD - Design Config Generators
 * =============================================================================
 * Functions for generating CSS variables and Tailwind configuration.
 *
 * @module lib/agents/tools/design-tools/config-generators
 * =============================================================================
 */

import type { DesignBrief } from './types';

/**
 * Générer le CSS des variables de design
 */
export function generateCSSVariables(brief: DesignBrief): string {
  return `:root {
  /* Colors */
  --color-primary: ${brief.colors.primary};
  --color-secondary: ${brief.colors.secondary};
  --color-accent: ${brief.colors.accent};
  --color-background: ${brief.colors.background};
  --color-surface: ${brief.colors.surface};
  --color-text: ${brief.colors.text};
  --color-text-muted: ${brief.colors.textMuted};
  --color-border: ${brief.colors.border};
  --color-success: ${brief.colors.success};
  --color-warning: ${brief.colors.warning};
  --color-error: ${brief.colors.error};

  /* Typography */
  --font-heading: ${brief.typography.headingFont};
  --font-body: ${brief.typography.bodyFont};
  --font-mono: ${brief.typography.monoFont};

  /* Layout */
  --max-width: ${brief.layout.maxWidth};
  --border-radius: ${brief.layout.borderRadius === 'none' ? '0' : brief.layout.borderRadius === 'subtle' ? '4px' : brief.layout.borderRadius === 'rounded' ? '8px' : '9999px'};
  --spacing: ${brief.layout.spacing === 'tight' ? '0.5rem' : brief.layout.spacing === 'normal' ? '1rem' : '1.5rem'};
}`;
}

/**
 * Générer la config Tailwind
 */
export function generateTailwindConfig(brief: DesignBrief): string {
  return `// tailwind.config.ts - Généré par BAVINI Design Tool
export default {
  theme: {
    extend: {
      colors: {
        primary: '${brief.colors.primary}',
        secondary: '${brief.colors.secondary}',
        accent: '${brief.colors.accent}',
        background: '${brief.colors.background}',
        surface: '${brief.colors.surface}',
        foreground: '${brief.colors.text}',
        muted: '${brief.colors.textMuted}',
        border: '${brief.colors.border}',
      },
      fontFamily: {
        heading: ['${brief.typography.headingFont.split(',')[0]}', 'sans-serif'],
        body: ['${brief.typography.bodyFont.split(',')[0]}', 'sans-serif'],
        mono: ['${brief.typography.monoFont.split(',')[0]}', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '${brief.layout.borderRadius === 'none' ? '0' : brief.layout.borderRadius === 'subtle' ? '4px' : brief.layout.borderRadius === 'rounded' ? '8px' : '9999px'}',
      },
    },
  },
};`;
}
