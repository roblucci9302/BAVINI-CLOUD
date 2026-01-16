/**
 * Web Search Integration for BAVINI Chat API
 *
 * Provides web search capabilities via Tavily API for the LLM to use.
 *
 * @module lib/.server/llm/web-search
 */

import { z } from 'zod';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebSearch');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  truncated: boolean;
}

/*
 * ============================================================================
 * TAVILY API FUNCTIONS
 * ============================================================================
 */

async function tavilySearch(
  apiKey: string,
  query: string,
  numResults: number = 5,
  includeDomains?: string[],
): Promise<WebSearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: Math.min(numResults, 10),
      include_domains: includeDomains || [],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Tavily search failed', { status: response.status, error: errorText });
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
      score?: number;
    }>;
  };

  logger.debug('Tavily search results', { query, count: data.results?.length ?? 0 });

  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    score: r.score,
  }));
}

async function tavilyFetch(apiKey: string, url: string): Promise<WebFetchResult> {
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      urls: [url],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Tavily fetch failed', { status: response.status, error: errorText });
    throw new Error(`Tavily Extract API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      url?: string;
      title?: string;
      content?: string;
      raw_content?: string;
    }>;
  };

  const result = data.results?.[0];
  const content = result?.raw_content || result?.content || '';
  const maxLength = 8000;

  logger.debug('Tavily fetch result', { url, contentLength: content.length });

  return {
    url: result?.url || url,
    title: result?.title || 'Sans titre',
    content: content.slice(0, maxLength),
    truncated: content.length > maxLength,
  };
}

/*
 * ============================================================================
 * AI SDK TOOLS
 * ============================================================================
 */

/**
 * Web search tool input schema
 */
const webSearchSchema = z.object({
  query: z.string().describe('La requête de recherche'),
  num_results: z.number().min(1).max(10).optional().describe('Nombre de résultats (1-10, défaut: 5)'),
  include_domains: z
    .array(z.string())
    .optional()
    .describe('Domaines à privilégier (ex: ["react.dev", "tailwindcss.com"])'),
});

/**
 * Web fetch tool input schema
 */
const webFetchSchema = z.object({
  url: z.string().url().describe("L'URL de la page à récupérer"),
});

/**
 * Create web search tools for the AI SDK
 *
 * @param tavilyApiKey - Tavily API key (optional, tools return error if not provided)
 * @returns Object containing web_search and web_fetch tools
 */
export function createWebSearchTools(tavilyApiKey?: string) {
  const isAvailable = !!tavilyApiKey;

  return {
    web_search: {
      description: `Rechercher des informations sur le web en temps réel.

QUAND UTILISER:
- L'utilisateur demande des infos sur une technologie récente (React 19, Tailwind v4, etc.)
- Tu as besoin de documentation officielle
- Tu cherches une solution à un problème technique spécifique
- Tu veux vérifier les dernières versions ou features d'une lib

EXEMPLES:
- "Quelles sont les features de React 19?" → web_search avec query "React 19 new features"
- "Comment configurer Tailwind v4?" → web_search avec query "Tailwind CSS v4 configuration"

IMPORTANT: Toujours inclure les sources dans ta réponse avec le format [Titre](URL)`,
      inputSchema: webSearchSchema,
      execute: async (input: z.infer<typeof webSearchSchema>) => {
        const { query, num_results = 5, include_domains } = input;

        if (!isAvailable || !tavilyApiKey) {
          return {
            success: false,
            error: 'Service de recherche web non configuré. Ajoutez TAVILY_API_KEY.',
          };
        }

        try {
          const results = await tavilySearch(tavilyApiKey, query, num_results, include_domains);

          return {
            success: true,
            query,
            results: results.map((r, i) => ({
              position: i + 1,
              title: r.title,
              url: r.url,
              snippet: r.snippet,
            })),
            markdown: results.map((r, i) => `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`).join('\n\n'),
          };
        } catch (error) {
          logger.error('web_search failed', { error });
          return {
            success: false,
            error: `Erreur de recherche: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },

    web_fetch: {
      description: `Récupérer le contenu d'une page web spécifique.

QUAND UTILISER:
- Après web_search pour obtenir plus de détails sur un résultat
- L'utilisateur fournit une URL spécifique à analyser
- Tu as besoin du contenu complet d'une page de documentation

NOTE: Le contenu est limité à 8000 caractères. Pour les pages longues, utilise le snippet de web_search.`,
      inputSchema: webFetchSchema,
      execute: async (input: z.infer<typeof webFetchSchema>) => {
        const { url } = input;

        if (!isAvailable || !tavilyApiKey) {
          return {
            success: false,
            error: 'Service de récupération web non configuré. Ajoutez TAVILY_API_KEY.',
          };
        }

        try {
          const result = await tavilyFetch(tavilyApiKey, url);

          return {
            success: true,
            url: result.url,
            title: result.title,
            content: result.content,
            truncated: result.truncated,
          };
        } catch (error) {
          logger.error('web_fetch failed', { error });
          return {
            success: false,
            error: `Erreur de récupération: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };
}

/**
 * Check if web search is available
 */
export function isWebSearchAvailable(env: Env): boolean {
  return !!env.TAVILY_API_KEY;
}

/**
 * Get web search status message for system prompt
 */
export function getWebSearchStatus(env: Env): string {
  if (isWebSearchAvailable(env)) {
    return `
## 🌐 Recherche Web ACTIVE

Tu as accès aux outils de recherche web:
- **web_search**: Rechercher des informations actuelles sur le web
- **web_fetch**: Récupérer le contenu d'une page spécifique

Utilise ces outils quand l'utilisateur demande des infos sur des technologies récentes,
de la documentation, ou des solutions à des problèmes techniques.

TOUJOURS inclure les sources avec le format [Titre](URL).`;
  }

  return '';
}
