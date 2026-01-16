/**
 * Outils de recherche et navigation web pour les agents BAVINI
 *
 * Permet aux agents de:
 * - Rechercher sur le web (WebSearch)
 * - Récupérer le contenu d'une page (WebFetch)
 *
 * @module agents/tools/web-tools
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Résultat d'une recherche web
 */
export interface WebSearchResult {
  /** Titre de la page */
  title: string;

  /** URL de la page */
  url: string;

  /** Extrait/snippet du contenu */
  snippet: string;

  /** Score de pertinence (optionnel) */
  score?: number;

  /** Date de publication (optionnel) */
  publishedDate?: string;
}

/**
 * Options de recherche web
 */
export interface WebSearchOptions {
  /** Nombre de résultats (défaut: 5) */
  numResults?: number;

  /** Langue des résultats */
  language?: string;

  /** Domaines à inclure */
  includeDomains?: string[];

  /** Domaines à exclure */
  excludeDomains?: string[];

  /** Type de recherche */
  searchType?: 'general' | 'news' | 'academic';
}

/**
 * Résultat de WebFetch
 */
export interface WebFetchResult {
  /** URL récupérée */
  url: string;

  /** Titre de la page */
  title: string;

  /** Contenu en markdown */
  content: string;

  /** Méta-description */
  description?: string;

  /** URL de redirection (si applicable) */
  redirectUrl?: string;
}

/**
 * Interface du service de recherche web
 */
export interface WebSearchServiceInterface {
  /** Effectuer une recherche */
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;

  /** Récupérer le contenu d'une URL */
  fetch(url: string, prompt?: string): Promise<WebFetchResult>;

  /** Vérifier si le service est disponible */
  isAvailable(): boolean;
}

/*
 * ============================================================================
 * TOOL DEFINITIONS
 * ============================================================================
 */

/**
 * Outil WebSearch - Rechercher sur le web
 */
export const WebSearchTool: ToolDefinition = {
  name: 'web_search',
  description: `Rechercher des informations sur le web en temps réel.

QUAND UTILISER:
- Obtenir des informations récentes ou à jour
- Rechercher de la documentation
- Trouver des solutions à des problèmes techniques
- Vérifier des faits ou des événements actuels

PARAMÈTRES:
- query (requis): La requête de recherche
- num_results: Nombre de résultats (1-10, défaut: 5)
- include_domains: Liste de domaines à privilégier
- exclude_domains: Liste de domaines à exclure
- search_type: "general", "news", ou "academic"

EXEMPLES:
- web_search({ query: "React 19 new features" })
- web_search({ query: "Tailwind CSS v4", include_domains: ["tailwindcss.com"] })

IMPORTANT:
- Toujours inclure les sources dans ta réponse
- Format des sources: [Titre](URL)`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'La requête de recherche',
      },
      num_results: {
        type: 'number',
        description: 'Nombre de résultats à retourner (1-10)',
      },
      include_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Domaines à privilégier dans les résultats',
      },
      exclude_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Domaines à exclure des résultats',
      },
      search_type: {
        type: 'string',
        enum: ['general', 'news', 'academic'],
        description: 'Type de recherche',
      },
    },
    required: ['query'],
  },
};

/**
 * Outil WebFetch - Récupérer le contenu d'une page web
 */
export const WebFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: `Récupérer et analyser le contenu d'une page web.

QUAND UTILISER:
- Lire le contenu détaillé d'une page après une recherche
- Analyser une documentation spécifique
- Extraire des informations d'une URL donnée par l'utilisateur

PARAMÈTRES:
- url (requis): L'URL complète de la page à récupérer
- prompt: Instructions sur quoi extraire de la page

EXEMPLES:
- web_fetch({ url: "https://docs.react.dev/blog/2024/react-19" })
- web_fetch({ url: "https://example.com/api", prompt: "Extrais les endpoints disponibles" })

NOTE:
- Les URLs HTTP seront automatiquement upgradées vers HTTPS
- Le contenu est converti en markdown pour faciliter la lecture`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: "L'URL de la page à récupérer",
      },
      prompt: {
        type: 'string',
        description: 'Instructions sur quoi extraire de la page',
      },
    },
    required: ['url'],
  },
};

/**
 * Liste des outils web
 */
export const WEB_TOOLS: ToolDefinition[] = [WebSearchTool, WebFetchTool];

/*
 * ============================================================================
 * MOCK IMPLEMENTATIONS
 * ============================================================================
 */

/**
 * Résultats mock pour le développement
 */
function getMockSearchResults(query: string): WebSearchResult[] {
  return [
    {
      title: `Résultat de recherche pour "${query}"`,
      url: 'https://example.com/result-1',
      snippet: `Ceci est un résultat mock pour la recherche "${query}". Le service de recherche web n'est pas configuré.`,
      score: 0.95,
    },
    {
      title: 'Documentation - Example',
      url: 'https://docs.example.com',
      snippet: 'Documentation technique et guides pour développeurs.',
      score: 0.85,
    },
  ];
}

/**
 * Contenu mock pour WebFetch
 */
function getMockFetchResult(url: string): WebFetchResult {
  return {
    url,
    title: 'Page Mock',
    content: `# Contenu Mock

Cette page est un résultat mock car le service WebFetch n'est pas configuré.

**URL demandée:** ${url}

Pour activer la recherche web, configurez les variables d'environnement:
- \`WEB_SEARCH_PROVIDER\`: tavily, serp, brave
- \`WEB_SEARCH_API_KEY\`: Votre clé API`,
    description: 'Résultat mock - service non configuré',
  };
}

/*
 * ============================================================================
 * TAVILY API IMPLEMENTATION
 * ============================================================================
 */

/**
 * Recherche via Tavily API
 */
async function searchWithTavily(
  apiKey: string,
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: options.numResults || 5,
      include_domains: options.includeDomains || [],
      exclude_domains: options.excludeDomains || [],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tavily API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
      score?: number;
      published_date?: string;
    }>;
  };

  return (data.results || []).map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
    score: result.score,
    publishedDate: result.published_date,
  }));
}

/**
 * Fetch via Tavily Extract API
 */
async function fetchWithTavily(apiKey: string, url: string): Promise<WebFetchResult> {
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      urls: [url],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tavily Extract API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      url?: string;
      title?: string;
      content?: string;
      raw_content?: string;
      description?: string;
    }>;
  };
  const result = data.results?.[0];

  if (!result) {
    throw new Error('No content extracted from URL');
  }

  return {
    url: result.url || url,
    title: result.title || 'Sans titre',
    content: result.raw_content || result.content || '',
    description: result.description,
  };
}

/*
 * ============================================================================
 * SERVICE IMPLEMENTATION
 * ============================================================================
 */

/**
 * Configuration du service de recherche web
 */
export interface WebSearchServiceConfig {
  /** Provider: tavily, serp, brave, mock */
  provider: 'tavily' | 'serp' | 'brave' | 'mock';

  /** Clé API */
  apiKey?: string;
}

/**
 * Créer un service de recherche web
 */
export function createWebSearchService(config: WebSearchServiceConfig): WebSearchServiceInterface {
  const { provider, apiKey } = config;

  // Mock provider
  if (provider === 'mock' || !apiKey) {
    return {
      isAvailable: () => false,
      search: async (query) => getMockSearchResults(query),
      fetch: async (url) => getMockFetchResult(url),
    };
  }

  // Tavily provider
  if (provider === 'tavily') {
    return {
      isAvailable: () => true,
      search: async (query, options) => searchWithTavily(apiKey, query, options),
      fetch: async (url) => fetchWithTavily(apiKey, url),
    };
  }

  // Other providers can be added here
  // For now, fallback to mock
  return {
    isAvailable: () => false,
    search: async (query) => getMockSearchResults(query),
    fetch: async (url) => getMockFetchResult(url),
  };
}

/**
 * Créer un service depuis les variables d'environnement
 */
export function createWebSearchServiceFromEnv(env: {
  WEB_SEARCH_PROVIDER?: string;
  WEB_SEARCH_API_KEY?: string;
  TAVILY_API_KEY?: string;
}): WebSearchServiceInterface {
  // Auto-detect provider based on available API keys
  let provider = env.WEB_SEARCH_PROVIDER as WebSearchServiceConfig['provider'];
  let apiKey = env.WEB_SEARCH_API_KEY;

  // If TAVILY_API_KEY is set, use Tavily automatically
  if (!apiKey && env.TAVILY_API_KEY) {
    provider = 'tavily';
    apiKey = env.TAVILY_API_KEY;
  }

  return createWebSearchService({
    provider: provider || 'mock',
    apiKey,
  });
}

/*
 * ============================================================================
 * TOOL HANDLERS
 * ============================================================================
 */

/**
 * Créer les handlers pour les outils web
 */
export function createWebToolHandlers(
  webSearchService?: WebSearchServiceInterface,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  // Fallback to mock service if not provided
  const service = webSearchService || createWebSearchService({ provider: 'mock' });

  return {
    /**
     * Handler pour web_search
     */
    async web_search(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      const query = input.query as string;

      if (!query || query.trim() === '') {
        return {
          success: false,
          output: null,
          error: 'La requête de recherche est requise',
        };
      }

      try {
        const options: WebSearchOptions = {
          numResults: (input.num_results as number) || 5,
          includeDomains: input.include_domains as string[] | undefined,
          excludeDomains: input.exclude_domains as string[] | undefined,
          searchType: input.search_type as WebSearchOptions['searchType'],
        };

        const results = await service.search(query, options);

        // Format results for the agent
        const formattedResults = results.map((r, i) => ({
          position: i + 1,
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          ...(r.publishedDate && { publishedDate: r.publishedDate }),
        }));

        // Generate markdown for easy inclusion in response
        const markdown = results.map((r, i) => `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`).join('\n\n');

        return {
          success: true,
          output: {
            query,
            resultsCount: results.length,
            results: formattedResults,
            markdown,
            serviceAvailable: service.isAvailable(),
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur de recherche: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Handler pour web_fetch
     */
    async web_fetch(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      let url = input.url as string;

      if (!url || url.trim() === '') {
        return {
          success: false,
          output: null,
          error: "L'URL est requise",
        };
      }

      // Upgrade HTTP to HTTPS
      if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
      }

      // Add https if missing
      if (!url.startsWith('https://')) {
        url = `https://${url}`;
      }

      try {
        const result = await service.fetch(url, input.prompt as string | undefined);

        return {
          success: true,
          output: {
            url: result.url,
            title: result.title,
            content: result.content.slice(0, 10000), // Limit content size
            description: result.description,
            contentLength: result.content.length,
            truncated: result.content.length > 10000,
            ...(result.redirectUrl && { redirectUrl: result.redirectUrl }),
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur de récupération: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
