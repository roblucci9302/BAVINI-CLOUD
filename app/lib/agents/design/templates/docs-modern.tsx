'use client';

/**
 * Template: Documentation Moderne
 *
 * Template complet pour documentation technique
 * Utilise la palette Midnight (Bleu profond professionnel)
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion } from 'framer-motion';
import { useState } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  brand: {
    name: 'DevDocs',
    version: 'v2.4.0',
  },
  navigation: [
    {
      title: 'Démarrage',
      items: [
        { title: 'Introduction', href: '#', active: true },
        { title: 'Installation', href: '#' },
        { title: 'Configuration', href: '#' },
        { title: 'Premier projet', href: '#' },
      ],
    },
    {
      title: 'Guides',
      items: [
        { title: 'Authentification', href: '#' },
        { title: 'Base de données', href: '#' },
        { title: 'API REST', href: '#' },
        { title: 'Webhooks', href: '#' },
        { title: 'Déploiement', href: '#' },
      ],
    },
    {
      title: 'Référence API',
      items: [
        { title: 'Endpoints', href: '#' },
        { title: 'Authentification', href: '#' },
        { title: 'Erreurs', href: '#' },
        { title: 'Rate Limiting', href: '#' },
      ],
    },
    {
      title: 'Ressources',
      items: [
        { title: 'Exemples', href: '#' },
        { title: 'SDK & Librairies', href: '#' },
        { title: 'Changelog', href: '#' },
        { title: 'FAQ', href: '#' },
      ],
    },
  ],
  content: {
    title: 'Introduction',
    description: 'Bienvenue dans la documentation de DevDocs. Ce guide vous aidera à démarrer rapidement.',
    sections: [
      {
        id: 'overview',
        title: "Vue d'ensemble",
        content: `DevDocs est une plateforme puissante qui vous permet de construire des applications modernes en un temps record.

Notre API REST et nos SDKs vous offrent tout ce dont vous avez besoin pour créer, déployer et scaler vos projets.`,
      },
      {
        id: 'features',
        title: 'Fonctionnalités principales',
        features: [
          { icon: '⚡', title: 'Performance', description: 'Temps de réponse < 100ms' },
          { icon: '🔒', title: 'Sécurité', description: 'Chiffrement de bout en bout' },
          { icon: '🌍', title: 'Global', description: 'CDN mondial pour une latence minimale' },
          { icon: '📊', title: 'Analytics', description: 'Métriques en temps réel' },
        ],
      },
      {
        id: 'quickstart',
        title: 'Démarrage rapide',
        steps: [
          {
            title: 'Installation',
            code: 'npm install @devdocs/sdk',
            language: 'bash',
          },
          {
            title: 'Initialisation',
            code: `import { DevDocs } from '@devdocs/sdk';

const client = new DevDocs({
  apiKey: process.env.DEVDOCS_API_KEY,
});`,
            language: 'typescript',
          },
          {
            title: 'Premier appel',
            code: `const response = await client.users.list();
console.log(response.data);`,
            language: 'typescript',
          },
        ],
      },
    ],
  },
  tableOfContents: [
    { title: "Vue d'ensemble", href: '#overview' },
    { title: 'Fonctionnalités', href: '#features' },
    { title: 'Démarrage rapide', href: '#quickstart' },
  ],
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Header avec recherche
 */
function Header() {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <a href="/" className="text-xl font-bold text-white">
            {config.brand.name}
          </a>
          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded">
            {config.brand.version}
          </span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xl mx-8">
          <div className={`relative transition-all ${searchFocused ? 'scale-105' : ''}`}>
            <input
              type="text"
              placeholder="Rechercher dans la documentation..."
              className="w-full px-4 py-2 pl-10 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">
            GitHub
          </a>
          <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">
            API Status
          </a>
          <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors">
            Dashboard
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Sidebar Navigation
 */
function Sidebar() {
  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-slate-900 border-r border-slate-800 overflow-y-auto">
      <nav className="p-4">
        {config.navigation.map((section) => (
          <div key={section.title} className="mb-6">
            <h3 className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">{section.title}</h3>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.title}>
                  <a
                    href={item.href}
                    className={`block px-3 py-2 text-sm rounded-lg transition-colors ${
                      item.active
                        ? 'bg-blue-500/10 text-blue-400 font-medium'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

/**
 * Table of Contents
 */
function TableOfContents() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <aside className="fixed right-0 top-16 bottom-0 w-64 p-6 hidden xl:block">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Sur cette page</h4>
      <ul className="space-y-2">
        {config.tableOfContents.map((item) => (
          <li key={item.title}>
            <a
              href={item.href}
              onClick={() => setActiveSection(item.href.slice(1))}
              className={`block text-sm transition-colors ${
                activeSection === item.href.slice(1) ? 'text-blue-400 font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>

      {/* Feedback */}
      <div className="mt-8 p-4 bg-slate-800/50 rounded-xl">
        <p className="text-sm text-slate-300 mb-3">Cette page vous a-t-elle aidé ?</p>
        <div className="flex gap-2">
          <button className="flex-1 py-2 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors">
            👍 Oui
          </button>
          <button className="flex-1 py-2 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors">
            👎 Non
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Code Block
 */
function CodeBlock({ code, language, title }: { code: string; language: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
            <div className="w-3 h-3 bg-yellow-500 rounded-full" />
            <div className="w-3 h-3 bg-green-500 rounded-full" />
          </div>
          {title && <span className="ml-2 text-xs text-slate-400">{title}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{language}</span>
          <button onClick={handleCopy} className="p-1.5 text-slate-400 hover:text-white transition-colors">
            {copied ? (
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Code */}
      <pre className="p-4 overflow-x-auto">
        <code className="text-sm text-slate-300 font-mono">{code}</code>
      </pre>
    </div>
  );
}

/**
 * Feature Card
 */
function FeatureCard({ feature }: { feature: { icon: string; title: string; description: string } }) {
  return (
    <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors">
      <span className="text-2xl mb-3 block">{feature.icon}</span>
      <h4 className="font-semibold text-white mb-1">{feature.title}</h4>
      <p className="text-sm text-slate-400">{feature.description}</p>
    </div>
  );
}

/**
 * Callout Component
 */
function Callout({ type, children }: { type: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    tip: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  };

  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    tip: '💡',
  };

  return (
    <div className={`p-4 rounded-xl border ${styles[type]} my-6`}>
      <div className="flex gap-3">
        <span>{icons[type]}</span>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

/**
 * Main Content
 */
function MainContent() {
  const { content } = config;

  return (
    <main className="ml-64 mr-64 pt-16 min-h-screen">
      <div className="max-w-3xl mx-auto px-8 py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-8">
          <a href="#" className="hover:text-white transition-colors">
            Docs
          </a>
          <span>/</span>
          <a href="#" className="hover:text-white transition-colors">
            Démarrage
          </a>
          <span>/</span>
          <span className="text-white">{content.title}</span>
        </nav>

        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">{content.title}</h1>
          <p className="text-xl text-slate-400">{content.description}</p>
        </motion.div>

        {/* Sections */}
        {content.sections.map((section, index) => (
          <motion.section
            key={section.id}
            id={section.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="mb-16"
          >
            <h2 className="text-2xl font-bold text-white mb-6 pb-2 border-b border-slate-800">{section.title}</h2>

            {/* Content Text */}
            {'content' in section && section.content && (
              <div className="prose prose-invert prose-slate max-w-none">
                {section.content.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="text-slate-300 mb-4 leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}

            {/* Features Grid */}
            {'features' in section && section.features && (
              <div className="grid md:grid-cols-2 gap-4">
                {section.features.map((feature) => (
                  <FeatureCard key={feature.title} feature={feature} />
                ))}
              </div>
            )}

            {/* Steps */}
            {'steps' in section && section.steps && (
              <div className="space-y-6">
                <Callout type="info">Assurez-vous d'avoir Node.js 18+ installé avant de commencer.</Callout>

                {section.steps.map((step, stepIndex) => (
                  <div key={step.title}>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {stepIndex + 1}
                      </span>
                      {step.title}
                    </h3>
                    <CodeBlock code={step.code} language={step.language} />
                  </div>
                ))}

                <Callout type="tip">Consultez nos exemples sur GitHub pour voir des implémentations complètes.</Callout>
              </div>
            )}
          </motion.section>
        ))}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-8 border-t border-slate-800">
          <a href="#" className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <svg
              className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Précédent</span>
          </a>
          <a href="#" className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <span>Installation</span>
            <svg
              className="w-5 h-5 group-hover:translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {/* Edit Link */}
        <div className="mt-12 text-center">
          <a href="#" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ✏️ Éditer cette page sur GitHub
          </a>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function DocsModern() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header />
      <Sidebar />
      <TableOfContents />
      <MainContent />
    </div>
  );
}
