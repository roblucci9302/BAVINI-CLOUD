/**
 * Animation Presets pour BAVINI
 *
 * Collection d'animations Framer Motion et CSS prêtes à l'emploi
 * Pour créer des interfaces dynamiques et engageantes
 *
 * @module agents/design/animation-presets
 */

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface AnimationPreset {
  /** Nom de l'animation */
  name: string;

  /** Description */
  description: string;

  /** Type d'animation */
  type: 'framer-motion' | 'css' | 'both';

  /** Code Framer Motion (si applicable) */
  framerMotion?: FramerMotionConfig;

  /** Code CSS (si applicable) */
  css?: string;

  /** Usage recommandé */
  usage: string[];
}

export interface FramerMotionConfig {
  /** Variantes */
  variants?: Record<string, unknown>;

  /** Props initial */
  initial?: unknown;

  /** Props animate */
  animate?: unknown;

  /** Props exit */
  exit?: unknown;

  /** Props transition */
  transition?: unknown;

  /** Props whileHover */
  whileHover?: unknown;

  /** Props whileTap */
  whileTap?: unknown;

  /** Props whileInView */
  whileInView?: unknown;

  /** Viewport config */
  viewport?: unknown;
}

/*
 * ============================================================================
 * ANIMATIONS D'ENTRÉE
 * ============================================================================
 */

export const fadeInUp: AnimationPreset = {
  name: 'fadeInUp',
  description: 'Apparition avec fade et mouvement vers le haut',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  usage: ['Textes', 'Cards', 'Sections au scroll'],
};

export const fadeInDown: AnimationPreset = {
  name: 'fadeInDown',
  description: 'Apparition avec fade et mouvement vers le bas',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  usage: ['Dropdowns', 'Notifications', 'Headers'],
};

export const fadeInLeft: AnimationPreset = {
  name: 'fadeInLeft',
  description: 'Apparition depuis la gauche',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, x: -30 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  usage: ['Sidebars', 'Menus', 'Listes'],
};

export const fadeInRight: AnimationPreset = {
  name: 'fadeInRight',
  description: 'Apparition depuis la droite',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  usage: ['Panels', 'Drawers', 'Détails'],
};

export const scaleIn: AnimationPreset = {
  name: 'scaleIn',
  description: 'Apparition avec effet de scale',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
  usage: ['Modals', 'Popups', 'Cards hover'],
};

export const blurIn: AnimationPreset = {
  name: 'blurIn',
  description: 'Apparition avec effet de blur',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, filter: 'blur(10px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
    transition: { duration: 0.5 },
  },
  usage: ['Images', 'Backgrounds', 'Hero sections'],
};

/*
 * ============================================================================
 * ANIMATIONS DE SCROLL
 * ============================================================================
 */

export const scrollRevealUp: AnimationPreset = {
  name: 'scrollRevealUp',
  description: 'Révélation au scroll avec mouvement vers le haut',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, y: 50 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-100px' },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
  usage: ['Sections', 'Features', 'Testimonials'],
};

export const scrollRevealStagger: AnimationPreset = {
  name: 'scrollRevealStagger',
  description: 'Révélation en cascade pour listes',
  type: 'framer-motion',
  framerMotion: {
    variants: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: 0.1,
        },
      },
    },
    initial: 'hidden',
    whileInView: 'visible',
    viewport: { once: true },
  },
  usage: ['Grilles', 'Listes de features', 'Galleries'],
};

export const parallaxScroll: AnimationPreset = {
  name: 'parallaxScroll',
  description: 'Effet parallax au scroll',
  type: 'css',
  css: `.parallax {
  transform: translateZ(0);
  will-change: transform;
}

.parallax-slow {
  transform: translateY(calc(var(--scroll-y) * 0.3));
}

.parallax-medium {
  transform: translateY(calc(var(--scroll-y) * 0.5));
}

.parallax-fast {
  transform: translateY(calc(var(--scroll-y) * 0.7));
}`,
  usage: ['Hero backgrounds', 'Images décoratives', 'Sections visuelles'],
};

/*
 * ============================================================================
 * ANIMATIONS HOVER
 * ============================================================================
 */

export const hoverLift: AnimationPreset = {
  name: 'hoverLift',
  description: 'Effet de lévitation au hover',
  type: 'framer-motion',
  framerMotion: {
    whileHover: {
      y: -8,
      transition: { duration: 0.3, ease: 'easeOut' },
    },
  },
  usage: ['Cards', 'Boutons', 'Images'],
};

export const hoverScale: AnimationPreset = {
  name: 'hoverScale',
  description: 'Agrandissement subtil au hover',
  type: 'framer-motion',
  framerMotion: {
    whileHover: {
      scale: 1.02,
      transition: { duration: 0.2 },
    },
    whileTap: {
      scale: 0.98,
    },
  },
  usage: ['Boutons', 'Cards cliquables', 'Images'],
};

export const hoverGlow: AnimationPreset = {
  name: 'hoverGlow',
  description: 'Effet glow au hover',
  type: 'css',
  css: `.hover-glow {
  transition: box-shadow 0.3s ease;
}

.hover-glow:hover {
  box-shadow: 0 0 30px rgba(139, 92, 246, 0.4),
              0 0 60px rgba(139, 92, 246, 0.2);
}

.hover-glow-cyan:hover {
  box-shadow: 0 0 30px rgba(6, 182, 212, 0.4),
              0 0 60px rgba(6, 182, 212, 0.2);
}

.hover-glow-pink:hover {
  box-shadow: 0 0 30px rgba(236, 72, 153, 0.4),
              0 0 60px rgba(236, 72, 153, 0.2);
}`,
  usage: ['Boutons CTA', 'Cards featured', 'Icônes'],
};

export const hoverShine: AnimationPreset = {
  name: 'hoverShine',
  description: 'Effet shine/reflet au hover',
  type: 'css',
  css: `.hover-shine {
  position: relative;
  overflow: hidden;
}

.hover-shine::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.5s ease;
}

.hover-shine:hover::before {
  left: 100%;
}`,
  usage: ['Boutons', 'Cards premium', 'Images produits'],
};

/*
 * ============================================================================
 * ANIMATIONS CONTINUES
 * ============================================================================
 */

export const pulse: AnimationPreset = {
  name: 'pulse',
  description: 'Pulsation subtile continue',
  type: 'css',
  css: `@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}

.animate-pulse-slow {
  animation: pulse 3s ease-in-out infinite;
}`,
  usage: ['Indicateurs de statut', 'Notifications', 'Loading states'],
};

export const float: AnimationPreset = {
  name: 'float',
  description: 'Flottement doux continu',
  type: 'css',
  css: `@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

.animate-float-slow {
  animation: float 5s ease-in-out infinite;
}`,
  usage: ['Illustrations', 'Icônes hero', 'Éléments décoratifs'],
};

export const shimmer: AnimationPreset = {
  name: 'shimmer',
  description: 'Effet shimmer pour loading',
  type: 'css',
  css: `@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton {
  background: linear-gradient(
    90deg,
    #1e293b 0%,
    #334155 50%,
    #1e293b 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}`,
  usage: ['Skeletons', 'Loading placeholders', 'Boutons premium'],
};

export const gradientShift: AnimationPreset = {
  name: 'gradientShift',
  description: 'Gradient animé continu',
  type: 'css',
  css: `@keyframes gradient-shift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.animate-gradient {
  background-size: 200% 200%;
  animation: gradient-shift 3s ease infinite;
}

.gradient-text-animated {
  background: linear-gradient(
    90deg,
    #8B5CF6,
    #EC4899,
    #06B6D4,
    #8B5CF6
  );
  background-size: 200% auto;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-shift 3s linear infinite;
}`,
  usage: ['Textes hero', 'Backgrounds', 'Bordures animées'],
};

export const rotate: AnimationPreset = {
  name: 'rotate',
  description: 'Rotation continue',
  type: 'css',
  css: `@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: rotate 1s linear infinite;
}

.animate-spin-slow {
  animation: rotate 3s linear infinite;
}`,
  usage: ['Loading spinners', 'Icônes', 'Éléments décoratifs'],
};

/*
 * ============================================================================
 * ANIMATIONS DE TRANSITION
 * ============================================================================
 */

export const pageTransition: AnimationPreset = {
  name: 'pageTransition',
  description: 'Transition entre pages',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.3 },
  },
  usage: ['Transitions de routes', 'Changements de vue'],
};

export const slideOverlay: AnimationPreset = {
  name: 'slideOverlay',
  description: 'Overlay qui slide',
  type: 'framer-motion',
  framerMotion: {
    variants: {
      closed: { x: '100%' },
      open: { x: 0 },
    },
    initial: 'closed',
    animate: 'open',
    exit: 'closed',
    transition: { type: 'spring', damping: 30, stiffness: 300 },
  },
  usage: ['Drawers', 'Panels latéraux', 'Mobile menus'],
};

export const modalTransition: AnimationPreset = {
  name: 'modalTransition',
  description: 'Animation pour modals',
  type: 'framer-motion',
  framerMotion: {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  },
  usage: ['Modals', 'Dialogs', 'Popups'],
};

/*
 * ============================================================================
 * EASING FUNCTIONS
 * ============================================================================
 */

export const EASING = {
  /** Standard ease out - le plus utilisé */
  easeOut: [0.22, 1, 0.36, 1],

  /** Ease in out doux */
  easeInOut: [0.4, 0, 0.2, 1],

  /** Bounce subtil */
  bounce: [0.68, -0.55, 0.265, 1.55],

  /** Très rapide au début */
  easeOutExpo: [0.16, 1, 0.3, 1],

  /** Linéaire */
  linear: [0, 0, 1, 1],

  /** Spring-like */
  spring: { type: 'spring', damping: 20, stiffness: 300 },
};

/*
 * ============================================================================
 * EXPORT & HELPERS
 * ============================================================================
 */

export const ANIMATION_PRESETS: AnimationPreset[] = [
  // Entrée
  fadeInUp,
  fadeInDown,
  fadeInLeft,
  fadeInRight,
  scaleIn,
  blurIn,

  // Scroll
  scrollRevealUp,
  scrollRevealStagger,
  parallaxScroll,

  // Hover
  hoverLift,
  hoverScale,
  hoverGlow,
  hoverShine,

  // Continues
  pulse,
  float,
  shimmer,
  gradientShift,
  rotate,

  // Transitions
  pageTransition,
  slideOverlay,
  modalTransition,
];

/**
 * Obtenir une animation par nom
 */
export function getAnimationByName(name: string): AnimationPreset | undefined {
  return ANIMATION_PRESETS.find((a) => a.name.toLowerCase() === name.toLowerCase());
}

/**
 * Obtenir les animations d'un type
 */
export function getAnimationsByType(type: 'framer-motion' | 'css' | 'both'): AnimationPreset[] {
  return ANIMATION_PRESETS.filter((a) => a.type === type || a.type === 'both');
}

/**
 * Générer tout le CSS des animations
 */
export function generateAllAnimationCSS(): string {
  const cssAnimations = ANIMATION_PRESETS.filter((a) => a.css);
  return cssAnimations.map((a) => `/* ${a.name} */\n${a.css}`).join('\n\n');
}

/**
 * Formater les animations pour un prompt
 */
export function formatAnimationsForPrompt(): string {
  const lines: string[] = [
    '# Animations Disponibles',
    '',
    'Utilise ces animations pour créer des interfaces dynamiques.',
    '',
    '## Animations Framer Motion',
    '',
  ];

  const framerAnimations = ANIMATION_PRESETS.filter((a) => a.type === 'framer-motion' || a.type === 'both');
  for (const anim of framerAnimations) {
    lines.push(`### ${anim.name}`);
    lines.push(anim.description);
    lines.push(`Usage: ${anim.usage.join(', ')}`);
    lines.push('');
  }

  lines.push('## Animations CSS');
  lines.push('');

  const cssAnimations = ANIMATION_PRESETS.filter((a) => a.type === 'css' || a.type === 'both');
  for (const anim of cssAnimations) {
    lines.push(`### ${anim.name}`);
    lines.push(anim.description);
    lines.push(`Usage: ${anim.usage.join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}
