/**
 * BAVINI Design System - Composants Modernes
 *
 * Collection de composants React/Tailwind uniques pour BAVINI
 * Style: Moderne, épuré, avec animations Framer Motion
 *
 * ⚠️ Ces composants utilisent HTML natif + Tailwind CSS uniquement
 * ⚠️ PAS de bibliothèques UI externes (Shadcn, Radix, etc.)
 *
 * @module agents/design/modern-components
 */

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface ComponentSnippet {
  /** Nom du composant */
  name: string;

  /** Description */
  description: string;

  /** Catégorie */
  category: ComponentCategory;

  /** Tags pour recherche */
  tags: string[];

  /** Code React/TSX */
  code: string;

  /** CSS/Tailwind requis */
  styles?: string;

  /** Dépendances npm */
  dependencies?: string[];

  /** Preview URL (optionnel) */
  preview?: string;
}

export type ComponentCategory =
  | 'hero'
  | 'navigation'
  | 'cards'
  | 'buttons'
  | 'forms'
  | 'sections'
  | 'features'
  | 'testimonials'
  | 'pricing'
  | 'footer'
  | 'animations'
  | 'effects'
  | 'layouts';

/*
 * ============================================================================
 * HERO SECTIONS
 * ============================================================================
 */

const heroGradientAnimated: ComponentSnippet = {
  name: 'HeroGradientAnimated',
  description: 'Hero section avec gradient animé et effet de particules subtil',
  category: 'hero',
  tags: ['hero', 'gradient', 'animation', 'landing', 'modern'],
  dependencies: ['framer-motion'],
  code: `import { motion } from 'framer-motion';

export function HeroGradientAnimated() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-transparent to-cyan-600/20" />
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/30 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-sm text-white/80 mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Nouveau: Version 2.0 disponible
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight"
        >
          Créez des expériences
          <span className="block bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            exceptionnelles
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto"
        >
          La plateforme tout-en-un pour construire, déployer et scaler vos applications modernes.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <button className="px-8 py-4 bg-white text-slate-900 rounded-xl font-semibold hover:bg-slate-100 transition-all hover:scale-105 shadow-lg shadow-white/25">
            Commencer gratuitement
          </button>
          <button className="px-8 py-4 bg-white/10 text-white rounded-xl font-semibold backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all">
            Voir la démo →
          </button>
        </motion.div>
      </div>
    </section>
  );
}`,
  styles: `@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
.animate-pulse { animation: pulse 4s ease-in-out infinite; }
.delay-1000 { animation-delay: 1s; }`,
};

const heroBentoGrid: ComponentSnippet = {
  name: 'HeroBentoGrid',
  description: 'Hero section avec bento grid style Apple',
  category: 'hero',
  tags: ['hero', 'bento', 'grid', 'apple', 'modern'],
  dependencies: ['framer-motion'],
  code: `import { motion } from 'framer-motion';

export function HeroBentoGrid() {
  return (
    <section className="min-h-screen bg-black text-white py-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-6xl md:text-8xl font-bold mb-6">
            Design.
            <span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent"> Build.</span>
            <span className="text-zinc-500"> Ship.</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
            Tout ce dont vous avez besoin pour créer des produits incroyables.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-4 grid-rows-3 gap-4 h-[600px]">
          {/* Large card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="col-span-2 row-span-2 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-3xl p-8 flex flex-col justify-end"
          >
            <h3 className="text-3xl font-bold mb-2">Analytics puissants</h3>
            <p className="text-white/70">Visualisez vos données en temps réel</p>
          </motion.div>

          {/* Top right cards */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-zinc-900 rounded-3xl p-6 flex items-center justify-center border border-zinc-800"
          >
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-400">99.9%</div>
              <div className="text-zinc-500 text-sm">Uptime</div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-6"
          >
            <div className="text-5xl mb-2">⚡</div>
            <div className="font-semibold">Ultra rapide</div>
          </motion.div>

          {/* Middle right */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="col-span-2 bg-zinc-900 rounded-3xl p-6 border border-zinc-800 flex items-center gap-6"
          >
            <div className="flex -space-x-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-violet-400 border-2 border-zinc-900" />
              ))}
            </div>
            <div>
              <div className="font-semibold">+10,000 utilisateurs</div>
              <div className="text-zinc-500 text-sm">nous font confiance</div>
            </div>
          </motion.div>

          {/* Bottom row */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-3xl p-6"
          >
            <div className="text-4xl mb-2">🔒</div>
            <div className="font-semibold">Sécurisé</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="col-span-2 bg-zinc-900 rounded-3xl p-6 border border-zinc-800"
          >
            <pre className="text-sm text-emerald-400 font-mono">
              npm install @bavini/ui
            </pre>
            <p className="text-zinc-500 text-sm mt-2">Installation en une ligne</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
            className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-3xl p-6 flex items-center justify-center"
          >
            <div className="text-4xl">❤️</div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}`,
};

/*
 * ============================================================================
 * CARDS
 * ============================================================================
 */

const cardGlass: ComponentSnippet = {
  name: 'CardGlass',
  description: 'Card avec effet glassmorphism moderne',
  category: 'cards',
  tags: ['card', 'glass', 'glassmorphism', 'blur', 'modern'],
  code: `export function CardGlass({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="group relative">
      {/* Glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500" />

      {/* Card */}
      <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-2xl p-8 border border-white/10">
        <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-pink-500 rounded-xl flex items-center justify-center text-2xl mb-6">
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
        <p className="text-slate-400 leading-relaxed">{description}</p>

        {/* Hover arrow */}
        <div className="mt-6 flex items-center text-violet-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          En savoir plus
          <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}`,
};

const cardSpotlight: ComponentSnippet = {
  name: 'CardSpotlight',
  description: 'Card avec effet spotlight au hover',
  category: 'cards',
  tags: ['card', 'spotlight', 'hover', 'interactive', 'modern'],
  dependencies: ['framer-motion'],
  code: `import { useState } from 'react';
import { motion } from 'framer-motion';

export function CardSpotlight({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      className="relative bg-slate-900 rounded-2xl p-8 overflow-hidden border border-slate-800"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {/* Spotlight effect */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: \`radial-gradient(400px circle at \${mousePosition.x}px \${mousePosition.y}px, rgba(139, 92, 246, 0.15), transparent 40%)\`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
        <p className="text-slate-400 mb-4">{description}</p>
        {children}
      </div>
    </motion.div>
  );
}`,
};

const cardHoverLift: ComponentSnippet = {
  name: 'CardHoverLift',
  description: 'Card avec effet de levitation au hover',
  category: 'cards',
  tags: ['card', 'hover', 'lift', '3d', 'shadow'],
  code: `export function CardHoverLift({ title, description, image }: { title: string; description: string; image: string }) {
  return (
    <div className="group cursor-pointer">
      <div className="relative bg-white rounded-2xl overflow-hidden transition-all duration-500 ease-out group-hover:-translate-y-2 group-hover:shadow-2xl group-hover:shadow-violet-500/25">
        {/* Image */}
        <div className="aspect-video overflow-hidden">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2 group-hover:text-violet-600 transition-colors">
            {title}
          </h3>
          <p className="text-slate-600 text-sm">{description}</p>
        </div>

        {/* Bottom gradient bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-pink-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
      </div>
    </div>
  );
}`,
};

/*
 * ============================================================================
 * BUTTONS
 * ============================================================================
 */

const buttonShimmer: ComponentSnippet = {
  name: 'ButtonShimmer',
  description: 'Bouton avec effet shimmer animé',
  category: 'buttons',
  tags: ['button', 'shimmer', 'animation', 'cta', 'gradient'],
  code: `export function ButtonShimmer({ children }: { children: React.ReactNode }) {
  return (
    <button className="relative inline-flex items-center justify-center px-8 py-4 font-semibold text-white rounded-xl overflow-hidden group">
      {/* Background */}
      <span className="absolute inset-0 bg-gradient-to-r from-violet-600 via-pink-600 to-violet-600 bg-[length:200%_100%] animate-shimmer" />

      {/* Shine effect */}
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

      {/* Content */}
      <span className="relative flex items-center gap-2">
        {children}
      </span>
    </button>
  );
}`,
  styles: `@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.animate-shimmer { animation: shimmer 3s ease-in-out infinite; }`,
};

const buttonMagnetic: ComponentSnippet = {
  name: 'ButtonMagnetic',
  description: 'Bouton avec effet magnétique au hover',
  category: 'buttons',
  tags: ['button', 'magnetic', 'interactive', 'animation'],
  dependencies: ['framer-motion'],
  code: `import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

export function ButtonMagnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouse = (e: React.MouseEvent<HTMLButtonElement>) => {
    const { clientX, clientY } = e;
    const { left, top, width, height } = ref.current!.getBoundingClientRect();
    const x = (clientX - left - width / 2) * 0.3;
    const y = (clientY - top - height / 2) * 0.3;
    setPosition({ x, y });
  };

  const reset = () => setPosition({ x: 0, y: 0 });

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      className="relative px-8 py-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors"
    >
      <motion.span
        animate={{ x: position.x * 0.5, y: position.y * 0.5 }}
        transition={{ type: 'spring', stiffness: 150, damping: 15 }}
        className="relative block"
      >
        {children}
      </motion.span>
    </motion.button>
  );
}`,
};

const buttonGlow: ComponentSnippet = {
  name: 'ButtonGlow',
  description: 'Bouton avec effet glow néon',
  category: 'buttons',
  tags: ['button', 'glow', 'neon', 'cyberpunk', 'modern'],
  code: `export function ButtonGlow({ children, color = 'violet' }: { children: React.ReactNode; color?: 'violet' | 'cyan' | 'pink' }) {
  const colors = {
    violet: 'from-violet-600 to-violet-400 shadow-violet-500/50 hover:shadow-violet-500/75',
    cyan: 'from-cyan-600 to-cyan-400 shadow-cyan-500/50 hover:shadow-cyan-500/75',
    pink: 'from-pink-600 to-pink-400 shadow-pink-500/50 hover:shadow-pink-500/75',
  };

  return (
    <button className={\`relative px-8 py-4 bg-gradient-to-r \${colors[color]} text-white font-semibold rounded-xl shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl\`}>
      {children}
    </button>
  );
}`,
};

/*
 * ============================================================================
 * NAVIGATION
 * ============================================================================
 */

const navbarFloating: ComponentSnippet = {
  name: 'NavbarFloating',
  description: 'Navbar flottante avec blur et animations',
  category: 'navigation',
  tags: ['navbar', 'navigation', 'floating', 'blur', 'sticky'],
  dependencies: ['framer-motion'],
  code: `import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function NavbarFloating() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4"
    >
      <div className={\`flex items-center justify-between px-6 py-4 rounded-2xl transition-all duration-300 \${
        scrolled
          ? 'bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-black/20 border border-white/10'
          : 'bg-transparent'
      }\`}>
        {/* Logo */}
        <a href="/" className="text-xl font-bold text-white">
          Brand<span className="text-violet-400">.</span>
        </a>

        {/* Links */}
        <div className="hidden md:flex items-center gap-8">
          {['Produits', 'Solutions', 'Tarifs', 'Blog'].map((link) => (
            <a
              key={link}
              href="#"
              className="text-sm text-slate-300 hover:text-white transition-colors relative group"
            >
              {link}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-violet-400 group-hover:w-full transition-all duration-300" />
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-4">
          <button className="text-sm text-slate-300 hover:text-white transition-colors">
            Connexion
          </button>
          <button className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors">
            Démarrer
          </button>
        </div>
      </div>
    </motion.nav>
  );
}`,
};

/*
 * ============================================================================
 * FEATURES SECTIONS
 * ============================================================================
 */

const featuresGrid: ComponentSnippet = {
  name: 'FeaturesGrid',
  description: 'Section features avec grid et icônes',
  category: 'features',
  tags: ['features', 'grid', 'icons', 'section'],
  dependencies: ['framer-motion'],
  code: `import { motion } from 'framer-motion';

const features = [
  { icon: '⚡', title: 'Ultra rapide', description: 'Performance optimisée pour une expérience fluide' },
  { icon: '🔒', title: 'Sécurisé', description: 'Chiffrement de bout en bout pour vos données' },
  { icon: '🎨', title: 'Personnalisable', description: 'Adaptez chaque aspect à votre marque' },
  { icon: '📱', title: 'Responsive', description: 'Parfait sur tous les appareils' },
  { icon: '🔄', title: 'Sync temps réel', description: 'Collaboration instantanée' },
  { icon: '📊', title: 'Analytics', description: 'Insights détaillés sur vos performances' },
];

export function FeaturesGrid() {
  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-white mb-4">
            Tout ce dont vous avez besoin
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Des outils puissants pour créer, gérer et faire grandir votre projet.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group p-6 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-violet-500/50 transition-all duration-300 hover:bg-slate-900"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-violet-500/20 to-pink-500/20 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}`,
};

/*
 * ============================================================================
 * TESTIMONIALS
 * ============================================================================
 */

const testimonialCarousel: ComponentSnippet = {
  name: 'TestimonialCarousel',
  description: 'Carousel de témoignages avec design moderne',
  category: 'testimonials',
  tags: ['testimonials', 'carousel', 'social-proof', 'reviews'],
  dependencies: ['framer-motion'],
  code: `import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Note: Remplacez les avatars par vos propres images ou utilisez des initiales
const testimonials = [
  {
    quote: "Ce produit a complètement transformé notre façon de travailler. L'interface est intuitive et les résultats sont impressionnants.",
    author: "Marie Dupont",
    role: "CEO, TechCorp",
    avatar: "", // Remplacer par l'URL de votre image ou utiliser les initiales
    initials: "MD"
  },
  {
    quote: "Le meilleur investissement que nous ayons fait cette année. Le ROI est incroyable.",
    author: "Jean Martin",
    role: "CTO, StartupXYZ",
    avatar: "", // Remplacer par l'URL de votre image ou utiliser les initiales
    initials: "JM"
  },
  {
    quote: "Support client exceptionnel et fonctionnalités qui dépassent toutes nos attentes.",
    author: "Sophie Laurent",
    role: "Product Manager, BigCo",
    avatar: "", // Remplacer par l'URL de votre image ou utiliser les initiales
    initials: "SL"
  },
];

export function TestimonialCarousel() {
  const [current, setCurrent] = useState(0);

  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-white text-center mb-16">
          Ce que nos clients disent
        </h2>

        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              {/* Quote */}
              <p className="text-2xl md:text-3xl text-white font-light leading-relaxed mb-8">
                "{testimonials[current].quote}"
              </p>

              {/* Author */}
              <div className="flex items-center justify-center gap-4">
                {testimonials[current].avatar ? (
                  <img
                    src={testimonials[current].avatar}
                    alt={testimonials[current].author}
                    className="w-14 h-14 rounded-full border-2 border-violet-500"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full border-2 border-violet-500 bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
                    {testimonials[current].initials}
                  </div>
                )}
                <div className="text-left">
                  <div className="font-semibold text-white">{testimonials[current].author}</div>
                  <div className="text-slate-400 text-sm">{testimonials[current].role}</div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-10">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrent(index)}
                className={\`w-2.5 h-2.5 rounded-full transition-all duration-300 \${
                  index === current ? 'bg-violet-500 w-8' : 'bg-slate-600 hover:bg-slate-500'
                }\`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}`,
};

/*
 * ============================================================================
 * PRICING
 * ============================================================================
 */

const pricingCards: ComponentSnippet = {
  name: 'PricingCards',
  description: 'Section pricing avec 3 tiers et highlighting',
  category: 'pricing',
  tags: ['pricing', 'cards', 'plans', 'subscription'],
  dependencies: ['framer-motion'],
  code: `import { motion } from 'framer-motion';

const plans = [
  {
    name: 'Starter',
    price: '0',
    description: 'Parfait pour commencer',
    features: ['5 projets', '1 Go de stockage', 'Support email', 'Analytics basiques'],
    cta: 'Commencer gratuitement',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '29',
    description: 'Pour les équipes en croissance',
    features: ['Projets illimités', '100 Go de stockage', 'Support prioritaire', 'Analytics avancés', 'API access', 'Intégrations'],
    cta: 'Essai gratuit 14 jours',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '99',
    description: 'Pour les grandes organisations',
    features: ['Tout de Pro', 'Stockage illimité', 'Support dédié 24/7', 'SSO & SAML', 'SLA 99.99%', 'On-premise disponible'],
    cta: 'Contacter les ventes',
    highlighted: false,
  },
];

export function PricingCards() {
  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Tarifs simples et transparents</h2>
          <p className="text-slate-400 text-lg">Choisissez le plan qui vous convient</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={\`relative rounded-2xl p-8 \${
                plan.highlighted
                  ? 'bg-gradient-to-b from-violet-600 to-violet-700 shadow-xl shadow-violet-500/25'
                  : 'bg-slate-900 border border-slate-800'
              }\`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full text-sm font-semibold text-slate-900">
                  Populaire
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                <p className={\`text-sm \${plan.highlighted ? 'text-violet-200' : 'text-slate-400'}\`}>
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-bold text-white">{plan.price}€</span>
                <span className={\`\${plan.highlighted ? 'text-violet-200' : 'text-slate-400'}\`}>/mois</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <svg className={\`w-5 h-5 \${plan.highlighted ? 'text-violet-200' : 'text-violet-400'}\`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className={plan.highlighted ? 'text-white' : 'text-slate-300'}>{feature}</span>
                  </li>
                ))}
              </ul>

              <button className={\`w-full py-3 rounded-xl font-semibold transition-all \${
                plan.highlighted
                  ? 'bg-white text-violet-600 hover:bg-slate-100'
                  : 'bg-violet-600 text-white hover:bg-violet-500'
              }\`}>
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}`,
};

/*
 * ============================================================================
 * FOOTER
 * ============================================================================
 */

const footerModern: ComponentSnippet = {
  name: 'FooterModern',
  description: 'Footer moderne avec gradient et liens organisés',
  category: 'footer',
  tags: ['footer', 'links', 'newsletter', 'social'],
  code: `export function FooterModern() {
  const links = {
    Produit: ['Fonctionnalités', 'Intégrations', 'Tarifs', 'Changelog'],
    Ressources: ['Documentation', 'Guides', 'API Reference', 'Blog'],
    Entreprise: ['À propos', 'Carrières', 'Presse', 'Contact'],
    Légal: ['Confidentialité', 'CGU', 'Cookies', 'Licences'],
  };

  return (
    <footer className="bg-slate-950 border-t border-slate-800">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-6 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <a href="/" className="text-2xl font-bold text-white mb-4 block">
              Brand<span className="text-violet-400">.</span>
            </a>
            <p className="text-slate-400 text-sm mb-6">
              Créez des expériences exceptionnelles avec notre plateforme tout-en-un.
            </p>

            {/* Social */}
            <div className="flex gap-4">
              {['twitter', 'github', 'linkedin', 'youtube'].map((social) => (
                <a
                  key={social}
                  href="#"
                  className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  {social[0].toUpperCase()}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">
            © 2025 Brand. Tous droits réservés.
          </p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-sm text-slate-400">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Tous les systèmes opérationnels
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}`,
};

/*
 * ============================================================================
 * ANIMATIONS & EFFECTS
 * ============================================================================
 */

const textGradientAnimated: ComponentSnippet = {
  name: 'TextGradientAnimated',
  description: 'Texte avec gradient animé',
  category: 'effects',
  tags: ['text', 'gradient', 'animation', 'typography'],
  code: `export function TextGradientAnimated({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={\`bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-[length:200%_auto] animate-gradient bg-clip-text text-transparent \${className}\`}>
      {children}
    </span>
  );
}`,
  styles: `@keyframes gradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.animate-gradient { animation: gradient 3s ease infinite; }`,
};

const cursorGlow: ComponentSnippet = {
  name: 'CursorGlow',
  description: 'Effet de glow qui suit le curseur',
  category: 'effects',
  tags: ['cursor', 'glow', 'interactive', 'background'],
  code: `import { useState, useEffect } from 'react';

export function CursorGlow() {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-300"
      style={{
        background: \`radial-gradient(600px circle at \${position.x}px \${position.y}px, rgba(139, 92, 246, 0.1), transparent 40%)\`,
      }}
    />
  );
}`,
};

const scrollReveal: ComponentSnippet = {
  name: 'ScrollReveal',
  description: 'Wrapper pour animations au scroll',
  category: 'animations',
  tags: ['scroll', 'reveal', 'animation', 'intersection'],
  dependencies: ['framer-motion'],
  code: `import { motion } from 'framer-motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export function ScrollReveal({ children, direction = 'up', delay = 0, className = '' }: ScrollRevealProps) {
  const directions = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directions[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}`,
};

/*
 * ============================================================================
 * FORMS
 * ============================================================================
 */

const inputFloatingLabel: ComponentSnippet = {
  name: 'InputFloatingLabel',
  description: 'Input avec label flottant animé',
  category: 'forms',
  tags: ['input', 'form', 'label', 'floating', 'animation'],
  code: `import { useState } from 'react';

interface InputFloatingLabelProps {
  label: string;
  type?: string;
  name: string;
}

export function InputFloatingLabel({ label, type = 'text', name }: InputFloatingLabelProps) {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState('');

  const isActive = focused || value.length > 0;

  return (
    <div className="relative">
      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full px-4 py-4 bg-slate-900 border-2 border-slate-700 rounded-xl text-white outline-none transition-all duration-300 focus:border-violet-500 peer"
      />
      <label
        className={\`absolute left-4 transition-all duration-300 pointer-events-none \${
          isActive
            ? 'top-0 -translate-y-1/2 text-xs text-violet-400 bg-slate-900 px-2'
            : 'top-1/2 -translate-y-1/2 text-slate-400'
        }\`}
      >
        {label}
      </label>
    </div>
  );
}`,
};

/*
 * ============================================================================
 * EXPORT
 * ============================================================================
 */

export const MODERN_COMPONENTS: ComponentSnippet[] = [
  // Hero
  heroGradientAnimated,
  heroBentoGrid,

  // Cards
  cardGlass,
  cardSpotlight,
  cardHoverLift,

  // Buttons
  buttonShimmer,
  buttonMagnetic,
  buttonGlow,

  // Navigation
  navbarFloating,

  // Features
  featuresGrid,

  // Testimonials
  testimonialCarousel,

  // Pricing
  pricingCards,

  // Footer
  footerModern,

  // Effects
  textGradientAnimated,
  cursorGlow,
  scrollReveal,

  // Forms
  inputFloatingLabel,
];

/**
 * Rechercher des composants par catégorie
 */
export function getComponentsByCategory(category: ComponentCategory): ComponentSnippet[] {
  return MODERN_COMPONENTS.filter((c) => c.category === category);
}

/**
 * Rechercher des composants par tags
 */
export function searchComponents(query: string): ComponentSnippet[] {
  const lowerQuery = query.toLowerCase();
  return MODERN_COMPONENTS.filter(
    (c) =>
      c.name.toLowerCase().includes(lowerQuery) ||
      c.description.toLowerCase().includes(lowerQuery) ||
      c.tags.some((t) => t.includes(lowerQuery)),
  );
}

/**
 * Obtenir tous les composants formatés pour un prompt
 */
export function formatComponentsForPrompt(): string {
  const byCategory: Record<string, ComponentSnippet[]> = {};

  for (const component of MODERN_COMPONENTS) {
    if (!byCategory[component.category]) {
      byCategory[component.category] = [];
    }
    byCategory[component.category].push(component);
  }

  const lines: string[] = [
    '# BAVINI Design System - Composants Modernes',
    '',
    'Composants React/Tailwind uniques. HTML natif uniquement - PAS de Shadcn/Radix.',
    '',
  ];

  for (const [category, components] of Object.entries(byCategory)) {
    lines.push(`## ${category.toUpperCase()}`);
    for (const comp of components) {
      lines.push(`- **${comp.name}**: ${comp.description}`);
      lines.push(`  Tags: ${comp.tags.join(', ')}`);
      if (comp.dependencies?.length) {
        lines.push(`  Dépendances: ${comp.dependencies.join(', ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
