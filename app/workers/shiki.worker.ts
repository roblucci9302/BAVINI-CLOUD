/**
 * Web Worker pour le syntax highlighting avec Shiki.
 * Décharge le main thread pour éviter les blocages UI sur gros fichiers.
 */

import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki';

// Types pour la communication avec le main thread
export interface ShikiWorkerRequest {
  id: string;
  type: 'highlight' | 'loadLanguage' | 'init';
  payload?: {
    code?: string;
    lang?: string;
    theme?: 'light-plus' | 'dark-plus';
  };
}

export interface ShikiWorkerResponse {
  id: string;
  type: 'success' | 'error';
  result?: string;
  error?: string;
}

// Configuration identique à app/lib/shiki/config.ts
const ESSENTIAL_LANGUAGES: BundledLanguage[] = [
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

const OPTIONAL_LANGUAGES: BundledLanguage[] = [
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

const THEMES = ['light-plus', 'dark-plus'] as const;

// Alias de langages
const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
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

// État du worker
let highlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | null = null;
let initPromise: Promise<void> | null = null;
const loadedLanguages = new Set<string>(ESSENTIAL_LANGUAGES);

/**
 * Normaliser le nom du langage
 */
function normalizeLanguage(lang: string): BundledLanguage {
  return LANGUAGE_ALIASES[lang.toLowerCase()] || (lang as BundledLanguage);
}

/**
 * Vérifier si un langage est optionnel
 */
function isOptionalLanguage(lang: string): boolean {
  return OPTIONAL_LANGUAGES.includes(lang as BundledLanguage);
}

/**
 * Initialiser le highlighter
 */
async function initHighlighter(): Promise<void> {
  if (highlighter) {
    return;
  }

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    highlighter = await createHighlighter({
      langs: ESSENTIAL_LANGUAGES,
      themes: [...THEMES],
    });
  })();

  await initPromise;
}

/**
 * Charger un langage optionnel
 */
async function loadLanguage(lang: string): Promise<boolean> {
  const normalizedLang = normalizeLanguage(lang);

  if (loadedLanguages.has(normalizedLang)) {
    return true;
  }

  if (!isOptionalLanguage(normalizedLang)) {
    return false;
  }

  if (!highlighter) {
    await initHighlighter();
  }

  try {
    await highlighter!.loadLanguage(normalizedLang);
    loadedLanguages.add(normalizedLang);

    return true;
  } catch {
    return false;
  }
}

/**
 * Highlight du code
 */
async function highlightCode(
  code: string,
  lang: string,
  theme: 'light-plus' | 'dark-plus' = 'dark-plus',
): Promise<string> {
  if (!highlighter) {
    await initHighlighter();
  }

  const normalizedLang = normalizeLanguage(lang);

  // Charger le langage si nécessaire
  if (!loadedLanguages.has(normalizedLang)) {
    if (isOptionalLanguage(normalizedLang)) {
      await loadLanguage(normalizedLang);
    } else {
      // Fallback to plaintext
      return highlighter!.codeToHtml(code, { lang: 'plaintext', theme });
    }
  }

  try {
    return highlighter!.codeToHtml(code, { lang: normalizedLang, theme });
  } catch {
    return highlighter!.codeToHtml(code, { lang: 'plaintext', theme });
  }
}

/**
 * Envoyer une réponse
 */
function sendResponse(response: ShikiWorkerResponse): void {
  self.postMessage(response);
}

/**
 * Gestionnaire de messages
 */
self.onmessage = async (event: MessageEvent<ShikiWorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'init': {
        await initHighlighter();
        sendResponse({ id, type: 'success', result: 'initialized' });
        break;
      }

      case 'highlight': {
        if (!payload?.code || !payload?.lang) {
          sendResponse({ id, type: 'error', error: 'Missing code or lang' });
          return;
        }

        const html = await highlightCode(payload.code, payload.lang, payload.theme || 'dark-plus');

        sendResponse({ id, type: 'success', result: html });
        break;
      }

      case 'loadLanguage': {
        if (!payload?.lang) {
          sendResponse({ id, type: 'error', error: 'Missing lang' });
          return;
        }

        const success = await loadLanguage(payload.lang);
        sendResponse({
          id,
          type: success ? 'success' : 'error',
          result: success ? 'loaded' : undefined,
          error: success ? undefined : `Failed to load language: ${payload.lang}`,
        });
        break;
      }

      default:
        sendResponse({ id, type: 'error', error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Informer que le worker est prêt
self.postMessage({ type: 'ready' });
