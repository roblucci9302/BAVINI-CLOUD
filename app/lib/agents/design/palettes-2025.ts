/**
 * Palettes de Couleurs 2025 pour BAVINI
 *
 * Palettes modernes et vibrantes inspirées des tendances design 2025
 * Chaque palette inclut light et dark mode
 *
 * @module agents/design/palettes-2025
 */

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface ColorPalette {
  /** Nom de la palette */
  name: string;

  /** Description */
  description: string;

  /** Tags pour recherche */
  tags: string[];

  /** Couleurs light mode */
  light: PaletteColors;

  /** Couleurs dark mode */
  dark: PaletteColors;

  /** Gradients suggérés */
  gradients: GradientDefinition[];
}

export interface PaletteColors {
  /** Couleur principale de la marque */
  primary: string;

  /** Couleur secondaire */
  secondary: string;

  /** Couleur d'accent pour CTA et highlights */
  accent: string;

  /** Arrière-plan principal */
  background: string;

  /** Surface des cartes et éléments */
  surface: string;

  /** Surface élevée (modals, dropdowns) */
  surfaceElevated: string;

  /** Texte principal */
  text: string;

  /** Texte secondaire */
  textMuted: string;

  /** Bordures */
  border: string;

  /** Bordure au focus/hover */
  borderActive: string;

  /** Succès */
  success: string;

  /** Avertissement */
  warning: string;

  /** Erreur */
  error: string;

  /** Info */
  info: string;
}

export interface GradientDefinition {
  /** Nom du gradient */
  name: string;

  /** CSS du gradient */
  css: string;

  /** Usage recommandé */
  usage: string;
}

/*
 * ============================================================================
 * PALETTES MODERNES 2025
 * ============================================================================
 */

export const PALETTES_2025: ColorPalette[] = [
  // =========================================================================
  // AURORA - Violet/Pink/Cyan vibrant
  // =========================================================================
  {
    name: 'Aurora',
    description: 'Palette vibrante avec des teintes aurora borealis - parfait pour SaaS et landing pages modernes',
    tags: ['vibrant', 'modern', 'saas', 'tech', 'creative', 'startup'],
    light: {
      primary: '#8B5CF6',
      secondary: '#EC4899',
      accent: '#06B6D4',
      background: '#FAFAFA',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#0F0F0F',
      textMuted: '#6B7280',
      border: '#E5E5E5',
      borderActive: '#8B5CF6',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
    dark: {
      primary: '#A78BFA',
      secondary: '#F472B6',
      accent: '#22D3EE',
      background: '#09090B',
      surface: '#18181B',
      surfaceElevated: '#27272A',
      text: '#FAFAFA',
      textMuted: '#A1A1AA',
      border: '#27272A',
      borderActive: '#A78BFA',
      success: '#34D399',
      warning: '#FBBF24',
      error: '#F87171',
      info: '#60A5FA',
    },
    gradients: [
      {
        name: 'Aurora Glow',
        css: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #06B6D4 100%)',
        usage: 'Hero backgrounds, CTAs principaux',
      },
      {
        name: 'Aurora Soft',
        css: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)',
        usage: 'Cards, sections, backgrounds subtils',
      },
      {
        name: 'Aurora Text',
        css: 'linear-gradient(90deg, #8B5CF6 0%, #EC4899 50%, #06B6D4 100%)',
        usage: 'Textes gradient animés',
      },
    ],
  },

  // =========================================================================
  // MIDNIGHT - Bleu profond élégant
  // =========================================================================
  {
    name: 'Midnight',
    description: 'Bleu profond et élégant - idéal pour fintech, enterprise et dashboards',
    tags: ['professional', 'enterprise', 'fintech', 'dashboard', 'corporate', 'trust'],
    light: {
      primary: '#2563EB',
      secondary: '#7C3AED',
      accent: '#0EA5E9',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#0F172A',
      textMuted: '#64748B',
      border: '#E2E8F0',
      borderActive: '#2563EB',
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
      info: '#0284C7',
    },
    dark: {
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      accent: '#38BDF8',
      background: '#020617',
      surface: '#0F172A',
      surfaceElevated: '#1E293B',
      text: '#F8FAFC',
      textMuted: '#94A3B8',
      border: '#1E293B',
      borderActive: '#3B82F6',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#0EA5E9',
    },
    gradients: [
      {
        name: 'Midnight Ocean',
        css: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #2563EB 100%)',
        usage: 'Hero sections, headers premium',
      },
      {
        name: 'Midnight Glow',
        css: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
        usage: 'Boutons, badges, highlights',
      },
    ],
  },

  // =========================================================================
  // EMBER - Orange/Rouge chaleureux
  // =========================================================================
  {
    name: 'Ember',
    description: 'Teintes chaudes et énergiques - parfait pour food, lifestyle, créatif',
    tags: ['warm', 'energetic', 'food', 'lifestyle', 'creative', 'bold'],
    light: {
      primary: '#EA580C',
      secondary: '#DC2626',
      accent: '#FBBF24',
      background: '#FFFBEB',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#1C1917',
      textMuted: '#78716C',
      border: '#E7E5E4',
      borderActive: '#EA580C',
      success: '#16A34A',
      warning: '#CA8A04',
      error: '#DC2626',
      info: '#0284C7',
    },
    dark: {
      primary: '#F97316',
      secondary: '#EF4444',
      accent: '#FCD34D',
      background: '#0C0A09',
      surface: '#1C1917',
      surfaceElevated: '#292524',
      text: '#FAFAF9',
      textMuted: '#A8A29E',
      border: '#292524',
      borderActive: '#F97316',
      success: '#22C55E',
      warning: '#EAB308',
      error: '#F87171',
      info: '#38BDF8',
    },
    gradients: [
      {
        name: 'Ember Fire',
        css: 'linear-gradient(135deg, #DC2626 0%, #EA580C 50%, #FBBF24 100%)',
        usage: 'CTAs urgents, promotions',
      },
      {
        name: 'Ember Warm',
        css: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
        usage: 'Backgrounds chaleureux',
      },
    ],
  },

  // =========================================================================
  // FOREST - Vert nature apaisant
  // =========================================================================
  {
    name: 'Forest',
    description: 'Teintes vertes naturelles - idéal pour eco, santé, bien-être',
    tags: ['nature', 'eco', 'health', 'wellness', 'organic', 'calm'],
    light: {
      primary: '#059669',
      secondary: '#0D9488',
      accent: '#84CC16',
      background: '#F0FDF4',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#14532D',
      textMuted: '#4D7C0F',
      border: '#D1FAE5',
      borderActive: '#059669',
      success: '#16A34A',
      warning: '#CA8A04',
      error: '#DC2626',
      info: '#0284C7',
    },
    dark: {
      primary: '#10B981',
      secondary: '#14B8A6',
      accent: '#A3E635',
      background: '#022C22',
      surface: '#064E3B',
      surfaceElevated: '#065F46',
      text: '#ECFDF5',
      textMuted: '#6EE7B7',
      border: '#065F46',
      borderActive: '#10B981',
      success: '#34D399',
      warning: '#FBBF24',
      error: '#F87171',
      info: '#38BDF8',
    },
    gradients: [
      {
        name: 'Forest Canopy',
        css: 'linear-gradient(135deg, #059669 0%, #0D9488 50%, #84CC16 100%)',
        usage: 'Headers nature, eco badges',
      },
      {
        name: 'Forest Mist',
        css: 'linear-gradient(180deg, #ECFDF5 0%, #D1FAE5 100%)',
        usage: 'Backgrounds apaisants',
      },
    ],
  },

  // =========================================================================
  // OBSIDIAN - Noir premium luxe
  // =========================================================================
  {
    name: 'Obsidian',
    description: 'Noir élégant avec accents dorés - parfait pour luxe, fashion, premium',
    tags: ['luxury', 'premium', 'fashion', 'elegant', 'minimal', 'high-end'],
    light: {
      primary: '#18181B',
      secondary: '#3F3F46',
      accent: '#D4AF37',
      background: '#FAFAFA',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#09090B',
      textMuted: '#71717A',
      border: '#E4E4E7',
      borderActive: '#18181B',
      success: '#16A34A',
      warning: '#CA8A04',
      error: '#DC2626',
      info: '#0284C7',
    },
    dark: {
      primary: '#FAFAFA',
      secondary: '#A1A1AA',
      accent: '#F5D77A',
      background: '#000000',
      surface: '#09090B',
      surfaceElevated: '#18181B',
      text: '#FAFAFA',
      textMuted: '#71717A',
      border: '#27272A',
      borderActive: '#D4AF37',
      success: '#22C55E',
      warning: '#EAB308',
      error: '#EF4444',
      info: '#3B82F6',
    },
    gradients: [
      {
        name: 'Obsidian Gold',
        css: 'linear-gradient(135deg, #18181B 0%, #27272A 50%, #D4AF37 100%)',
        usage: 'Headers premium, badges luxe',
      },
      {
        name: 'Obsidian Shimmer',
        css: 'linear-gradient(90deg, #D4AF37 0%, #F5D77A 50%, #D4AF37 100%)',
        usage: 'Accents dorés, texte premium',
      },
    ],
  },

  // =========================================================================
  // NEON - Cyberpunk néon
  // =========================================================================
  {
    name: 'Neon',
    description: 'Style cyberpunk avec néons - parfait pour gaming, tech, futuriste',
    tags: ['cyberpunk', 'gaming', 'futuristic', 'neon', 'tech', 'bold'],
    light: {
      primary: '#8B5CF6',
      secondary: '#06B6D4',
      accent: '#F43F5E',
      background: '#F5F3FF',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#1E1B4B',
      textMuted: '#6366F1',
      border: '#E0E7FF',
      borderActive: '#8B5CF6',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#06B6D4',
    },
    dark: {
      primary: '#A855F7',
      secondary: '#22D3EE',
      accent: '#FB7185',
      background: '#0A0A0F',
      surface: '#12121A',
      surfaceElevated: '#1A1A2E',
      text: '#E0E7FF',
      textMuted: '#818CF8',
      border: '#1E1B4B',
      borderActive: '#A855F7',
      success: '#34D399',
      warning: '#FBBF24',
      error: '#F87171',
      info: '#22D3EE',
    },
    gradients: [
      {
        name: 'Neon Glow',
        css: 'linear-gradient(135deg, #A855F7 0%, #22D3EE 50%, #FB7185 100%)',
        usage: 'CTAs impact, gaming elements',
      },
      {
        name: 'Neon Grid',
        css: 'linear-gradient(180deg, transparent 0%, rgba(168, 85, 247, 0.1) 100%)',
        usage: 'Grid backgrounds cyberpunk',
      },
    ],
  },

  // =========================================================================
  // ROSE - Rose moderne et accessible
  // =========================================================================
  {
    name: 'Rose',
    description: 'Rose moderne et inclusif - idéal pour femtech, beauty, social',
    tags: ['modern', 'beauty', 'social', 'inclusive', 'friendly', 'soft'],
    light: {
      primary: '#E11D48',
      secondary: '#DB2777',
      accent: '#F472B6',
      background: '#FFF1F2',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#1F2937',
      textMuted: '#6B7280',
      border: '#FECDD3',
      borderActive: '#E11D48',
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
      info: '#0284C7',
    },
    dark: {
      primary: '#FB7185',
      secondary: '#F472B6',
      accent: '#FDA4AF',
      background: '#0F0708',
      surface: '#1C1012',
      surfaceElevated: '#2A1519',
      text: '#FFF1F2',
      textMuted: '#FDA4AF',
      border: '#4C1D24',
      borderActive: '#FB7185',
      success: '#34D399',
      warning: '#FBBF24',
      error: '#F87171',
      info: '#38BDF8',
    },
    gradients: [
      {
        name: 'Rose Petal',
        css: 'linear-gradient(135deg, #E11D48 0%, #DB2777 50%, #F472B6 100%)',
        usage: 'CTAs beauty, accents',
      },
      {
        name: 'Rose Soft',
        css: 'linear-gradient(180deg, #FFF1F2 0%, #FECDD3 100%)',
        usage: 'Backgrounds doux',
      },
    ],
  },

  // =========================================================================
  // SLATE - Neutre professionnel
  // =========================================================================
  {
    name: 'Slate',
    description: 'Gris neutre et professionnel - universel pour tout type de projet',
    tags: ['neutral', 'professional', 'universal', 'clean', 'minimal', 'corporate'],
    light: {
      primary: '#475569',
      secondary: '#64748B',
      accent: '#0EA5E9',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      surfaceElevated: '#FFFFFF',
      text: '#0F172A',
      textMuted: '#64748B',
      border: '#E2E8F0',
      borderActive: '#475569',
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
      info: '#0284C7',
    },
    dark: {
      primary: '#94A3B8',
      secondary: '#CBD5E1',
      accent: '#38BDF8',
      background: '#020617',
      surface: '#0F172A',
      surfaceElevated: '#1E293B',
      text: '#F1F5F9',
      textMuted: '#94A3B8',
      border: '#334155',
      borderActive: '#94A3B8',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#0EA5E9',
    },
    gradients: [
      {
        name: 'Slate Gradient',
        css: 'linear-gradient(135deg, #475569 0%, #64748B 100%)',
        usage: 'Headers neutres, badges',
      },
      {
        name: 'Slate Mist',
        css: 'linear-gradient(180deg, #F8FAFC 0%, #E2E8F0 100%)',
        usage: 'Backgrounds sections',
      },
    ],
  },
];

/*
 * ============================================================================
 * FONCTIONS UTILITAIRES
 * ============================================================================
 */

/**
 * Obtenir une palette par nom
 */
export function getPaletteByName(name: string): ColorPalette | undefined {
  return PALETTES_2025.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

/**
 * Rechercher des palettes par tags
 */
export function searchPalettes(query: string): ColorPalette[] {
  const lowerQuery = query.toLowerCase();
  return PALETTES_2025.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.tags.some((t) => t.includes(lowerQuery)),
  );
}

/**
 * Obtenir une palette recommandée pour un type de projet
 */
export function getRecommendedPalette(projectType: string): ColorPalette {
  const type = projectType.toLowerCase();

  if (type.includes('saas') || type.includes('startup') || type.includes('tech')) {
    return getPaletteByName('Aurora')!;
  }
  if (type.includes('finance') || type.includes('enterprise') || type.includes('dashboard')) {
    return getPaletteByName('Midnight')!;
  }
  if (type.includes('food') || type.includes('restaurant') || type.includes('lifestyle')) {
    return getPaletteByName('Ember')!;
  }
  if (type.includes('eco') || type.includes('health') || type.includes('wellness')) {
    return getPaletteByName('Forest')!;
  }
  if (type.includes('luxury') || type.includes('fashion') || type.includes('premium')) {
    return getPaletteByName('Obsidian')!;
  }
  if (type.includes('gaming') || type.includes('cyber') || type.includes('futur')) {
    return getPaletteByName('Neon')!;
  }
  if (type.includes('beauty') || type.includes('social') || type.includes('femtech')) {
    return getPaletteByName('Rose')!;
  }

  // Default: Aurora pour sa versatilité
  return getPaletteByName('Aurora')!;
}

/**
 * Générer les CSS variables pour une palette
 */
export function generateCSSVariables(palette: ColorPalette, mode: 'light' | 'dark' = 'light'): string {
  const colors = mode === 'light' ? palette.light : palette.dark;

  return `:root {
  /* ${palette.name} - ${mode} mode */
  --color-primary: ${colors.primary};
  --color-secondary: ${colors.secondary};
  --color-accent: ${colors.accent};
  --color-background: ${colors.background};
  --color-surface: ${colors.surface};
  --color-surface-elevated: ${colors.surfaceElevated};
  --color-text: ${colors.text};
  --color-text-muted: ${colors.textMuted};
  --color-border: ${colors.border};
  --color-border-active: ${colors.borderActive};
  --color-success: ${colors.success};
  --color-warning: ${colors.warning};
  --color-error: ${colors.error};
  --color-info: ${colors.info};
}`;
}

/**
 * Générer la configuration Tailwind pour une palette
 */
export function generateTailwindColors(palette: ColorPalette): string {
  return `// Tailwind config pour ${palette.name}
export const colors = {
  primary: {
    DEFAULT: '${palette.light.primary}',
    dark: '${palette.dark.primary}',
  },
  secondary: {
    DEFAULT: '${palette.light.secondary}',
    dark: '${palette.dark.secondary}',
  },
  accent: {
    DEFAULT: '${palette.light.accent}',
    dark: '${palette.dark.accent}',
  },
  background: {
    DEFAULT: '${palette.light.background}',
    dark: '${palette.dark.background}',
  },
  surface: {
    DEFAULT: '${palette.light.surface}',
    elevated: '${palette.light.surfaceElevated}',
    dark: '${palette.dark.surface}',
    'dark-elevated': '${palette.dark.surfaceElevated}',
  },
  foreground: {
    DEFAULT: '${palette.light.text}',
    muted: '${palette.light.textMuted}',
    dark: '${palette.dark.text}',
    'dark-muted': '${palette.dark.textMuted}',
  },
  border: {
    DEFAULT: '${palette.light.border}',
    active: '${palette.light.borderActive}',
    dark: '${palette.dark.border}',
    'dark-active': '${palette.dark.borderActive}',
  },
};`;
}

/**
 * Formater les palettes pour un prompt
 */
export function formatPalettesForPrompt(): string {
  const lines: string[] = [
    '# Palettes de Couleurs 2025',
    '',
    'Utilise ces palettes modernes pour créer des designs attractifs.',
    '',
  ];

  for (const palette of PALETTES_2025) {
    lines.push(`## ${palette.name}`);
    lines.push(`${palette.description}`);
    lines.push(`Tags: ${palette.tags.join(', ')}`);
    lines.push(`Primary: ${palette.light.primary} (light) / ${palette.dark.primary} (dark)`);
    lines.push(`Accent: ${palette.light.accent} (light) / ${palette.dark.accent} (dark)`);
    lines.push('');
  }

  return lines.join('\n');
}
