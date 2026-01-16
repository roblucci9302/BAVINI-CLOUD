'use client';

/**
 * Template: Landing Page Moderne
 *
 * Template complet pour landing page SaaS/Startup
 * Utilise la palette Aurora et les composants modernes
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
    name: 'YourBrand',
    tagline: 'La plateforme tout-en-un pour votre succès',
  },
  hero: {
    badge: 'Nouveau: Version 2.0 disponible',
    title: 'Créez des expériences',
    titleHighlight: 'exceptionnelles',
    description: 'La plateforme tout-en-un pour construire, déployer et scaler vos applications modernes.',
    cta: {
      primary: 'Commencer gratuitement',
      secondary: 'Voir la démo',
    },
  },
  features: [
    { icon: '⚡', title: 'Ultra rapide', description: 'Performance optimisée pour une expérience fluide' },
    { icon: '🔒', title: 'Sécurisé', description: 'Chiffrement de bout en bout pour vos données' },
    { icon: '🎨', title: 'Personnalisable', description: 'Adaptez chaque aspect à votre marque' },
    { icon: '📱', title: 'Responsive', description: 'Parfait sur tous les appareils' },
    { icon: '🔄', title: 'Sync temps réel', description: 'Collaboration instantanée' },
    { icon: '📊', title: 'Analytics', description: 'Insights détaillés sur vos performances' },
  ],
  testimonials: [
    {
      quote: 'Ce produit a complètement transformé notre façon de travailler.',
      author: 'Marie Dupont',
      role: 'CEO, TechCorp',
      avatar: 'https://i.pravatar.cc/100?img=1',
    },
    {
      quote: 'Le meilleur investissement que nous ayons fait cette année.',
      author: 'Jean Martin',
      role: 'CTO, StartupXYZ',
      avatar: 'https://i.pravatar.cc/100?img=2',
    },
  ],
  pricing: [
    {
      name: 'Starter',
      price: '0',
      features: ['5 projets', '1 Go de stockage', 'Support email'],
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '29',
      features: ['Projets illimités', '100 Go', 'Support prioritaire', 'API access'],
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: '99',
      features: ['Tout de Pro', 'Stockage illimité', 'Support dédié', 'SSO'],
      highlighted: false,
    },
  ],
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Navbar flottante avec blur
 */
function Navbar() {
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
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4"
    >
      <div
        className={`flex items-center justify-between px-6 py-4 rounded-2xl transition-all duration-300 ${
          scrolled
            ? 'bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-black/20 border border-white/10'
            : 'bg-transparent'
        }`}
      >
        <a href="/" className="text-xl font-bold text-white">
          {config.brand.name}
          <span className="text-violet-400">.</span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {['Produits', 'Solutions', 'Tarifs', 'Blog'].map((link) => (
            <a key={link} href="#" className="text-sm text-slate-300 hover:text-white transition-colors relative group">
              {link}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-violet-400 group-hover:w-full transition-all duration-300" />
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button className="text-sm text-slate-300 hover:text-white transition-colors">Connexion</button>
          <button className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors">
            Démarrer
          </button>
        </div>
      </div>
    </motion.nav>
  );
}

/**
 * Hero Section avec gradient animé
 */
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-transparent to-cyan-600/20" />
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/30 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-sm text-white/80 mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            {config.hero.badge}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight"
        >
          {config.hero.title}
          <span className="block bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            {config.hero.titleHighlight}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto"
        >
          {config.hero.description}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <button className="px-8 py-4 bg-white text-slate-900 rounded-xl font-semibold hover:bg-slate-100 transition-all hover:scale-105 shadow-lg shadow-white/25">
            {config.hero.cta.primary}
          </button>
          <button className="px-8 py-4 bg-white/10 text-white rounded-xl font-semibold backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all">
            {config.hero.cta.secondary} →
          </button>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Features Grid Section
 */
function FeaturesSection() {
  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-white mb-4">Tout ce dont vous avez besoin</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Des outils puissants pour créer, gérer et faire grandir votre projet.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {config.features.map((feature, index) => (
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
}

/**
 * Pricing Section
 */
function PricingSection() {
  return (
    <section className="py-24 bg-slate-900">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Tarifs simples et transparents</h2>
          <p className="text-slate-400 text-lg">Choisissez le plan qui vous convient</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {config.pricing.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`relative rounded-2xl p-8 ${
                plan.highlighted
                  ? 'bg-gradient-to-b from-violet-600 to-violet-700 shadow-xl shadow-violet-500/25'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full text-sm font-semibold text-slate-900">
                  Populaire
                </div>
              )}

              <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold text-white">{plan.price}€</span>
                <span className={plan.highlighted ? 'text-violet-200' : 'text-slate-400'}>/mois</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <svg
                      className={`w-5 h-5 ${plan.highlighted ? 'text-violet-200' : 'text-violet-400'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className={plan.highlighted ? 'text-white' : 'text-slate-300'}>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-3 rounded-xl font-semibold transition-all ${
                  plan.highlighted
                    ? 'bg-white text-violet-600 hover:bg-slate-100'
                    : 'bg-violet-600 text-white hover:bg-violet-500'
                }`}
              >
                Commencer
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Footer
 */
function Footer() {
  const links = {
    Produit: ['Fonctionnalités', 'Intégrations', 'Tarifs', 'Changelog'],
    Ressources: ['Documentation', 'Guides', 'API', 'Blog'],
    Entreprise: ['À propos', 'Carrières', 'Presse', 'Contact'],
    Légal: ['Confidentialité', 'CGU', 'Cookies'],
  };

  return (
    <footer className="bg-slate-950 border-t border-slate-800">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-6 gap-12">
          <div className="md:col-span-2">
            <a href="/" className="text-2xl font-bold text-white mb-4 block">
              {config.brand.name}
              <span className="text-violet-400">.</span>
            </a>
            <p className="text-slate-400 text-sm mb-6">{config.brand.tagline}</p>
          </div>

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

        <div className="mt-16 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-500">© 2025 {config.brand.name}. Tous droits réservés.</p>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Tous les systèmes opérationnels
          </div>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function LandingModern() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <Footer />
    </div>
  );
}
