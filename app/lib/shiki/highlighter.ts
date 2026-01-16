/**
 * Highlighter Shiki optimisé avec chargement lazy des langages
 */

import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki';
import { createScopedLogger } from '~/utils/logger';
import {
  ESSENTIAL_LANGUAGES,
  THEMES,
  isEssentialLanguage,
  isOptionalLanguage,
  normalizeLanguage,
  type SupportedTheme,
} from './config';

const logger = createScopedLogger('Shiki');

// Singleton highlighter
let highlighterInstance: HighlighterGeneric<BundledLanguage, BundledTheme> | null = null;
let highlighterPromise: Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | null = null;

// Track loaded optional languages
const loadedLanguages = new Set<string>(ESSENTIAL_LANGUAGES);

/**
 * Obtenir l'instance du highlighter (lazy initialization)
 */
export async function getHighlighter(): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> {
  if (highlighterInstance) {
    return highlighterInstance;
  }

  if (highlighterPromise) {
    return highlighterPromise;
  }

  highlighterPromise = (async () => {
    logger.debug('Initializing Shiki with essential languages only');

    const highlighter = await createHighlighter({
      langs: ESSENTIAL_LANGUAGES,
      themes: [...THEMES],
    });

    highlighterInstance = highlighter;
    logger.info(`Shiki initialized with ${ESSENTIAL_LANGUAGES.length} languages`);

    return highlighter;
  })();

  return highlighterPromise;
}

/**
 * Charger un langage optionnel si nécessaire
 */
export async function loadLanguage(lang: string): Promise<boolean> {
  const normalizedLang = normalizeLanguage(lang);

  // Déjà chargé
  if (loadedLanguages.has(normalizedLang)) {
    return true;
  }

  // Pas un langage supporté
  if (!isOptionalLanguage(normalizedLang)) {
    logger.warn(`Language '${lang}' is not supported`);
    return false;
  }

  try {
    const highlighter = await getHighlighter();

    logger.debug(`Loading optional language: ${normalizedLang}`);
    await highlighter.loadLanguage(normalizedLang);
    loadedLanguages.add(normalizedLang);

    logger.info(`Loaded language: ${normalizedLang}`);

    return true;
  } catch (error) {
    logger.error(`Failed to load language '${normalizedLang}':`, error);
    return false;
  }
}

/**
 * Vérifier si un langage est chargé
 */
export function isLanguageLoaded(lang: string): boolean {
  return loadedLanguages.has(normalizeLanguage(lang));
}

/**
 * Highlight du code avec chargement automatique des langages manquants
 */
export async function highlightCode(code: string, lang: string, theme: SupportedTheme = 'dark-plus'): Promise<string> {
  const normalizedLang = normalizeLanguage(lang);
  const highlighter = await getHighlighter();

  // Si langage pas chargé, essayer de le charger
  if (!loadedLanguages.has(normalizedLang)) {
    if (isOptionalLanguage(normalizedLang)) {
      await loadLanguage(normalizedLang);
    } else if (!isEssentialLanguage(normalizedLang)) {
      // Fallback to plaintext for unsupported languages
      logger.trace(`Using plaintext for unsupported language: ${lang}`);
      return highlighter.codeToHtml(code, { lang: 'plaintext', theme });
    }
  }

  try {
    return highlighter.codeToHtml(code, { lang: normalizedLang, theme });
  } catch (error) {
    logger.warn(`Highlight failed for '${normalizedLang}', falling back to plaintext`);
    return highlighter.codeToHtml(code, { lang: 'plaintext', theme });
  }
}

/**
 * Précharger des langages optionnels (pour améliorer l'UX)
 */
export async function preloadLanguages(languages: string[]): Promise<void> {
  const toLoad = languages
    .map(normalizeLanguage)
    .filter((lang) => isOptionalLanguage(lang) && !loadedLanguages.has(lang));

  if (toLoad.length === 0) {
    return;
  }

  logger.debug(`Preloading ${toLoad.length} languages`);

  await Promise.all(toLoad.map(loadLanguage));
}

/**
 * Obtenir la liste des langages chargés
 */
export function getLoadedLanguages(): string[] {
  return [...loadedLanguages];
}

/**
 * Réinitialiser le highlighter (pour les tests)
 */
export function resetHighlighter(): void {
  highlighterInstance = null;
  highlighterPromise = null;
  loadedLanguages.clear();
  ESSENTIAL_LANGUAGES.forEach((lang) => loadedLanguages.add(lang));
}
