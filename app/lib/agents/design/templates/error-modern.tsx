'use client';

/**
 * Template: Pages d'Erreur Modernes
 *
 * Templates pour 404, 500, et autres erreurs
 * Utilise la palette Neon (Cyberpunk/Futuriste)
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  brand: {
    name: 'YourApp',
  },
  errors: {
    404: {
      code: '404',
      title: 'Page introuvable',
      description: 'Oops ! La page que vous cherchez semble avoir disparu dans le cyberespace.',
      suggestions: [
        { label: "Retour à l'accueil", href: '/', primary: true },
        { label: 'Contactez-nous', href: '/contact', primary: false },
      ],
    },
    500: {
      code: '500',
      title: 'Erreur serveur',
      description: 'Nos serveurs font une petite sieste. Réessayez dans quelques instants.',
      suggestions: [
        { label: 'Réessayer', href: '#', primary: true },
        { label: 'Page de statut', href: '/status', primary: false },
      ],
    },
    403: {
      code: '403',
      title: 'Accès refusé',
      description: "Vous n'avez pas la permission d'accéder à cette ressource.",
      suggestions: [
        { label: 'Se connecter', href: '/login', primary: true },
        { label: 'Retour', href: '/', primary: false },
      ],
    },
    maintenance: {
      code: '🔧',
      title: 'Maintenance en cours',
      description: 'Nous améliorons notre plateforme. De retour très bientôt !',
      suggestions: [
        { label: 'Page de statut', href: '/status', primary: true },
        { label: 'Twitter', href: 'https://twitter.com', primary: false },
      ],
    },
  },
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Glitch Text Effect
 */
function GlitchText({ children, className = '' }: { children: string; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span className="relative z-10">{children}</span>
      <span
        className="absolute top-0 left-0 -translate-x-[2px] translate-y-[2px] text-cyan-500 opacity-70 animate-pulse"
        aria-hidden
      >
        {children}
      </span>
      <span
        className="absolute top-0 left-0 translate-x-[2px] -translate-y-[2px] text-pink-500 opacity-70 animate-pulse"
        style={{ animationDelay: '0.1s' }}
        aria-hidden
      >
        {children}
      </span>
    </span>
  );
}

/**
 * Animated Grid Background
 */
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-purple-950/50 to-slate-950" />

      {/* Animated grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'grid-move 20s linear infinite',
        }}
      />

      {/* Glow orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px]"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/20 rounded-full blur-[100px]"
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.5, 0.3, 0.5],
        }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-pink-500/20 rounded-full blur-[80px]"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.4, 0.2, 0.4],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
        }}
      />
    </div>
  );
}

/**
 * Floating Particles
 */
function FloatingParticles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * 100,
    delay: Math.random() * 5,
    duration: Math.random() * 10 + 10,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-gradient-to-r from-cyan-400 to-purple-400"
          style={{
            width: particle.size,
            height: particle.size,
            left: `${particle.x}%`,
            bottom: '-10px',
          }}
          animate={{
            y: [0, -window.innerHeight - 100],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}

/**
 * ASCII Art for 404
 */
function AsciiArt() {
  const art = `
    ██╗  ██╗ ██████╗ ██╗  ██╗
    ██║  ██║██╔═████╗██║  ██║
    ███████║██║██╔██║███████║
    ╚════██║████╔╝██║╚════██║
         ██║╚██████╔╝     ██║
         ╚═╝ ╚═════╝      ╚═╝
  `;

  return (
    <motion.pre
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-[8px] sm:text-xs font-mono text-cyan-400/50 whitespace-pre leading-tight"
    >
      {art}
    </motion.pre>
  );
}

/**
 * Error Page Layout
 */
function ErrorLayout({ error }: { error: (typeof config.errors)[404] }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <GridBackground />
      <FloatingParticles />

      <div className="relative z-10 text-center px-6 max-w-2xl">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <a href="/" className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors">
            <span className="text-xl font-bold">{config.brand.name}</span>
          </a>
        </motion.div>

        {/* Error Code */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.8 }}
          className="mb-8"
        >
          {error.code === '404' ? (
            <AsciiArt />
          ) : (
            <div className="text-8xl md:text-9xl font-black">
              <GlitchText className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                {error.code}
              </GlitchText>
            </div>
          )}
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl md:text-4xl font-bold text-white mb-4"
        >
          {error.title}
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-lg text-slate-400 mb-10"
        >
          {error.description}
        </motion.p>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          {error.suggestions.map((suggestion) => (
            <a
              key={suggestion.label}
              href={suggestion.href}
              className={`px-8 py-4 rounded-xl font-semibold transition-all ${
                suggestion.primary
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:from-cyan-400 hover:to-purple-400 shadow-lg shadow-purple-500/25'
                  : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
              }`}
            >
              {suggestion.label}
            </a>
          ))}
        </motion.div>

        {/* Search */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-12">
          <p className="text-slate-500 text-sm mb-4">Ou recherchez ce que vous cherchez :</p>
          <div className="relative max-w-md mx-auto">
            <input
              type="text"
              placeholder="Rechercher..."
              className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <button className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          </div>
        </motion.div>
      </div>

      {/* CSS Animation for grid */}
      <style>{`
        @keyframes grid-move {
          0% { transform: translateY(0); }
          100% { transform: translateY(50px); }
        }
      `}</style>
    </div>
  );
}

/**
 * Maintenance Page avec countdown
 */
function MaintenancePage() {
  const [timeLeft, setTimeLeft] = useState({ hours: 2, minutes: 30, seconds: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, minutes, seconds } = prev;
        if (seconds > 0) {
          seconds--;
        } else if (minutes > 0) {
          minutes--;
          seconds = 59;
        } else if (hours > 0) {
          hours--;
          minutes = 59;
          seconds = 59;
        }
        return { hours, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <GridBackground />

      <div className="relative z-10 text-center px-6 max-w-2xl">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <span className="text-xl font-bold text-white">{config.brand.name}</span>
        </motion.div>

        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring' }}
          className="text-8xl mb-8"
        >
          🔧
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl md:text-4xl font-bold text-white mb-4"
        >
          Maintenance en cours
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-lg text-slate-400 mb-10"
        >
          Nous améliorons notre plateforme pour vous offrir une meilleure expérience.
        </motion.p>

        {/* Countdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex justify-center gap-4 mb-10"
        >
          {[
            { value: timeLeft.hours, label: 'Heures' },
            { value: timeLeft.minutes, label: 'Minutes' },
            { value: timeLeft.seconds, label: 'Secondes' },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-2">
                <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                  {String(item.value).padStart(2, '0')}
                </span>
              </div>
              <span className="text-xs text-slate-500">{item.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Newsletter */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="max-w-md mx-auto"
        >
          <p className="text-slate-500 text-sm mb-4">Soyez notifié quand nous serons de retour :</p>
          <form className="flex gap-2">
            <input
              type="email"
              placeholder="votre@email.com"
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-purple-400 transition-colors"
            >
              Notifier
            </button>
          </form>
        </motion.div>

        {/* Social */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-12 flex justify-center gap-4"
        >
          {['Twitter', 'Discord', 'Status'].map((social) => (
            <a key={social} href="#" className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
              {social}
            </a>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE (démo avec tabs)
// ============================================================================

export default function ErrorModern() {
  const [activeError, setActiveError] = useState<'404' | '500' | '403' | 'maintenance'>('404');

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Demo Tab Switcher */}
      <div className="fixed top-4 right-4 z-50 bg-slate-900 rounded-xl shadow-lg p-1 flex gap-1 border border-slate-800">
        {[
          { id: '404', label: '404' },
          { id: '500', label: '500' },
          { id: '403', label: '403' },
          { id: 'maintenance', label: 'Maintenance' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveError(tab.id as typeof activeError)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeError === tab.id
                ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pages */}
      {activeError === 'maintenance' ? <MaintenancePage /> : <ErrorLayout error={config.errors[activeError]} />}
    </div>
  );
}

// Export individual pages
export { ErrorLayout as Error404 };
export { MaintenancePage };
