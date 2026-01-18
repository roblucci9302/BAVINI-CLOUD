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
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebTools');

/*
 * ============================================================================
 * SÉCURITÉ - PROTECTION CONTRE SSRF
 * ============================================================================
 */

/**
 * Hosts bloqués pour prévenir les attaques SSRF
 * Inclut localhost, les adresses de loopback et les métadonnées cloud
 */
const BLOCKED_HOSTS = new Set([
  // Localhost et loopback
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '0',

  // Métadonnées cloud (AWS, GCP, Azure)
  '169.254.169.254', // AWS EC2 metadata
  'metadata.google.internal', // GCP metadata
  'metadata.google.com',
  '169.254.169.253', // AWS ECS task metadata
  'fd00:ec2::254', // AWS IMDSv6

  // Kubernetes
  'kubernetes.default.svc',
  'kubernetes.default',
  'kubernetes',

  // Docker
  'host.docker.internal',
  'gateway.docker.internal',

  // Autres
  '[::1]',
  '[::]',
]);

/**
 * Patterns regex pour les plages d'IP privées/réservées
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  // IPv4 privées
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // 192.168.0.0/16

  // Loopback
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // 127.0.0.0/8

  // Link-local
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // 169.254.0.0/16

  // Réservées/Non-routables
  /^0\./, // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d|127)\.\d{1,3}\.\d{1,3}$/, // 100.64.0.0/10 (CGN)
  /^192\.0\.0\./, // 192.0.0.0/24
  /^192\.0\.2\./, // 192.0.2.0/24 (TEST-NET-1)
  /^198\.51\.100\./, // 198.51.100.0/24 (TEST-NET-2)
  /^203\.0\.113\./, // 203.0.113.0/24 (TEST-NET-3)
  /^224\./, // 224.0.0.0/4 (Multicast)
  /^240\./, // 240.0.0.0/4 (Reserved)
  /^255\./, // 255.0.0.0/8

  // IPv6 privées/réservées (formats courants dans les URLs)
  /^\[?fe80:/i, // Link-local
  /^\[?fc00:/i, // Unique local
  /^\[?fd00:/i, // Unique local
  /^\[?::1\]?$/, // Loopback
  /^\[?::\]?$/, // Unspecified
];

/**
 * Schémas d'URL bloqués
 */
const BLOCKED_SCHEMES = new Set(['file', 'ftp', 'sftp', 'ssh', 'telnet', 'gopher', 'dict', 'ldap', 'ldaps']);

/**
 * Vérifier si une URL doit être bloquée pour des raisons de sécurité
 * @returns { blocked: boolean, reason?: string }
 */
function isBlockedUrl(url: string): { blocked: boolean; reason?: string } {
  try {
    // Décoder l'URL pour éviter les bypasses via encodage
    const decodedUrl = decodeURIComponent(url);

    // Parser l'URL
    const parsedUrl = new URL(decodedUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const protocol = parsedUrl.protocol.replace(':', '').toLowerCase();

    // Vérifier le schéma
    if (BLOCKED_SCHEMES.has(protocol)) {
      logger.warn('Blocked URL - Forbidden scheme', { url, protocol });
      return { blocked: true, reason: `Protocol "${protocol}" is not allowed for security reasons` };
    }

    // Autoriser uniquement HTTP et HTTPS
    if (protocol !== 'http' && protocol !== 'https') {
      logger.warn('Blocked URL - Non-HTTP scheme', { url, protocol });
      return { blocked: true, reason: `Only HTTP and HTTPS protocols are allowed` };
    }

    // Vérifier les hosts bloqués
    if (BLOCKED_HOSTS.has(hostname)) {
      logger.warn('SSRF attempt blocked - Blocked host', { url, hostname });
      return { blocked: true, reason: `Access to "${hostname}" is blocked for security reasons` };
    }

    // Vérifier si c'est une IP privée
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        logger.warn('SSRF attempt blocked - Private IP', { url, hostname });
        return { blocked: true, reason: `Access to private/internal IP addresses is not allowed` };
      }
    }

    // Vérifier les sous-domaines de localhost (ex: foo.localhost)
    if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      logger.warn('SSRF attempt blocked - Local domain', { url, hostname });
      return { blocked: true, reason: `Access to local domains is not allowed` };
    }

    // Vérifier les redirections DNS rebinding (hostname avec port inhabituel sur localhost)
    // et les bypass via @user:pass@host
    if (parsedUrl.username || parsedUrl.password) {
      logger.warn('SSRF attempt blocked - URL with credentials', { url });
      return { blocked: true, reason: `URLs with embedded credentials are not allowed` };
    }

    // Vérifier si le hostname ressemble à une IP (pour attraper les bypass via encodage)
    const ipBypassPatterns = [
      /^0x[0-9a-f]+$/i, // Hex IP: 0x7f000001
      /^\d+$/, // Decimal IP: 2130706433
      /^0\d+/, // Octal IP: 0177.0.0.1
    ];

    for (const pattern of ipBypassPatterns) {
      if (pattern.test(hostname)) {
        logger.warn('SSRF attempt blocked - IP encoding bypass', { url, hostname });
        return { blocked: true, reason: `Suspicious hostname format detected` };
      }
    }

    return { blocked: false };
  } catch (error) {
    // Si l'URL ne peut pas être parsée, la bloquer par sécurité
    logger.error('URL parsing error', { url, error: error instanceof Error ? error.message : String(error) });
    return { blocked: true, reason: `Invalid URL format` };
  }
}

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

      // SÉCURITÉ: Vérifier les attaques SSRF AVANT de faire la requête
      const ssrfCheck = isBlockedUrl(url);
      if (ssrfCheck.blocked) {
        logger.warn('SSRF protection: Request blocked', { url, reason: ssrfCheck.reason });
        return {
          success: false,
          output: null,
          error: `Security: ${ssrfCheck.reason}`,
        };
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
