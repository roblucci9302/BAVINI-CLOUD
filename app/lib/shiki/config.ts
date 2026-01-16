/**
 * Configuration Shiki optimisée pour BAVINI
 * Charge uniquement les langages essentiels pour réduire le bundle
 */

import type { BundledLanguage } from 'shiki';

/**
 * Langages essentiels chargés au démarrage (~200KB au lieu de 2.5MB)
 */
export const ESSENTIAL_LANGUAGES: BundledLanguage[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'html',
  'css',
  'json',
  'markdown',
  'python',
  'bash',
  'shell',
  'sql',
  'yaml',
  'xml',
];

/**
 * Langages optionnels chargés à la demande
 */
export const OPTIONAL_LANGUAGES: BundledLanguage[] = [
  'rust',
  'go',
  'java',
  'cpp',
  'c',
  'csharp',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'scala',
  'r',
  'lua',
  'perl',
  'haskell',
  'elixir',
  'clojure',
  'vue',
  'svelte',
  'astro',
  'graphql',
  'dockerfile',
  'nginx',
  'toml',
  'ini',
  'diff',
  'git-commit',
  'git-rebase',
];

/**
 * Thèmes utilisés
 */
export const THEMES = ['light-plus', 'dark-plus'] as const;

export type SupportedTheme = (typeof THEMES)[number];

/**
 * Vérifier si un langage est essentiel
 */
export function isEssentialLanguage(lang: string): lang is BundledLanguage {
  return ESSENTIAL_LANGUAGES.includes(lang as BundledLanguage);
}

/**
 * Vérifier si un langage est optionnel
 */
export function isOptionalLanguage(lang: string): lang is BundledLanguage {
  return OPTIONAL_LANGUAGES.includes(lang as BundledLanguage);
}

/**
 * Vérifier si un langage est supporté
 */
export function isSupportedLanguage(lang: string): lang is BundledLanguage {
  return isEssentialLanguage(lang) || isOptionalLanguage(lang);
}

/**
 * Mapper les alias de langages vers les noms Shiki
 */
export function normalizeLanguage(lang: string): BundledLanguage {
  const aliases: Record<string, BundledLanguage> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    htm: 'html',
    cs: 'csharp',
    'c++': 'cpp',
    'c#': 'csharp',
    rs: 'rust',
  };

  return aliases[lang.toLowerCase()] || (lang as BundledLanguage);
}
