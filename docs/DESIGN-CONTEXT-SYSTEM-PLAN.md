# BAVINI Design Context System - Plan d'Implémentation

> **Objectif**: Générer des designs UNIQUES et ULTRA-POUSSÉS pour chaque projet
> **Approche**: L'IA décide de tout automatiquement basé sur l'analyse du projet
> **Status**: EN ATTENTE D'APPROBATION

---

## Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DESIGN CONTEXT SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────┐    │
│  │   User      │───▶│  Style Analyzer  │───▶│  Design Token Generator │    │
│  │   Request   │    │  (Analyse IA)    │    │  (Palette, Typo, etc.)  │    │
│  └─────────────┘    └──────────────────┘    └───────────┬─────────────┘    │
│                                                         │                   │
│                                                         ▼                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Design Context Object                           │   │
│  │  {                                                                   │   │
│  │    palette: { primary, secondary, accent, background, text, ... }   │   │
│  │    typography: { headings, body, mono, sizes, weights }             │   │
│  │    spacing: { base, scale, containerWidth }                         │   │
│  │    effects: { shadows, radius, blur, gradients }                    │   │
│  │    style: { mood, contrast, density }                               │   │
│  │  }                                                                   │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Coder Agent + Design Context                    │   │
│  │  Le prompt du coder inclut les design tokens                        │   │
│  │  → Code généré utilise CES couleurs, CES fonts, CE style            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Architecture de Base (Fondations)

### Étape 1.1: Créer les Types et Interfaces

**Fichier**: `app/lib/design/types.ts`

```typescript
/**
 * Design Context System - Types
 * Définit toutes les interfaces pour le système de design
 */

// ============================================================================
// PALETTE DE COULEURS
// ============================================================================

export interface ColorPalette {
  // Couleurs principales
  primary: string;           // Couleur principale de la marque
  primaryLight: string;      // Version claire
  primaryDark: string;       // Version foncée

  // Couleurs secondaires
  secondary: string;         // Couleur d'accent secondaire
  secondaryLight: string;
  secondaryDark: string;

  // Accent (pour CTAs, highlights)
  accent: string;
  accentLight: string;
  accentDark: string;

  // Backgrounds
  background: string;        // Fond principal
  backgroundAlt: string;     // Fond alternatif (sections)
  surface: string;           // Cartes, modales
  surfaceHover: string;      // Hover state des surfaces

  // Texte
  text: string;              // Texte principal
  textMuted: string;         // Texte secondaire
  textInverse: string;       // Texte sur fond coloré

  // États
  success: string;
  warning: string;
  error: string;
  info: string;

  // Bordures
  border: string;
  borderHover: string;

  // Gradients (optionnel)
  gradientStart?: string;
  gradientEnd?: string;
  gradientDirection?: string;
}

// ============================================================================
// TYPOGRAPHIE
// ============================================================================

export interface Typography {
  // Familles de polices
  fontHeading: string;       // Pour les titres (ex: "Playfair Display")
  fontBody: string;          // Pour le texte (ex: "Inter")
  fontMono: string;          // Pour le code (ex: "JetBrains Mono")

  // Tailles (en rem)
  sizes: {
    xs: string;              // 0.75rem
    sm: string;              // 0.875rem
    base: string;            // 1rem
    lg: string;              // 1.125rem
    xl: string;              // 1.25rem
    '2xl': string;           // 1.5rem
    '3xl': string;           // 1.875rem
    '4xl': string;           // 2.25rem
    '5xl': string;           // 3rem
    '6xl': string;           // 3.75rem
    '7xl': string;           // 4.5rem
  };

  // Poids
  weights: {
    light: number;           // 300
    normal: number;          // 400
    medium: number;          // 500
    semibold: number;        // 600
    bold: number;            // 700
    extrabold: number;       // 800
  };

  // Line heights
  lineHeights: {
    tight: string;           // 1.25
    normal: string;          // 1.5
    relaxed: string;         // 1.625
    loose: string;           // 2
  };

  // Letter spacing
  letterSpacing: {
    tight: string;           // -0.025em
    normal: string;          // 0
    wide: string;            // 0.025em
    wider: string;           // 0.05em
  };
}

// ============================================================================
// SPACING & LAYOUT
// ============================================================================

export interface Spacing {
  // Base unit (généralement 4px ou 8px)
  baseUnit: number;

  // Scale (multiples du base unit)
  scale: {
    0: string;               // 0
    1: string;               // 0.25rem (4px)
    2: string;               // 0.5rem (8px)
    3: string;               // 0.75rem (12px)
    4: string;               // 1rem (16px)
    5: string;               // 1.25rem (20px)
    6: string;               // 1.5rem (24px)
    8: string;               // 2rem (32px)
    10: string;              // 2.5rem (40px)
    12: string;              // 3rem (48px)
    16: string;              // 4rem (64px)
    20: string;              // 5rem (80px)
    24: string;              // 6rem (96px)
    32: string;              // 8rem (128px)
  };

  // Container
  containerMaxWidth: string; // ex: "1280px"
  containerPadding: string;  // ex: "1.5rem"

  // Section spacing
  sectionPaddingY: string;   // ex: "6rem"

  // Grid gap
  gridGap: string;           // ex: "1.5rem"
}

// ============================================================================
// EFFETS VISUELS
// ============================================================================

export interface Effects {
  // Border radius
  radius: {
    none: string;            // 0
    sm: string;              // 0.125rem
    base: string;            // 0.25rem
    md: string;              // 0.375rem
    lg: string;              // 0.5rem
    xl: string;              // 0.75rem
    '2xl': string;           // 1rem
    '3xl': string;           // 1.5rem
    full: string;            // 9999px
  };

  // Shadows
  shadows: {
    none: string;
    sm: string;
    base: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    inner: string;
  };

  // Blur (pour glassmorphism)
  blur: {
    none: string;
    sm: string;
    base: string;
    md: string;
    lg: string;
    xl: string;
  };

  // Transitions
  transitions: {
    fast: string;            // 150ms
    base: string;            // 200ms
    slow: string;            // 300ms
    slower: string;          // 500ms
  };
}

// ============================================================================
// STYLE & MOOD
// ============================================================================

export type DesignMood =
  | 'minimal'      // Épuré, beaucoup d'espace blanc
  | 'bold'         // Contrastes forts, couleurs vives
  | 'elegant'      // Sophistiqué, luxueux
  | 'playful'      // Fun, coloré, ludique
  | 'corporate'    // Professionnel, sérieux
  | 'tech'         // Moderne, futuriste
  | 'organic'      // Naturel, formes douces
  | 'brutalist'    // Raw, brut, experimental
  | 'retro'        // Vintage, nostalgique
  | 'glassmorphic'; // Transparence, blur, depth

export type ProjectType =
  | 'ecommerce'
  | 'saas'
  | 'portfolio'
  | 'blog'
  | 'landing'
  | 'dashboard'
  | 'agency'
  | 'restaurant'
  | 'healthcare'
  | 'education'
  | 'finance'
  | 'travel'
  | 'fitness'
  | 'music'
  | 'gaming'
  | 'nonprofit'
  | 'realestate'
  | 'legal'
  | 'other';

export interface StyleDirection {
  mood: DesignMood;
  projectType: ProjectType;

  // Caractéristiques
  contrast: 'low' | 'medium' | 'high';
  density: 'spacious' | 'balanced' | 'compact';
  complexity: 'simple' | 'moderate' | 'complex';

  // Préférences visuelles
  useGradients: boolean;
  useAnimations: boolean;
  useShadows: boolean;
  useGlassmorphism: boolean;
  useBorders: boolean;

  // Forme des éléments
  borderRadiusStyle: 'sharp' | 'slightly-rounded' | 'rounded' | 'pill';
}

// ============================================================================
// DESIGN CONTEXT COMPLET
// ============================================================================

export interface DesignContext {
  // Identifiant unique pour ce design
  id: string;

  // Metadata
  projectName: string;
  generatedAt: number;

  // Style direction
  style: StyleDirection;

  // Design tokens
  palette: ColorPalette;
  typography: Typography;
  spacing: Spacing;
  effects: Effects;

  // CSS Variables générées
  cssVariables: string;

  // Tailwind config partiel (si nécessaire)
  tailwindExtend?: Record<string, unknown>;

  // Instructions pour le coder agent
  coderInstructions: string;
}

// ============================================================================
// ANALYSE DE REQUÊTE
// ============================================================================

export interface ProjectAnalysis {
  // Type de projet détecté
  projectType: ProjectType;

  // Mots-clés extraits
  keywords: string[];

  // Secteur d'activité
  industry?: string;

  // Audience cible
  targetAudience?: string;

  // Mood suggéré
  suggestedMood: DesignMood;

  // Caractéristiques détectées
  characteristics: {
    isPremium: boolean;
    isPlayful: boolean;
    isCorporate: boolean;
    isMinimal: boolean;
    isBold: boolean;
    isCreative: boolean;
  };

  // Confiance de l'analyse (0-1)
  confidence: number;
}
```

**Temps estimé**: 1-2 heures
**Complexité**: Moyenne

---

### Étape 1.2: Analyseur de Style (IA)

**Fichier**: `app/lib/design/style-analyzer.ts`

```typescript
/**
 * Style Analyzer
 * Analyse la requête utilisateur pour déterminer le style approprié
 */

import type { ProjectAnalysis, ProjectType, DesignMood } from './types';

// Keywords pour détecter le type de projet
const PROJECT_TYPE_KEYWORDS: Record<ProjectType, string[]> = {
  ecommerce: ['boutique', 'shop', 'e-commerce', 'ecommerce', 'vente', 'produit', 'panier', 'checkout', 'magasin', 'store'],
  saas: ['saas', 'app', 'application', 'dashboard', 'plateforme', 'outil', 'logiciel', 'software', 'subscription'],
  portfolio: ['portfolio', 'cv', 'resume', 'freelance', 'personnel', 'artiste', 'designer', 'photographe', 'créatif'],
  blog: ['blog', 'article', 'magazine', 'news', 'actualité', 'journal', 'publication', 'contenu'],
  landing: ['landing', 'page', 'présentation', 'vitrine', 'promo', 'lancement', 'startup'],
  dashboard: ['dashboard', 'admin', 'backoffice', 'tableau de bord', 'analytics', 'metrics', 'gestion'],
  agency: ['agence', 'agency', 'studio', 'cabinet', 'conseil', 'consulting', 'services'],
  restaurant: ['restaurant', 'café', 'bistro', 'bar', 'food', 'menu', 'cuisine', 'gastronomie', 'boulangerie'],
  healthcare: ['santé', 'health', 'médical', 'clinique', 'docteur', 'pharmacie', 'bien-être', 'wellness'],
  education: ['éducation', 'formation', 'cours', 'école', 'université', 'e-learning', 'tutoriel'],
  finance: ['finance', 'banque', 'investissement', 'crypto', 'trading', 'assurance', 'fintech'],
  travel: ['voyage', 'travel', 'hôtel', 'booking', 'tourisme', 'destination', 'aventure'],
  fitness: ['fitness', 'sport', 'gym', 'workout', 'yoga', 'coach', 'training', 'musculation'],
  music: ['musique', 'music', 'artiste', 'album', 'concert', 'streaming', 'podcast', 'audio'],
  gaming: ['gaming', 'jeu', 'game', 'esport', 'streamer', 'twitch', 'gamer'],
  nonprofit: ['association', 'nonprofit', 'ong', 'charité', 'donation', 'cause', 'bénévole'],
  realestate: ['immobilier', 'real estate', 'propriété', 'appartement', 'maison', 'location', 'agence immobilière'],
  legal: ['avocat', 'juridique', 'legal', 'cabinet', 'droit', 'notaire', 'justice'],
  other: [],
};

// Keywords pour détecter le mood
const MOOD_KEYWORDS: Record<DesignMood, string[]> = {
  minimal: ['minimal', 'minimaliste', 'simple', 'épuré', 'clean', 'sobre'],
  bold: ['bold', 'audacieux', 'fort', 'impact', 'puissant', 'dynamique', 'énergique'],
  elegant: ['élégant', 'luxe', 'premium', 'raffiné', 'sophistiqué', 'chic', 'haut de gamme'],
  playful: ['fun', 'ludique', 'coloré', 'joyeux', 'enfant', 'amusant', 'créatif'],
  corporate: ['corporate', 'professionnel', 'entreprise', 'business', 'sérieux', 'formel'],
  tech: ['tech', 'moderne', 'futuriste', 'innovation', 'startup', 'digital', 'high-tech'],
  organic: ['naturel', 'organique', 'bio', 'écolo', 'vert', 'durable', 'nature'],
  brutalist: ['brut', 'raw', 'experimental', 'artistique', 'underground', 'avant-garde'],
  retro: ['vintage', 'rétro', 'nostalgique', '80s', '90s', 'old school', 'classique'],
  glassmorphic: ['glass', 'transparent', 'blur', 'moderne', 'depth', 'layered'],
};

// Mapping type de projet -> mood par défaut
const DEFAULT_MOOD_BY_TYPE: Record<ProjectType, DesignMood> = {
  ecommerce: 'bold',
  saas: 'tech',
  portfolio: 'minimal',
  blog: 'elegant',
  landing: 'bold',
  dashboard: 'minimal',
  agency: 'elegant',
  restaurant: 'organic',
  healthcare: 'minimal',
  education: 'playful',
  finance: 'corporate',
  travel: 'bold',
  fitness: 'bold',
  music: 'brutalist',
  gaming: 'bold',
  nonprofit: 'organic',
  realestate: 'elegant',
  legal: 'corporate',
  other: 'minimal',
};

/**
 * Analyse une requête utilisateur pour extraire le contexte de design
 */
export function analyzeProjectRequest(userRequest: string): ProjectAnalysis {
  const lowerRequest = userRequest.toLowerCase();

  // 1. Détecter le type de projet
  let projectType: ProjectType = 'other';
  let maxMatches = 0;

  for (const [type, keywords] of Object.entries(PROJECT_TYPE_KEYWORDS)) {
    const matches = keywords.filter(kw => lowerRequest.includes(kw)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      projectType = type as ProjectType;
    }
  }

  // 2. Extraire les mots-clés pertinents
  const keywords: string[] = [];
  for (const [, kws] of Object.entries(PROJECT_TYPE_KEYWORDS)) {
    keywords.push(...kws.filter(kw => lowerRequest.includes(kw)));
  }
  for (const [, kws] of Object.entries(MOOD_KEYWORDS)) {
    keywords.push(...kws.filter(kw => lowerRequest.includes(kw)));
  }

  // 3. Détecter le mood explicite ou utiliser le défaut
  let suggestedMood: DesignMood = DEFAULT_MOOD_BY_TYPE[projectType];

  for (const [mood, moodKeywords] of Object.entries(MOOD_KEYWORDS)) {
    if (moodKeywords.some(kw => lowerRequest.includes(kw))) {
      suggestedMood = mood as DesignMood;
      break;
    }
  }

  // 4. Détecter les caractéristiques
  const characteristics = {
    isPremium: /luxe|premium|haut de gamme|élégant|raffiné/i.test(userRequest),
    isPlayful: /fun|ludique|coloré|joyeux|enfant/i.test(userRequest),
    isCorporate: /corporate|entreprise|business|professionnel/i.test(userRequest),
    isMinimal: /minimal|simple|épuré|clean/i.test(userRequest),
    isBold: /bold|audacieux|fort|impact|dynamique/i.test(userRequest),
    isCreative: /créatif|artistique|designer|portfolio/i.test(userRequest),
  };

  // 5. Détecter l'industrie
  let industry: string | undefined;
  const industryPatterns: Record<string, RegExp> = {
    'Food & Beverage': /café|restaurant|boulangerie|pâtisserie|food|cuisine|gastronomie/i,
    'Fashion': /mode|fashion|vêtement|boutique|style|accessoire/i,
    'Technology': /tech|software|app|saas|startup|digital/i,
    'Health & Wellness': /santé|wellness|médical|fitness|yoga|bien-être/i,
    'Finance': /finance|banque|crypto|trading|investissement/i,
    'Real Estate': /immobilier|appartement|maison|location/i,
    'Education': /éducation|formation|cours|école|université/i,
    'Entertainment': /musique|gaming|film|art|culture/i,
    'Travel': /voyage|tourisme|hôtel|destination/i,
  };

  for (const [ind, pattern] of Object.entries(industryPatterns)) {
    if (pattern.test(userRequest)) {
      industry = ind;
      break;
    }
  }

  // 6. Calculer la confiance
  const confidence = Math.min(1, (keywords.length * 0.1) + (maxMatches * 0.15) + 0.3);

  return {
    projectType,
    keywords: [...new Set(keywords)],
    industry,
    targetAudience: undefined, // Peut être enrichi plus tard
    suggestedMood,
    characteristics,
    confidence,
  };
}

/**
 * Génère les caractéristiques de style basées sur l'analyse
 */
export function generateStyleDirection(analysis: ProjectAnalysis): StyleDirection {
  const { suggestedMood, projectType, characteristics } = analysis;

  // Déterminer le contraste
  let contrast: 'low' | 'medium' | 'high' = 'medium';
  if (characteristics.isBold || suggestedMood === 'bold' || suggestedMood === 'brutalist') {
    contrast = 'high';
  } else if (characteristics.isMinimal || suggestedMood === 'minimal' || suggestedMood === 'elegant') {
    contrast = 'low';
  }

  // Déterminer la densité
  let density: 'spacious' | 'balanced' | 'compact' = 'balanced';
  if (characteristics.isMinimal || suggestedMood === 'minimal' || suggestedMood === 'elegant') {
    density = 'spacious';
  } else if (projectType === 'dashboard' || projectType === 'ecommerce') {
    density = 'compact';
  }

  // Déterminer la complexité
  let complexity: 'simple' | 'moderate' | 'complex' = 'moderate';
  if (characteristics.isMinimal) {
    complexity = 'simple';
  } else if (characteristics.isCreative || suggestedMood === 'brutalist') {
    complexity = 'complex';
  }

  // Déterminer le style de border-radius
  let borderRadiusStyle: 'sharp' | 'slightly-rounded' | 'rounded' | 'pill' = 'rounded';
  if (suggestedMood === 'brutalist' || suggestedMood === 'corporate') {
    borderRadiusStyle = 'sharp';
  } else if (suggestedMood === 'playful') {
    borderRadiusStyle = 'pill';
  } else if (suggestedMood === 'elegant') {
    borderRadiusStyle = 'slightly-rounded';
  }

  return {
    mood: suggestedMood,
    projectType,
    contrast,
    density,
    complexity,
    useGradients: suggestedMood !== 'minimal' && suggestedMood !== 'corporate',
    useAnimations: true,
    useShadows: suggestedMood !== 'brutalist',
    useGlassmorphism: suggestedMood === 'glassmorphic' || suggestedMood === 'tech',
    useBorders: suggestedMood === 'minimal' || suggestedMood === 'corporate',
    borderRadiusStyle,
  };
}
```

**Temps estimé**: 2-3 heures
**Complexité**: Moyenne-Élevée

---

### Étape 1.3: Générateur de Palettes Uniques

**Fichier**: `app/lib/design/palette-generator.ts`

```typescript
/**
 * Palette Generator
 * Génère des palettes de couleurs uniques basées sur la théorie des couleurs
 */

import type { ColorPalette, DesignMood, ProjectType, StyleDirection } from './types';

// ============================================================================
// PALETTES DE BASE PAR MOOD (point de départ)
// ============================================================================

interface BasePalette {
  hueRange: [number, number];  // Plage de teintes (0-360)
  saturation: [number, number]; // Plage de saturation (0-100)
  lightness: [number, number];  // Plage de luminosité (0-100)
}

const MOOD_BASE_PALETTES: Record<DesignMood, BasePalette> = {
  minimal: { hueRange: [0, 360], saturation: [5, 30], lightness: [90, 98] },
  bold: { hueRange: [0, 360], saturation: [70, 100], lightness: [45, 60] },
  elegant: { hueRange: [20, 60], saturation: [20, 50], lightness: [20, 40] },
  playful: { hueRange: [0, 360], saturation: [60, 90], lightness: [50, 70] },
  corporate: { hueRange: [200, 240], saturation: [40, 70], lightness: [30, 50] },
  tech: { hueRange: [180, 280], saturation: [50, 80], lightness: [40, 60] },
  organic: { hueRange: [80, 160], saturation: [30, 60], lightness: [35, 55] },
  brutalist: { hueRange: [0, 360], saturation: [0, 20], lightness: [5, 95] },
  retro: { hueRange: [15, 50], saturation: [50, 80], lightness: [50, 70] },
  glassmorphic: { hueRange: [200, 280], saturation: [30, 60], lightness: [50, 70] },
};

// Palettes spécifiques par industrie
const INDUSTRY_HUES: Record<string, number[]> = {
  'Food & Beverage': [25, 35, 45, 15, 5], // Oranges, marrons, beiges
  'Fashion': [0, 330, 280, 45], // Noir, rose, violet, or
  'Technology': [210, 250, 180, 280], // Bleus, cyans, violets
  'Health & Wellness': [150, 170, 120, 200], // Verts, turquoises
  'Finance': [210, 220, 230, 200], // Bleus professionnels
  'Real Estate': [30, 200, 150, 0], // Neutres, bleus, verts
  'Education': [45, 210, 280, 150], // Jaunes, bleus, violets
  'Entertainment': [280, 330, 45, 180], // Violets, roses, jaunes
  'Travel': [200, 30, 45, 150], // Bleus, oranges, verts
};

// ============================================================================
// ALGORITHMES DE GÉNÉRATION
// ============================================================================

/**
 * Génère un nombre aléatoire dans une plage
 */
function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Convertit HSL en Hex
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Génère des variations de luminosité
 */
function generateShades(h: number, s: number, baseL: number): { light: string; base: string; dark: string } {
  return {
    light: hslToHex(h, s, Math.min(95, baseL + 20)),
    base: hslToHex(h, s, baseL),
    dark: hslToHex(h, s, Math.max(15, baseL - 20)),
  };
}

/**
 * Génère une couleur complémentaire
 */
function getComplementary(h: number): number {
  return (h + 180) % 360;
}

/**
 * Génère une couleur analogue
 */
function getAnalogous(h: number, offset: number = 30): number {
  return (h + offset) % 360;
}

/**
 * Génère une couleur triadique
 */
function getTriadic(h: number): [number, number] {
  return [(h + 120) % 360, (h + 240) % 360];
}

// ============================================================================
// GÉNÉRATION PRINCIPALE
// ============================================================================

/**
 * Génère une palette de couleurs unique
 */
export function generateUniquePalette(style: StyleDirection, industry?: string): ColorPalette {
  const basePalette = MOOD_BASE_PALETTES[style.mood];

  // 1. Choisir la teinte principale
  let primaryHue: number;

  if (industry && INDUSTRY_HUES[industry]) {
    // Utiliser une teinte appropriée pour l'industrie
    const industryHues = INDUSTRY_HUES[industry];
    primaryHue = industryHues[randomInRange(0, industryHues.length - 1)];
  } else {
    // Générer une teinte aléatoire dans la plage du mood
    primaryHue = randomInRange(basePalette.hueRange[0], basePalette.hueRange[1]);
  }

  // 2. Déterminer saturation et luminosité
  const primarySat = randomInRange(basePalette.saturation[0], basePalette.saturation[1]);
  const primaryLight = randomInRange(basePalette.lightness[0], basePalette.lightness[1]);

  // 3. Générer les couleurs primaires
  const primaryShades = generateShades(primaryHue, primarySat, primaryLight);

  // 4. Choisir la stratégie de couleur secondaire
  const strategies = ['complementary', 'analogous', 'triadic'] as const;
  const strategy = strategies[randomInRange(0, strategies.length - 1)];

  let secondaryHue: number;
  let accentHue: number;

  switch (strategy) {
    case 'complementary':
      secondaryHue = getComplementary(primaryHue);
      accentHue = getAnalogous(primaryHue, 45);
      break;
    case 'analogous':
      secondaryHue = getAnalogous(primaryHue, 30);
      accentHue = getAnalogous(primaryHue, -30);
      break;
    case 'triadic':
      [secondaryHue, accentHue] = getTriadic(primaryHue);
      break;
  }

  // 5. Générer les couleurs secondaires et accent
  const secondarySat = Math.max(20, primarySat - 10);
  const accentSat = Math.min(100, primarySat + 10);

  const secondaryShades = generateShades(secondaryHue, secondarySat, primaryLight);
  const accentShades = generateShades(accentHue, accentSat, primaryLight);

  // 6. Générer les couleurs de fond basées sur le mood
  let background: string;
  let backgroundAlt: string;
  let surface: string;
  let surfaceHover: string;

  if (style.mood === 'bold' || style.mood === 'brutalist') {
    // Fond sombre pour les designs audacieux
    background = hslToHex(primaryHue, 10, 8);
    backgroundAlt = hslToHex(primaryHue, 10, 12);
    surface = hslToHex(primaryHue, 10, 15);
    surfaceHover = hslToHex(primaryHue, 10, 20);
  } else if (style.mood === 'elegant') {
    // Fond neutre chaud pour l'élégance
    background = hslToHex(30, 5, 98);
    backgroundAlt = hslToHex(30, 8, 94);
    surface = hslToHex(30, 3, 100);
    surfaceHover = hslToHex(30, 5, 96);
  } else {
    // Fond clair par défaut
    background = hslToHex(primaryHue, 5, 98);
    backgroundAlt = hslToHex(primaryHue, 8, 94);
    surface = hslToHex(0, 0, 100);
    surfaceHover = hslToHex(primaryHue, 5, 96);
  }

  // 7. Couleurs de texte
  let text: string;
  let textMuted: string;
  let textInverse: string;

  if (style.mood === 'bold' || style.mood === 'brutalist') {
    text = hslToHex(0, 0, 95);
    textMuted = hslToHex(0, 0, 60);
    textInverse = hslToHex(0, 0, 10);
  } else {
    text = hslToHex(primaryHue, 20, 15);
    textMuted = hslToHex(primaryHue, 10, 45);
    textInverse = hslToHex(0, 0, 98);
  }

  // 8. Couleurs d'état
  const success = hslToHex(145, 70, 45);
  const warning = hslToHex(40, 90, 50);
  const error = hslToHex(0, 75, 55);
  const info = hslToHex(210, 80, 55);

  // 9. Bordures
  const border = hslToHex(primaryHue, 10, 85);
  const borderHover = hslToHex(primaryHue, 20, 70);

  // 10. Gradients (optionnel)
  let gradientStart: string | undefined;
  let gradientEnd: string | undefined;
  let gradientDirection: string | undefined;

  if (style.useGradients) {
    gradientStart = primaryShades.base;
    gradientEnd = secondaryShades.base;
    gradientDirection = 'to bottom right';
  }

  return {
    primary: primaryShades.base,
    primaryLight: primaryShades.light,
    primaryDark: primaryShades.dark,

    secondary: secondaryShades.base,
    secondaryLight: secondaryShades.light,
    secondaryDark: secondaryShades.dark,

    accent: accentShades.base,
    accentLight: accentShades.light,
    accentDark: accentShades.dark,

    background,
    backgroundAlt,
    surface,
    surfaceHover,

    text,
    textMuted,
    textInverse,

    success,
    warning,
    error,
    info,

    border,
    borderHover,

    gradientStart,
    gradientEnd,
    gradientDirection,
  };
}
```

**Temps estimé**: 3-4 heures
**Complexité**: Élevée

---

## Phase 2: Typographie et Spacing

### Étape 2.1: Sélecteur de Typographie

**Fichier**: `app/lib/design/typography-selector.ts`

```typescript
/**
 * Typography Selector
 * Sélectionne des combinaisons de polices harmonieuses
 */

import type { Typography, DesignMood, ProjectType } from './types';

// ============================================================================
// PAIRES DE POLICES HARMONIEUSES
// ============================================================================

interface FontPair {
  heading: string;
  body: string;
  mood: DesignMood[];
  projectTypes: ProjectType[];
  description: string;
}

const FONT_PAIRS: FontPair[] = [
  // Élégant / Luxe
  {
    heading: 'Playfair Display',
    body: 'Source Sans Pro',
    mood: ['elegant', 'minimal'],
    projectTypes: ['portfolio', 'blog', 'agency', 'restaurant', 'realestate'],
    description: 'Classique et raffiné',
  },
  {
    heading: 'Cormorant Garamond',
    body: 'Proza Libre',
    mood: ['elegant', 'organic'],
    projectTypes: ['blog', 'restaurant', 'healthcare', 'nonprofit'],
    description: 'Organique et sophistiqué',
  },

  // Moderne / Tech
  {
    heading: 'Space Grotesk',
    body: 'Inter',
    mood: ['tech', 'bold', 'minimal'],
    projectTypes: ['saas', 'dashboard', 'landing', 'finance'],
    description: 'Géométrique et moderne',
  },
  {
    heading: 'Clash Display',
    body: 'Satoshi',
    mood: ['tech', 'bold'],
    projectTypes: ['saas', 'landing', 'gaming'],
    description: 'Futuriste et impactant',
  },
  {
    heading: 'Cabinet Grotesk',
    body: 'General Sans',
    mood: ['tech', 'minimal', 'corporate'],
    projectTypes: ['saas', 'agency', 'finance'],
    description: 'Propre et professionnel',
  },

  // Playful / Creative
  {
    heading: 'Fredoka One',
    body: 'Nunito',
    mood: ['playful'],
    projectTypes: ['education', 'gaming', 'nonprofit'],
    description: 'Ludique et accessible',
  },
  {
    heading: 'Baloo 2',
    body: 'Quicksand',
    mood: ['playful', 'organic'],
    projectTypes: ['education', 'healthcare', 'fitness'],
    description: 'Amical et doux',
  },

  // Corporate / Business
  {
    heading: 'IBM Plex Sans',
    body: 'IBM Plex Sans',
    mood: ['corporate', 'minimal'],
    projectTypes: ['finance', 'legal', 'dashboard', 'saas'],
    description: 'Professionnel IBM',
  },
  {
    heading: 'Lexend',
    body: 'Lexend',
    mood: ['corporate', 'minimal'],
    projectTypes: ['finance', 'healthcare', 'education'],
    description: 'Lisibilité optimale',
  },

  // Bold / Impact
  {
    heading: 'Bebas Neue',
    body: 'Montserrat',
    mood: ['bold', 'brutalist'],
    projectTypes: ['fitness', 'gaming', 'music', 'travel'],
    description: 'Fort et dynamique',
  },
  {
    heading: 'Oswald',
    body: 'Open Sans',
    mood: ['bold', 'corporate'],
    projectTypes: ['fitness', 'ecommerce', 'travel'],
    description: 'Condensé et puissant',
  },

  // E-commerce / Retail
  {
    heading: 'DM Serif Display',
    body: 'DM Sans',
    mood: ['elegant', 'bold'],
    projectTypes: ['ecommerce', 'restaurant', 'realestate'],
    description: 'Équilibré et commercial',
  },
  {
    heading: 'Fraunces',
    body: 'Outfit',
    mood: ['organic', 'elegant'],
    projectTypes: ['ecommerce', 'restaurant', 'blog'],
    description: 'Artisanal et moderne',
  },

  // Minimal / Clean
  {
    heading: 'Poppins',
    body: 'Poppins',
    mood: ['minimal', 'tech', 'playful'],
    projectTypes: ['saas', 'landing', 'portfolio', 'education'],
    description: 'Polyvalent et propre',
  },
  {
    heading: 'Manrope',
    body: 'Manrope',
    mood: ['minimal', 'tech'],
    projectTypes: ['saas', 'dashboard', 'portfolio'],
    description: 'Minimaliste moderne',
  },

  // Retro / Vintage
  {
    heading: 'Abril Fatface',
    body: 'Lato',
    mood: ['retro', 'elegant'],
    projectTypes: ['blog', 'restaurant', 'portfolio'],
    description: 'Vintage chic',
  },

  // Glassmorphic / Modern
  {
    heading: 'Plus Jakarta Sans',
    body: 'Plus Jakarta Sans',
    mood: ['glassmorphic', 'tech', 'minimal'],
    projectTypes: ['saas', 'landing', 'dashboard'],
    description: 'Moderne et aéré',
  },
];

const MONO_FONTS = [
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'IBM Plex Mono',
  'Roboto Mono',
];

// ============================================================================
// SÉLECTION DE TYPOGRAPHIE
// ============================================================================

/**
 * Sélectionne une paire de polices appropriée
 */
export function selectTypographyPair(mood: DesignMood, projectType: ProjectType): { heading: string; body: string } {
  // Filtrer les paires compatibles
  const compatiblePairs = FONT_PAIRS.filter(pair =>
    pair.mood.includes(mood) || pair.projectTypes.includes(projectType)
  );

  if (compatiblePairs.length === 0) {
    // Fallback sur Poppins si aucune correspondance
    return { heading: 'Poppins', body: 'Poppins' };
  }

  // Prioriser les paires qui matchent les deux critères
  const perfectMatches = compatiblePairs.filter(pair =>
    pair.mood.includes(mood) && pair.projectTypes.includes(projectType)
  );

  const pool = perfectMatches.length > 0 ? perfectMatches : compatiblePairs;

  // Sélection aléatoire pour la variété
  const selected = pool[Math.floor(Math.random() * pool.length)];

  return { heading: selected.heading, body: selected.body };
}

/**
 * Génère la configuration typographique complète
 */
export function generateTypography(mood: DesignMood, projectType: ProjectType): Typography {
  const { heading, body } = selectTypographyPair(mood, projectType);
  const mono = MONO_FONTS[Math.floor(Math.random() * MONO_FONTS.length)];

  // Ajuster les tailles selon le mood
  let sizeMultiplier = 1;
  if (mood === 'bold' || mood === 'brutalist') {
    sizeMultiplier = 1.1;
  } else if (mood === 'minimal' || mood === 'elegant') {
    sizeMultiplier = 0.95;
  }

  return {
    fontHeading: heading,
    fontBody: body,
    fontMono: mono,

    sizes: {
      xs: `${0.75 * sizeMultiplier}rem`,
      sm: `${0.875 * sizeMultiplier}rem`,
      base: `${1 * sizeMultiplier}rem`,
      lg: `${1.125 * sizeMultiplier}rem`,
      xl: `${1.25 * sizeMultiplier}rem`,
      '2xl': `${1.5 * sizeMultiplier}rem`,
      '3xl': `${1.875 * sizeMultiplier}rem`,
      '4xl': `${2.25 * sizeMultiplier}rem`,
      '5xl': `${3 * sizeMultiplier}rem`,
      '6xl': `${3.75 * sizeMultiplier}rem`,
      '7xl': `${4.5 * sizeMultiplier}rem`,
    },

    weights: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },

    lineHeights: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.625',
      loose: '2',
    },

    letterSpacing: {
      tight: '-0.025em',
      normal: '0',
      wide: '0.025em',
      wider: '0.05em',
    },
  };
}
```

**Temps estimé**: 2-3 heures
**Complexité**: Moyenne

---

### Étape 2.2: Générateur de Spacing et Effects

**Fichier**: `app/lib/design/spacing-effects.ts`

```typescript
/**
 * Spacing & Effects Generator
 * Génère les systèmes de spacing et effets visuels
 */

import type { Spacing, Effects, StyleDirection } from './types';

/**
 * Génère le système de spacing
 */
export function generateSpacing(style: StyleDirection): Spacing {
  // Base unit selon la densité
  const baseUnit = style.density === 'compact' ? 4 : style.density === 'spacious' ? 8 : 4;

  // Container width selon le type de projet
  let containerMaxWidth = '1280px';
  if (style.projectType === 'blog' || style.projectType === 'portfolio') {
    containerMaxWidth = '1024px';
  } else if (style.projectType === 'dashboard') {
    containerMaxWidth = '1536px';
  }

  // Section padding selon la densité
  let sectionPaddingY = '6rem';
  if (style.density === 'spacious') {
    sectionPaddingY = '8rem';
  } else if (style.density === 'compact') {
    sectionPaddingY = '4rem';
  }

  return {
    baseUnit,
    scale: {
      0: '0',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
      8: '2rem',
      10: '2.5rem',
      12: '3rem',
      16: '4rem',
      20: '5rem',
      24: '6rem',
      32: '8rem',
    },
    containerMaxWidth,
    containerPadding: style.density === 'compact' ? '1rem' : '1.5rem',
    sectionPaddingY,
    gridGap: style.density === 'compact' ? '1rem' : '1.5rem',
  };
}

/**
 * Génère les effets visuels
 */
export function generateEffects(style: StyleDirection): Effects {
  // Border radius selon le style
  let radiusBase: Record<string, string>;

  switch (style.borderRadiusStyle) {
    case 'sharp':
      radiusBase = {
        none: '0',
        sm: '0',
        base: '0',
        md: '0.125rem',
        lg: '0.25rem',
        xl: '0.375rem',
        '2xl': '0.5rem',
        '3xl': '0.75rem',
        full: '9999px',
      };
      break;
    case 'slightly-rounded':
      radiusBase = {
        none: '0',
        sm: '0.125rem',
        base: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
        '3xl': '1rem',
        full: '9999px',
      };
      break;
    case 'pill':
      radiusBase = {
        none: '0',
        sm: '0.5rem',
        base: '0.75rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '2.5rem',
        '3xl': '3rem',
        full: '9999px',
      };
      break;
    case 'rounded':
    default:
      radiusBase = {
        none: '0',
        sm: '0.25rem',
        base: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        full: '9999px',
      };
  }

  // Shadows selon le mood
  let shadows: Record<string, string>;

  if (!style.useShadows) {
    shadows = {
      none: 'none',
      sm: 'none',
      base: 'none',
      md: 'none',
      lg: 'none',
      xl: 'none',
      '2xl': 'none',
      inner: 'none',
    };
  } else if (style.mood === 'bold' || style.mood === 'tech') {
    // Shadows plus prononcées
    shadows = {
      none: 'none',
      sm: '0 1px 3px 0 rgb(0 0 0 / 0.15)',
      base: '0 2px 6px -1px rgb(0 0 0 / 0.15)',
      md: '0 6px 12px -2px rgb(0 0 0 / 0.2)',
      lg: '0 12px 24px -4px rgb(0 0 0 / 0.25)',
      xl: '0 20px 40px -8px rgb(0 0 0 / 0.3)',
      '2xl': '0 32px 64px -12px rgb(0 0 0 / 0.35)',
      inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.1)',
    };
  } else {
    // Shadows subtiles par défaut
    shadows = {
      none: 'none',
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      base: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    };
  }

  // Blur pour glassmorphism
  const blur = {
    none: '0',
    sm: '4px',
    base: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  };

  return {
    radius: radiusBase,
    shadows,
    blur,
    transitions: {
      fast: '150ms ease',
      base: '200ms ease',
      slow: '300ms ease',
      slower: '500ms ease',
    },
  };
}
```

**Temps estimé**: 2 heures
**Complexité**: Moyenne

---

## Phase 3: Assemblage et Intégration

> **⚠️ IMPORTANT - INTÉGRATION UNIVERSELLE**
>
> Le Design Context System doit fonctionner dans TOUS les modes:
> - **Single-Agent Mode**: L'utilisateur discute directement avec Claude
> - **Multi-Agent Mode**: Le système utilise des agents spécialisés (coder, planner, etc.)
>
> Pour cela, l'intégration se fait à DEUX niveaux:
> 1. **Niveau Universel**: `stream-text.ts` → Fonctionne dans TOUS les cas
> 2. **Niveau Agent**: `coder-prompt.ts` → Instructions enrichies pour le coder agent

### Architecture d'Intégration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUX D'INTÉGRATION DESIGN CONTEXT                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   User Request   │                                                       │
│  │  "Crée un site   │                                                       │
│  │   e-commerce"    │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        stream-text.ts                                 │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │  let systemPrompt = getSystemPrompt();                         │  │  │
│  │  │                         │                                       │  │  │
│  │  │                         ▼                                       │  │  │
│  │  │  ┌──────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  if (isUIRequest(messages)) {                            │  │  │  │
│  │  │  │    const designContext = createDesignContext(request);   │  │  │  │
│  │  │  │    systemPrompt += designContext.coderInstructions;      │  │  │  │
│  │  │  │  }                                                       │  │  │  │
│  │  │  └──────────────────────────────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│           │                                                                 │
│           ├──────────────────────┬──────────────────────┐                  │
│           │                      │                      │                  │
│           ▼                      ▼                      ▼                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐           │
│  │  Single-Agent  │    │  Multi-Agent   │    │  API Externe   │           │
│  │     Mode       │    │     Mode       │    │   (api.chat)   │           │
│  │                │    │                │    │                │           │
│  │  Claude direct │    │  Coder Agent   │    │  Claude API    │           │
│  │  avec design   │    │  avec design   │    │  avec design   │           │
│  │  context       │    │  context       │    │  context       │           │
│  └────────────────┘    └────────────────┘    └────────────────┘           │
│                                                                             │
│  ✅ Le Design Context est TOUJOURS injecté, quel que soit le mode          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Étape 3.1: Design Context Builder

**Fichier**: `app/lib/design/design-context-builder.ts`

```typescript
/**
 * Design Context Builder
 * Assemble tous les éléments pour créer un contexte de design complet
 */

import { v4 as uuidv4 } from 'uuid';
import type { DesignContext, ProjectAnalysis, StyleDirection } from './types';
import { analyzeProjectRequest, generateStyleDirection } from './style-analyzer';
import { generateUniquePalette } from './palette-generator';
import { generateTypography } from './typography-selector';
import { generateSpacing, generateEffects } from './spacing-effects';

/**
 * Génère les variables CSS à partir du design context
 */
function generateCSSVariables(context: Omit<DesignContext, 'cssVariables' | 'coderInstructions'>): string {
  const { palette, typography, spacing, effects } = context;

  return `
:root {
  /* ===== BAVINI DESIGN SYSTEM - AUTO-GENERATED ===== */
  /* Project: ${context.projectName} */
  /* Style: ${context.style.mood} | ${context.style.projectType} */

  /* Colors - Primary */
  --color-primary: ${palette.primary};
  --color-primary-light: ${palette.primaryLight};
  --color-primary-dark: ${palette.primaryDark};

  /* Colors - Secondary */
  --color-secondary: ${palette.secondary};
  --color-secondary-light: ${palette.secondaryLight};
  --color-secondary-dark: ${palette.secondaryDark};

  /* Colors - Accent */
  --color-accent: ${palette.accent};
  --color-accent-light: ${palette.accentLight};
  --color-accent-dark: ${palette.accentDark};

  /* Colors - Background */
  --color-background: ${palette.background};
  --color-background-alt: ${palette.backgroundAlt};
  --color-surface: ${palette.surface};
  --color-surface-hover: ${palette.surfaceHover};

  /* Colors - Text */
  --color-text: ${palette.text};
  --color-text-muted: ${palette.textMuted};
  --color-text-inverse: ${palette.textInverse};

  /* Colors - State */
  --color-success: ${palette.success};
  --color-warning: ${palette.warning};
  --color-error: ${palette.error};
  --color-info: ${palette.info};

  /* Colors - Border */
  --color-border: ${palette.border};
  --color-border-hover: ${palette.borderHover};

  /* Typography */
  --font-heading: '${typography.fontHeading}', system-ui, sans-serif;
  --font-body: '${typography.fontBody}', system-ui, sans-serif;
  --font-mono: '${typography.fontMono}', monospace;

  /* Font Sizes */
  --text-xs: ${typography.sizes.xs};
  --text-sm: ${typography.sizes.sm};
  --text-base: ${typography.sizes.base};
  --text-lg: ${typography.sizes.lg};
  --text-xl: ${typography.sizes.xl};
  --text-2xl: ${typography.sizes['2xl']};
  --text-3xl: ${typography.sizes['3xl']};
  --text-4xl: ${typography.sizes['4xl']};
  --text-5xl: ${typography.sizes['5xl']};
  --text-6xl: ${typography.sizes['6xl']};
  --text-7xl: ${typography.sizes['7xl']};

  /* Spacing */
  --container-max-width: ${spacing.containerMaxWidth};
  --container-padding: ${spacing.containerPadding};
  --section-padding-y: ${spacing.sectionPaddingY};
  --grid-gap: ${spacing.gridGap};

  /* Border Radius */
  --radius-sm: ${effects.radius.sm};
  --radius-base: ${effects.radius.base};
  --radius-md: ${effects.radius.md};
  --radius-lg: ${effects.radius.lg};
  --radius-xl: ${effects.radius.xl};
  --radius-2xl: ${effects.radius['2xl']};
  --radius-full: ${effects.radius.full};

  /* Shadows */
  --shadow-sm: ${effects.shadows.sm};
  --shadow-base: ${effects.shadows.base};
  --shadow-md: ${effects.shadows.md};
  --shadow-lg: ${effects.shadows.lg};
  --shadow-xl: ${effects.shadows.xl};

  /* Transitions */
  --transition-fast: ${effects.transitions.fast};
  --transition-base: ${effects.transitions.base};
  --transition-slow: ${effects.transitions.slow};

  ${palette.gradientStart ? `
  /* Gradient */
  --gradient-start: ${palette.gradientStart};
  --gradient-end: ${palette.gradientEnd};
  --gradient-direction: ${palette.gradientDirection};
  --gradient: linear-gradient(${palette.gradientDirection}, ${palette.gradientStart}, ${palette.gradientEnd});
  ` : ''}
}

/* Base styles */
body {
  font-family: var(--font-body);
  background-color: var(--color-background);
  color: var(--color-text);
  line-height: ${typography.lineHeights.normal};
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  font-weight: ${typography.weights.bold};
  line-height: ${typography.lineHeights.tight};
}
`.trim();
}

/**
 * Génère les instructions pour le Coder Agent
 */
function generateCoderInstructions(context: Omit<DesignContext, 'cssVariables' | 'coderInstructions'>): string {
  const { style, palette, typography, effects } = context;

  return `
## 🎨 DESIGN CONTEXT POUR CE PROJET

### Style Direction
- **Mood**: ${style.mood.toUpperCase()}
- **Type**: ${style.projectType}
- **Contraste**: ${style.contrast}
- **Densité**: ${style.density}

### Palette de Couleurs (UTILISER CES COULEURS)
| Rôle | Couleur | Usage |
|------|---------|-------|
| Primary | \`${palette.primary}\` | Boutons CTA, liens, accents principaux |
| Secondary | \`${palette.secondary}\` | Éléments secondaires, badges |
| Accent | \`${palette.accent}\` | Highlights, notifications |
| Background | \`${palette.background}\` | Fond principal |
| Surface | \`${palette.surface}\` | Cartes, modales |
| Text | \`${palette.text}\` | Texte principal |
| Text Muted | \`${palette.textMuted}\` | Texte secondaire |

### Typographie
- **Titres**: \`${typography.fontHeading}\` (bold, ${typography.lineHeights.tight})
- **Corps**: \`${typography.fontBody}\` (normal, ${typography.lineHeights.normal})
- **Code**: \`${typography.fontMono}\`

### Effets Visuels
- **Border Radius**: ${style.borderRadiusStyle} (utiliser \`${effects.radius.lg}\` pour les cartes)
- **Shadows**: ${style.useShadows ? 'Actives' : 'Désactivées'}
- **Gradients**: ${style.useGradients ? 'Actifs' : 'Désactivés'}
- **Glassmorphism**: ${style.useGlassmorphism ? 'Actif' : 'Désactivé'}

### Instructions Spécifiques
${style.mood === 'minimal' ? `
- Beaucoup d'espace blanc
- Éléments épurés
- Pas de décorations superflues
` : ''}
${style.mood === 'bold' ? `
- Contrastes forts entre les éléments
- Titres imposants
- Couleurs vives et saturées
- Animations dynamiques
` : ''}
${style.mood === 'elegant' ? `
- Typographie raffinée
- Espacement généreux
- Transitions douces
- Palette sobre avec touches de couleur
` : ''}
${style.mood === 'playful' ? `
- Couleurs vives et variées
- Formes arrondies
- Animations ludiques
- Éléments visuels fun
` : ''}
${style.useGlassmorphism ? `
- Utiliser backdrop-blur pour les surfaces
- Fonds semi-transparents (bg-white/80 dark:bg-slate-900/80)
- Bordures subtiles (border-white/20)
` : ''}

### CSS Variables Disponibles
Les variables CSS sont déjà injectées dans \`:root\`. Utiliser:
- \`var(--color-primary)\` au lieu de couleurs hardcodées
- \`var(--font-heading)\` pour les titres
- \`var(--radius-lg)\` pour les border-radius
- \`var(--shadow-md)\` pour les shadows

### Google Fonts à Importer
\`\`\`html
<link href="https://fonts.googleapis.com/css2?family=${typography.fontHeading.replace(/ /g, '+')}:wght@400;600;700&family=${typography.fontBody.replace(/ /g, '+')}:wght@400;500;600&display=swap" rel="stylesheet">
\`\`\`
`.trim();
}

/**
 * Crée un Design Context complet à partir d'une requête utilisateur
 */
export function createDesignContext(userRequest: string, projectName?: string): DesignContext {
  // 1. Analyser la requête
  const analysis: ProjectAnalysis = analyzeProjectRequest(userRequest);

  // 2. Générer la direction de style
  const style: StyleDirection = generateStyleDirection(analysis);

  // 3. Générer la palette de couleurs unique
  const palette = generateUniquePalette(style, analysis.industry);

  // 4. Générer la typographie
  const typography = generateTypography(style.mood, style.projectType);

  // 5. Générer le spacing
  const spacing = generateSpacing(style);

  // 6. Générer les effets
  const effects = generateEffects(style);

  // 7. Assembler le contexte partiel
  const partialContext = {
    id: uuidv4(),
    projectName: projectName || `Project-${Date.now()}`,
    generatedAt: Date.now(),
    style,
    palette,
    typography,
    spacing,
    effects,
  };

  // 8. Générer les CSS variables et instructions
  const cssVariables = generateCSSVariables(partialContext);
  const coderInstructions = generateCoderInstructions(partialContext);

  return {
    ...partialContext,
    cssVariables,
    coderInstructions,
  };
}

/**
 * Exporte le design context pour debug/preview
 */
export function exportDesignContextSummary(context: DesignContext): string {
  return `
# Design Context: ${context.projectName}

## Style
- Mood: ${context.style.mood}
- Type: ${context.style.projectType}
- Contrast: ${context.style.contrast}
- Density: ${context.style.density}

## Palette
- Primary: ${context.palette.primary}
- Secondary: ${context.palette.secondary}
- Accent: ${context.palette.accent}
- Background: ${context.palette.background}
- Text: ${context.palette.text}

## Typography
- Headings: ${context.typography.fontHeading}
- Body: ${context.typography.fontBody}

## Effects
- Border Radius: ${context.style.borderRadiusStyle}
- Gradients: ${context.style.useGradients ? 'Yes' : 'No'}
- Shadows: ${context.style.useShadows ? 'Yes' : 'No'}
- Glassmorphism: ${context.style.useGlassmorphism ? 'Yes' : 'No'}
`.trim();
}
```

**Temps estimé**: 3-4 heures
**Complexité**: Élevée

---

### Étape 3.2: Intégration Universelle via stream-text.ts (CRITIQUE)

> **🎯 C'est LE point d'intégration principal**
>
> Cette modification garantit que le Design Context fonctionne:
> - ✅ En mode Single-Agent (chat direct avec Claude)
> - ✅ En mode Multi-Agent (agents spécialisés)
> - ✅ Via l'API externe (api.chat.ts)

**Fichier**: `app/lib/.server/llm/stream-text.ts` (modification)

```typescript
import { streamText as _streamText, stepCountIs, type ToolSet } from 'ai';
import { getAPIKey } from '~/lib/.server/llm/api-key';
import { getAnthropicModel } from '~/lib/.server/llm/model';
import { MAX_TOKENS } from './constants';
import { getSystemPrompt } from './prompts';
import { createWebSearchTools, getWebSearchStatus, isWebSearchAvailable } from './web-search';
import { createDesignContext, type DesignContext } from '~/lib/design/design-context-builder';
import type { Message } from '~/types/message';

export type Messages = Message[];

export interface StreamingOptions {
  onFinish?: Parameters<typeof _streamText>[0]['onFinish'];
  onChunk?: Parameters<typeof _streamText>[0]['onChunk'];
  abortSignal?: AbortSignal;
  toolChoice?: Parameters<typeof _streamText>[0]['toolChoice'];

  /** Enable web search tools (requires TAVILY_API_KEY) */
  enableWebSearch?: boolean;

  /** Disable design context injection (for non-UI tasks) */
  disableDesignContext?: boolean;
}

/**
 * Détecte si la requête utilisateur concerne une UI/design
 */
function isUIRequest(messages: Messages): boolean {
  // Extraire le dernier message utilisateur
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) return false;

  const content = typeof lastUserMessage.content === 'string'
    ? lastUserMessage.content
    : lastUserMessage.content.map(c => c.type === 'text' ? c.text : '').join(' ');

  // Patterns pour détecter les requêtes UI
  const uiPatterns = [
    /\b(site|page|app|application|dashboard|interface|ui|design)\b/i,
    /\b(boutique|portfolio|landing|website|webpage)\b/i,
    /\b(créer?|build|make|develop|design|implement)\b.*\b(ui|interface|page|site|app)\b/i,
    /\b(e-?commerce|saas|blog|restaurant|agency)\b/i,
    /\b(react|next\.?js|vue|angular|svelte)\b.*\b(component|page|app)\b/i,
    /\b(tailwind|css|style|styling|layout)\b/i,
  ];

  return uiPatterns.some(pattern => pattern.test(content));
}

/**
 * Extrait la requête utilisateur des messages
 */
function extractUserRequest(messages: Messages): string {
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return '';

  // Prendre le dernier message utilisateur
  const lastMessage = userMessages[userMessages.length - 1];
  return typeof lastMessage.content === 'string'
    ? lastMessage.content
    : lastMessage.content.map(c => c.type === 'text' ? c.text : '').join(' ');
}

/**
 * Génère et injecte le Design Context dans le system prompt
 */
function injectDesignContext(systemPrompt: string, messages: Messages): { prompt: string; designContext?: DesignContext } {
  if (!isUIRequest(messages)) {
    return { prompt: systemPrompt };
  }

  const userRequest = extractUserRequest(messages);
  const designContext = createDesignContext(userRequest);

  const enrichedPrompt = `${systemPrompt}

${designContext.coderInstructions}

## CSS Variables Générées (à inclure dans le projet)
\`\`\`css
${designContext.cssVariables}
\`\`\`

⚠️ **DESIGN CONTEXT ACTIF**: Utiliser OBLIGATOIREMENT les couleurs et styles définis ci-dessus.
Ne PAS utiliser les couleurs par défaut de Tailwind (blue-500, indigo-600, etc.).
Utiliser var(--color-primary), var(--color-secondary), etc.
`;

  return { prompt: enrichedPrompt, designContext };
}

export function streamText(messages: Messages, env: Env, options?: StreamingOptions) {
  // Convert our Message format to the format expected by streamText
  const modelMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // Build system prompt with web search status if enabled
  let systemPrompt = getSystemPrompt();

  const webSearchEnabled = options?.enableWebSearch !== false && isWebSearchAvailable(env);

  if (webSearchEnabled) {
    systemPrompt += '\n' + getWebSearchStatus(env);
  }

  // 🎨 DESIGN CONTEXT INJECTION (sauf si explicitement désactivé)
  if (!options?.disableDesignContext) {
    const { prompt: enrichedPrompt } = injectDesignContext(systemPrompt, messages);
    systemPrompt = enrichedPrompt;
  }

  // Create tools if web search is enabled and available
  const tools = webSearchEnabled ? (createWebSearchTools(env.TAVILY_API_KEY) as ToolSet) : undefined;

  // Configure stop condition for tool loops (allow up to 5 steps when tools are available)
  const stopWhen = tools ? stepCountIs(5) : stepCountIs(1);

  // Use type assertion for the streamText call to avoid generic inference issues
  return _streamText({
    model: getAnthropicModel(getAPIKey(env)),
    system: systemPrompt,
    maxOutputTokens: MAX_TOKENS,
    messages: modelMessages,
    tools,
    stopWhen,
    onFinish: options?.onFinish as Parameters<typeof _streamText>[0]['onFinish'],
    onChunk: options?.onChunk as Parameters<typeof _streamText>[0]['onChunk'],
    abortSignal: options?.abortSignal,
    toolChoice: options?.toolChoice as Parameters<typeof _streamText>[0]['toolChoice'],
  });
}

/**
 * Stream text without tools (for simple responses)
 */
export function streamTextSimple(messages: Messages, env: Env, options?: Omit<StreamingOptions, 'enableWebSearch'>) {
  return streamText(messages, env, { ...options, enableWebSearch: false });
}

/**
 * Check if web search is available in the environment
 */
export { isWebSearchAvailable } from './web-search';
```

**Temps estimé**: 2-3 heures
**Complexité**: Élevée
**Impact**: Critique - affecte TOUS les modes de fonctionnement

---

### Étape 3.3: Intégration avec le Coder Agent (Multi-Agent)

> **📝 Note**: Cette étape est complémentaire à l'étape 3.2.
> Elle permet au Coder Agent (en mode multi-agent) d'avoir des instructions encore plus détaillées.

**Fichier**: `app/lib/agents/prompts/coder-prompt.ts` (modification)

```typescript
// Ajouter au début du fichier coder-prompt.ts

import { createDesignContext } from '~/lib/design/design-context-builder';

/**
 * Enrichit le prompt du coder avec le contexte de design
 * NOTE: Utilisé en mode multi-agent uniquement
 * Le mode single-agent est géré par stream-text.ts
 */
export function enrichPromptWithDesign(userRequest: string, basePrompt: string): string {
  // Détecter si c'est une requête UI
  const isUIRequest = /site|page|app|application|dashboard|interface|ui|design|boutique|portfolio|landing/i.test(userRequest);

  if (!isUIRequest) {
    return basePrompt;
  }

  // Générer le contexte de design
  const designContext = createDesignContext(userRequest);

  // Injecter dans le prompt
  return `
${basePrompt}

${designContext.coderInstructions}

## CSS Variables à Injecter
\`\`\`css
${designContext.cssVariables}
\`\`\`

⚠️ IMPORTANT: Utiliser les couleurs et styles définis ci-dessus. Ne PAS utiliser les couleurs par défaut de Tailwind.
`;
}
```

**Temps estimé**: 1-2 heures
**Complexité**: Moyenne

---

### Étape 3.4: Injection CSS dans le Build

**Fichier**: `app/lib/runtime/adapters/browser-build-adapter.ts` (modification)

Modifier la méthode `injectBundle` pour injecter les CSS variables du design context:

```typescript
// Dans browser-build-adapter.ts, modifier la génération du HTML

private injectBundle(html: string, code: string, css: string, designContext?: DesignContext): string {
  // Si un design context existe, utiliser ses CSS variables
  const cssVariables = designContext?.cssVariables || DEFAULT_BAVINI_CSS_VARIABLES;

  const baseStyles = `
<style>
${cssVariables}

/* Base styles */
body {
  font-family: var(--font-body, system-ui, sans-serif);
  background: var(--color-background, #fafbfc);
  color: var(--color-text, #1a1f36);
  -webkit-font-smoothing: antialiased;
}
</style>`;

  // ... reste du code
}
```

**Temps estimé**: 1-2 heures
**Complexité**: Moyenne

---

## Phase 4: Tests et Validation

### Étape 4.1: Tests Unitaires

**Fichier**: `app/lib/design/__tests__/design-context.spec.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createDesignContext } from '../design-context-builder';
import { analyzeProjectRequest } from '../style-analyzer';
import { generateUniquePalette } from '../palette-generator';

describe('Design Context System', () => {
  describe('analyzeProjectRequest', () => {
    it('should detect e-commerce project type', () => {
      const analysis = analyzeProjectRequest('Crée-moi une boutique en ligne');
      expect(analysis.projectType).toBe('ecommerce');
    });

    it('should detect SaaS project type', () => {
      const analysis = analyzeProjectRequest('Je veux un dashboard pour mon application SaaS');
      expect(analysis.projectType).toBe('saas');
    });

    it('should detect elegant mood from keywords', () => {
      const analysis = analyzeProjectRequest('Un site luxe et raffiné pour bijoux');
      expect(analysis.characteristics.isPremium).toBe(true);
    });
  });

  describe('generateUniquePalette', () => {
    it('should generate different palettes for different requests', () => {
      const context1 = createDesignContext('Site e-commerce de café');
      const context2 = createDesignContext('Dashboard tech moderne');

      expect(context1.palette.primary).not.toBe(context2.palette.primary);
    });

    it('should generate valid hex colors', () => {
      const context = createDesignContext('Portfolio créatif');
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;

      expect(context.palette.primary).toMatch(hexRegex);
      expect(context.palette.secondary).toMatch(hexRegex);
      expect(context.palette.accent).toMatch(hexRegex);
    });
  });

  describe('createDesignContext', () => {
    it('should generate complete design context', () => {
      const context = createDesignContext('Crée un site de restaurant français');

      expect(context.id).toBeDefined();
      expect(context.palette).toBeDefined();
      expect(context.typography).toBeDefined();
      expect(context.spacing).toBeDefined();
      expect(context.effects).toBeDefined();
      expect(context.cssVariables).toBeDefined();
      expect(context.coderInstructions).toBeDefined();
    });

    it('should include CSS variables in output', () => {
      const context = createDesignContext('Landing page SaaS');

      expect(context.cssVariables).toContain('--color-primary');
      expect(context.cssVariables).toContain('--font-heading');
      expect(context.cssVariables).toContain('--radius-lg');
    });
  });
});
```

**Temps estimé**: 2-3 heures
**Complexité**: Moyenne

---

## Résumé du Plan

### Fichiers à Créer (7 nouveaux fichiers)

| # | Fichier | Description | Complexité |
|---|---------|-------------|------------|
| 1 | `app/lib/design/types.ts` | Types et interfaces | Moyenne |
| 2 | `app/lib/design/style-analyzer.ts` | Analyse des requêtes | Moyenne-Élevée |
| 3 | `app/lib/design/palette-generator.ts` | Génération de palettes | Élevée |
| 4 | `app/lib/design/typography-selector.ts` | Sélection typographie | Moyenne |
| 5 | `app/lib/design/spacing-effects.ts` | Spacing et effets | Moyenne |
| 6 | `app/lib/design/design-context-builder.ts` | Assembleur principal | Élevée |
| 7 | `app/lib/design/__tests__/design-context.spec.ts` | Tests | Moyenne |

### Fichiers à Modifier (3 fichiers)

| # | Fichier | Modification | Mode |
|---|---------|--------------|------|
| 1 | `app/lib/.server/llm/stream-text.ts` | **Intégration universelle** Design Context | ✅ TOUS |
| 2 | `app/lib/agents/prompts/coder-prompt.ts` | Enrichissement complémentaire pour coder | Multi-Agent |
| 3 | `app/lib/runtime/adapters/browser-build-adapter.ts` | Injecter CSS variables dans le build | ✅ TOUS |

> **⚠️ CRITIQUE**: `stream-text.ts` est LE point d'intégration principal.
> Il garantit que le Design Context fonctionne en mode Single-Agent ET Multi-Agent.

### Ordre d'Implémentation

```
Phase 1 (Fondations)
├── 1.1 types.ts ─────────────────▶ [2h]
├── 1.2 style-analyzer.ts ────────▶ [3h]
└── 1.3 palette-generator.ts ─────▶ [4h]

Phase 2 (Typography & Spacing)
├── 2.1 typography-selector.ts ───▶ [3h]
└── 2.2 spacing-effects.ts ───────▶ [2h]

Phase 3 (Assemblage & Intégration)
├── 3.1 design-context-builder.ts ▶ [4h]
├── 3.2 stream-text.ts (CRITIQUE) ▶ [3h]  ← Intégration universelle
├── 3.3 coder-prompt.ts (modif) ──▶ [2h]  ← Complémentaire multi-agent
└── 3.4 browser-build-adapter.ts ─▶ [2h]

Phase 4 (Tests)
└── 4.1 design-context.spec.ts ───▶ [3h]

TOTAL ESTIMÉ: ~28 heures de développement
```

### Points d'Intégration Vérifiés

| Point | Fichier | Ligne | Fonction | Mode |
|-------|---------|-------|----------|------|
| **Principal** | `stream-text.ts` | 29 | `let systemPrompt = getSystemPrompt();` | Single + Multi |
| Complémentaire | `coder-prompt.ts` | - | `enrichPromptWithDesign()` | Multi seulement |
| CSS Injection | `browser-build-adapter.ts` | - | `injectBundle()` | Single + Multi |

---

## Résultat Attendu

### Avant (Actuel)
```
Utilisateur: "Crée un site e-commerce de café"
↓
Même palette indigo/violet
Même typographie
Même style à chaque fois
```

### Après (Avec Design Context)
```
Utilisateur: "Crée un site e-commerce de café"
↓
Analyse: E-commerce + Food & Beverage + Artisanal
↓
Palette générée:
  - Primary: #5D4037 (marron café)
  - Secondary: #8D6E63 (latte)
  - Accent: #FFAB40 (orange chaud)
  - Background: #FFF8E1 (crème)
↓
Typography: Playfair Display + Source Sans Pro
↓
Style: Organic, rounded, warm shadows
↓
CODE UNIQUE GÉNÉRÉ
```

---

## Prochaine Étape

**En attente de ton approbation pour commencer l'implémentation.**

Questions:
1. Le plan te convient-il?
2. Veux-tu que je commence par Phase 1?
3. Y a-t-il des ajustements à faire?
