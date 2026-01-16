/**
 * Module Shiki optimisé pour BAVINI
 */

export {
  ESSENTIAL_LANGUAGES,
  OPTIONAL_LANGUAGES,
  THEMES,
  isEssentialLanguage,
  isOptionalLanguage,
  isSupportedLanguage,
  normalizeLanguage,
  type SupportedTheme,
} from './config';

export {
  getHighlighter,
  loadLanguage,
  isLanguageLoaded,
  highlightCode,
  preloadLanguages,
  getLoadedLanguages,
  resetHighlighter,
} from './highlighter';
