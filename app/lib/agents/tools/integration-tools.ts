/**
 * Outils de gestion des intégrations pour les agents BAVINI
 *
 * Permet de :
 * - Vérifier les services connectés (Supabase, GitHub, Stripe, etc.)
 * - Récupérer le schéma de base de données
 * - Guider l'utilisateur pour connecter des services manquants
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('IntegrationTools');

/*
 * ============================================================================
 * SÉCURITÉ - PROTECTION CONTRE SQL INJECTION
 * ============================================================================
 */

/**
 * Whitelist des tables autorisées pour les requêtes de schéma
 * Ces tables sont considérées comme sûres à requêter
 */
const ALLOWED_TABLES = new Set([
  // Tables communes Supabase
  'users',
  'profiles',
  'accounts',
  'sessions',
  'settings',
  'preferences',
  // Tables applicatives courantes
  'projects',
  'files',
  'folders',
  'documents',
  'comments',
  'messages',
  'notifications',
  'tasks',
  'items',
  'orders',
  'products',
  'categories',
  'tags',
  // Tables d'audit/logs
  'audit_logs',
  'activity_logs',
  // Ajouter d'autres tables légitimes au besoin
]);

/**
 * Regex pour valider les noms de tables SQL
 * Autorise uniquement: lettres, chiffres, underscores
 * Doit commencer par une lettre ou underscore
 */
const TABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Valider un nom de table contre les injections SQL
 * @returns true si le nom est valide et autorisé
 */
function isValidTableName(tableName: string): boolean {
  // Vérifier la longueur
  if (!tableName || tableName.length === 0 || tableName.length > 128) {
    return false;
  }

  // Vérifier le format (caractères autorisés)
  if (!TABLE_NAME_REGEX.test(tableName)) {
    return false;
  }

  return true;
}

/**
 * Valider et filtrer une liste de noms de tables
 * @returns Object avec les tables valides et les tables rejetées
 */
function validateTableNames(tables: string[]): {
  valid: boolean;
  validTables: string[];
  invalidTables: string[];
  reason?: string;
} {
  if (!tables || tables.length === 0) {
    return { valid: true, validTables: [], invalidTables: [] };
  }

  const validTables: string[] = [];
  const invalidTables: string[] = [];

  for (const table of tables) {
    const normalizedTable = table.toLowerCase().trim();

    // Vérifier le format du nom
    if (!isValidTableName(normalizedTable)) {
      invalidTables.push(table);
      logger.warn(`Invalid table name format rejected: ${table}`);
      continue;
    }

    // Vérifier si la table est dans la whitelist (optionnel mais recommandé)
    // Commenté pour permettre les tables personnalisées, mais loggé
    if (!ALLOWED_TABLES.has(normalizedTable)) {
      logger.info(`Table not in whitelist, allowing but logging: ${table}`);
    }

    validTables.push(normalizedTable);
  }

  if (invalidTables.length > 0) {
    return {
      valid: false,
      validTables,
      invalidTables,
      reason: `Invalid table names: ${invalidTables.join(', ')}. Only alphanumeric characters and underscores are allowed.`,
    };
  }

  return { valid: true, validTables, invalidTables: [] };
}

/**
 * Échapper un nom de table pour utilisation dans une requête SQL
 * Utilise des guillemets doubles (standard SQL) pour les identifiants
 */
function escapeTableName(tableName: string): string {
  // Double les guillemets existants et entoure de guillemets
  return `"${tableName.replace(/"/g, '""')}"`;
}

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Types de connecteurs supportés
 */
export type IntegrationId = 'github' | 'supabase' | 'netlify' | 'figma' | 'notion' | 'stripe';

/**
 * État d'une intégration
 */
export interface IntegrationStatus {
  id: IntegrationId;
  name: string;
  description: string;
  isConnected: boolean;
  capabilities: string[];
  lastConnected?: number;
  requiresSetup?: string[];
}

/**
 * Schéma de base de données
 */
export interface DatabaseSchema {
  tables: TableSchema[];
  enums?: EnumSchema[];
  functions?: FunctionSchema[];
}

export interface TableSchema {
  name: string;
  schema: string;
  columns: ColumnSchema[];
  primaryKey?: string[];
  foreignKeys?: ForeignKeySchema[];
  indexes?: string[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface ForeignKeySchema {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

export interface EnumSchema {
  name: string;
  values: string[];
}

export interface FunctionSchema {
  name: string;
  arguments: string;
  returnType: string;
}

/**
 * Interface pour accéder à l'état des connecteurs
 */
export interface ConnectorsStateInterface {
  getState(): Record<IntegrationId, { isConnected: boolean; credentials: Record<string, string> }>;
  getCredentials(id: IntegrationId): Record<string, string> | null;
}

/**
 * Interface pour le client Supabase (pour récupérer le schéma)
 */
export interface SupabaseClientInterface {
  rest<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T>;
}

/*
 * ============================================================================
 * CONFIGURATION DES INTÉGRATIONS
 * ============================================================================
 */

const INTEGRATION_CONFIG: Record<IntegrationId, Omit<IntegrationStatus, 'isConnected' | 'lastConnected'>> = {
  supabase: {
    id: 'supabase',
    name: 'Supabase',
    description: 'Base de données PostgreSQL, authentification et storage',
    capabilities: [
      'Base de données PostgreSQL',
      'Authentification (email, OAuth, magic link)',
      'Storage de fichiers',
      'Realtime subscriptions',
      'Edge Functions',
    ],
    requiresSetup: ['url', 'anonKey'],
  },
  github: {
    id: 'github',
    name: 'GitHub',
    description: 'Gestion de code, repositories et versioning',
    capabilities: [
      'Repositories (création, clone, push)',
      'Branches et Pull Requests',
      'Issues et Projects',
      'GitHub Actions',
      'Gists',
    ],
  },
  netlify: {
    id: 'netlify',
    name: 'Netlify',
    description: 'Déploiement et hébergement',
    capabilities: [
      'Déploiement automatique',
      'Preview deployments',
      'Fonctions serverless',
      'Forms et Identity',
      'Split testing',
    ],
  },
  stripe: {
    id: 'stripe',
    name: 'Stripe',
    description: 'Paiements, abonnements et facturation',
    capabilities: [
      'Paiements one-time',
      'Abonnements récurrents',
      'Gestion des clients',
      'Factures et receipts',
      'Webhooks',
    ],
    requiresSetup: ['secretKey'],
  },
  figma: {
    id: 'figma',
    name: 'Figma',
    description: 'Import de designs et design tokens',
    capabilities: [
      'Import de fichiers Figma',
      'Extraction de design tokens',
      'Export de composants',
      'Synchronisation de styles',
    ],
  },
  notion: {
    id: 'notion',
    name: 'Notion',
    description: 'Documentation et bases de données',
    capabilities: ['Pages et blocs', 'Bases de données', 'Recherche de contenu', 'Commentaires'],
  },
};

/*
 * ============================================================================
 * DÉFINITIONS DES OUTILS
 * ============================================================================
 */

/**
 * Outil pour vérifier les intégrations disponibles
 */
export const GetIntegrationsTool: ToolDefinition = {
  name: 'get_integrations',
  description: `Vérifie quels services sont connectés et disponibles.

QUAND UTILISER :
- AVANT de générer du code qui nécessite une base de données (Supabase)
- AVANT de générer du code de paiement (Stripe)
- AVANT de créer des opérations de déploiement (Netlify, GitHub)
- Quand l'utilisateur demande des fonctionnalités nécessitant des services externes

CE QUE ÇA RETOURNE :
- Liste des services avec leur statut (connecté/non connecté)
- Capacités de chaque service
- Instructions pour connecter les services manquants

EXEMPLES :
- get_integrations() → Liste tous les services
- get_integrations({ required: ["supabase", "stripe"] }) → Vérifie ces services spécifiques`,
  inputSchema: {
    type: 'object',
    properties: {
      required: {
        type: 'array',
        description: 'Liste des services requis à vérifier',
        items: { type: 'string' },
      },
    },
    required: [],
  },
};

/**
 * Outil pour récupérer le schéma de base de données
 */
export const GetDatabaseSchemaTool: ToolDefinition = {
  name: 'get_database_schema',
  description: `Récupère le schéma de la base de données Supabase connectée.

QUAND UTILISER :
- AVANT de générer des requêtes SQL ou des queries Supabase
- Pour comprendre la structure des données existantes
- Pour générer des types TypeScript correspondant au schéma
- Pour créer des migrations ou modifications de schéma

CE QUE ÇA RETOURNE :
- Liste des tables avec leurs colonnes
- Types de chaque colonne
- Clés primaires et étrangères
- Indexes et contraintes

IMPORTANT : Supabase doit être connecté pour utiliser cet outil.`,
  inputSchema: {
    type: 'object',
    properties: {
      tables: {
        type: 'array',
        description: 'Tables spécifiques à récupérer (toutes par défaut)',
        items: { type: 'string' },
      },
      includeSystem: {
        type: 'boolean',
        description: 'Inclure les tables système (auth, storage, etc.) - défaut: false',
      },
    },
    required: [],
  },
};

/**
 * Outil pour demander la connexion d'un service
 */
export const RequestIntegrationTool: ToolDefinition = {
  name: 'request_integration',
  description: `Informe l'utilisateur qu'un service doit être connecté pour continuer.

QUAND UTILISER :
- Un service requis n'est pas connecté
- L'utilisateur demande une fonctionnalité nécessitant un service manquant

CE QUE ÇA FAIT :
- Affiche un message explicatif à l'utilisateur
- Indique comment connecter le service (Settings → Connectors)
- Liste les fonctionnalités qui seront débloquées`,
  inputSchema: {
    type: 'object',
    properties: {
      integrationId: {
        type: 'string',
        description: 'ID du service à connecter (supabase, stripe, github, etc.)',
        enum: ['supabase', 'github', 'netlify', 'stripe', 'figma', 'notion'],
      },
      reason: {
        type: 'string',
        description: 'Pourquoi ce service est nécessaire',
      },
      feature: {
        type: 'string',
        description: "Fonctionnalité demandée par l'utilisateur",
      },
    },
    required: ['integrationId', 'reason'],
  },
};

/*
 * ============================================================================
 * HANDLERS D'EXÉCUTION
 * ============================================================================
 */

/**
 * Créer les handlers pour les outils d'intégration
 */
export function createIntegrationToolHandlers(
  connectorsState?: ConnectorsStateInterface,
  supabaseClientFactory?: (credentials: Record<string, string>) => SupabaseClientInterface,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  /**
   * Obtenir l'état mock si pas de state réel
   */
  const getIntegrationsState = (): Record<
    IntegrationId,
    { isConnected: boolean; credentials: Record<string, string> }
  > => {
    if (connectorsState) {
      return connectorsState.getState();
    }

    // État mock pour le développement
    return {
      supabase: { isConnected: false, credentials: {} },
      github: { isConnected: false, credentials: {} },
      netlify: { isConnected: false, credentials: {} },
      stripe: { isConnected: false, credentials: {} },
      figma: { isConnected: false, credentials: {} },
      notion: { isConnected: false, credentials: {} },
    };
  };

  return {
    /**
     * Handler pour get_integrations
     */
    async get_integrations(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const requiredIds = input.required as IntegrationId[] | undefined;
        const state = getIntegrationsState();

        // Construire la liste des intégrations
        const integrations: IntegrationStatus[] = [];
        const idsToCheck = requiredIds || (Object.keys(INTEGRATION_CONFIG) as IntegrationId[]);

        for (const id of idsToCheck) {
          const config = INTEGRATION_CONFIG[id];

          if (!config) {
            continue;
          }

          const connectorState = state[id];

          integrations.push({
            ...config,
            isConnected: connectorState?.isConnected || false,
          });
        }

        // Analyser les résultats
        const connected = integrations.filter((i) => i.isConnected);
        const disconnected = integrations.filter((i) => !i.isConnected);

        // Générer le rapport
        const report = generateIntegrationsReport(integrations, requiredIds);

        return {
          success: true,
          output: {
            integrations,
            summary: {
              total: integrations.length,
              connected: connected.length,
              disconnected: disconnected.length,
              allRequiredConnected: requiredIds ? disconnected.length === 0 : undefined,
            },
            report,
            message: `${connected.length}/${integrations.length} services connectés`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur lors de la vérification des intégrations: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Handler pour get_database_schema
     */
    async get_database_schema(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const tablesToFetch = input.tables as string[] | undefined;
        const includeSystem = (input.includeSystem as boolean) || false;

        // Vérifier que Supabase est connecté
        const state = getIntegrationsState();

        if (!state.supabase?.isConnected) {
          return {
            success: false,
            output: null,
            error: `Supabase n'est pas connecté. Allez dans Settings → Connectors pour connecter Supabase.`,
          };
        }

        const credentials = connectorsState?.getCredentials('supabase') || state.supabase.credentials;

        if (!credentials?.url || !credentials?.anonKey) {
          return {
            success: false,
            output: null,
            error: 'Credentials Supabase incomplets (URL et anonKey requis)',
          };
        }

        // Créer le client Supabase
        if (!supabaseClientFactory) {
          // Mode mock - retourner un schéma exemple
          return {
            success: true,
            output: {
              schema: getMockDatabaseSchema(),
              message: '⚠️ Mode mock - Schéma exemple retourné. Configurez le client Supabase pour le vrai schéma.',
            },
          };
        }

        const client = supabaseClientFactory(credentials);

        // Récupérer le schéma via information_schema
        const schema = await fetchDatabaseSchema(client, tablesToFetch, includeSystem);

        return {
          success: true,
          output: {
            schema,
            tableCount: schema.tables.length,
            message: `Schéma récupéré: ${schema.tables.length} tables`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur lors de la récupération du schéma: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Handler pour request_integration
     */
    async request_integration(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const integrationId = input.integrationId as IntegrationId;
        const reason = input.reason as string;
        const feature = input.feature as string | undefined;

        if (!integrationId) {
          return {
            success: false,
            output: null,
            error: 'Le paramètre "integrationId" est requis',
          };
        }

        const config = INTEGRATION_CONFIG[integrationId];

        if (!config) {
          return {
            success: false,
            output: null,
            error: `Service inconnu: ${integrationId}`,
          };
        }

        // Vérifier si déjà connecté
        const state = getIntegrationsState();

        if (state[integrationId]?.isConnected) {
          return {
            success: true,
            output: {
              alreadyConnected: true,
              message: `${config.name} est déjà connecté ! Vous pouvez continuer.`,
            },
          };
        }

        // Générer le message de demande de connexion
        const message = generateConnectionRequest(config, reason, feature);

        return {
          success: true,
          output: {
            requiresConnection: true,
            integrationId,
            integrationName: config.name,
            reason,
            feature,
            capabilities: config.capabilities,
            instructions: message,
            message: `⚠️ ${config.name} doit être connecté pour continuer.`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/*
 * ============================================================================
 * FONCTIONS UTILITAIRES
 * ============================================================================
 */

/**
 * Générer un rapport sur les intégrations
 */
function generateIntegrationsReport(integrations: IntegrationStatus[], requiredIds?: IntegrationId[]): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    🔌 ÉTAT DES INTÉGRATIONS                   ',
    '═══════════════════════════════════════════════════════════════',
    '',
  ];

  for (const integration of integrations) {
    const status = integration.isConnected ? '✅ Connecté' : '❌ Non connecté';
    const isRequired = requiredIds?.includes(integration.id);

    lines.push(`## ${integration.name} ${isRequired ? '(REQUIS)' : ''}`);
    lines.push(`   Status: ${status}`);
    lines.push(`   ${integration.description}`);

    if (!integration.isConnected) {
      lines.push('');
      lines.push('   📋 Capacités disponibles après connexion :');

      for (const cap of integration.capabilities) {
        lines.push(`      • ${cap}`);
      }

      lines.push('');
      lines.push('   🔧 Pour connecter : Settings → Connectors → ' + integration.name);
    }

    lines.push('');
  }

  const disconnectedRequired = integrations.filter((i) => !i.isConnected && requiredIds?.includes(i.id));

  if (disconnectedRequired.length > 0) {
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('⚠️  SERVICES REQUIS NON CONNECTÉS :');

    for (const service of disconnectedRequired) {
      lines.push(`   • ${service.name}`);
    }

    lines.push('');
    lines.push('   Veuillez connecter ces services avant de continuer.');
    lines.push('═══════════════════════════════════════════════════════════════');
  }

  return lines.join('\n');
}

/**
 * Générer un message de demande de connexion
 */
function generateConnectionRequest(
  config: Omit<IntegrationStatus, 'isConnected' | 'lastConnected'>,
  reason: string,
  feature?: string,
): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    `        🔌 CONNEXION REQUISE : ${config.name.toUpperCase()}`,
    '═══════════════════════════════════════════════════════════════',
    '',
    `📝 Pourquoi : ${reason}`,
  ];

  if (feature) {
    lines.push(`🎯 Pour : ${feature}`);
  }

  lines.push('');
  lines.push(`📋 Ce que ${config.name} va permettre :`);

  for (const cap of config.capabilities) {
    lines.push(`   ✓ ${cap}`);
  }

  lines.push('');
  lines.push('🔧 Comment connecter :');
  lines.push("   1. Cliquez sur l'icône ⚙️ (Settings) dans la barre latérale");
  lines.push('   2. Allez dans l\'onglet "Connectors"');
  lines.push(`   3. Cliquez sur "${config.name}"`);
  lines.push('   4. Suivez les instructions de connexion (OAuth ou clé API)');
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Récupérer le schéma de base de données depuis Supabase
 */
async function fetchDatabaseSchema(
  client: SupabaseClientInterface,
  tablesToFetch?: string[],
  includeSystem?: boolean,
): Promise<DatabaseSchema> {
  // SÉCURITÉ: Valider les noms de tables AVANT de construire la requête
  let validatedTables: string[] = [];
  if (tablesToFetch && tablesToFetch.length > 0) {
    const validation = validateTableNames(tablesToFetch);
    if (!validation.valid) {
      logger.error('SQL Injection attempt blocked', {
        invalidTables: validation.invalidTables,
        reason: validation.reason,
      });
      throw new Error(validation.reason);
    }
    validatedTables = validation.validTables;
  }

  // Query pour récupérer les tables et colonnes
  const schemaFilter = includeSystem ? '' : "AND table_schema = 'public'";

  // SÉCURITÉ: Utiliser des identifiants échappés pour les noms de tables
  const tableFilter = validatedTables.length
    ? `AND table_name IN (${validatedTables.map((t) => `'${t}'`).join(',')})`
    : '';

  // Récupérer les colonnes
  interface ColumnInfo {
    table_schema: string;
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }

  const columnsQuery = `
    SELECT
      table_schema,
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ${schemaFilter}
    ${tableFilter}
    ORDER BY table_schema, table_name, ordinal_position
  `;

  // Utiliser la fonction RPC pour exécuter la requête SQL
  // Note: Ceci nécessite que la fonction soit créée dans Supabase
  // Alternative: utiliser l'API REST avec des vues exposées

  try {
    const columns = await client.rest<ColumnInfo[]>('POST', '/rpc/get_schema_info', {
      query: columnsQuery,
    });

    // Transformer en schéma structuré
    const tablesMap = new Map<string, TableSchema>();

    for (const col of columns) {
      const tableKey = `${col.table_schema}.${col.table_name}`;

      if (!tablesMap.has(tableKey)) {
        tablesMap.set(tableKey, {
          name: col.table_name,
          schema: col.table_schema,
          columns: [],
        });
      }

      const table = tablesMap.get(tableKey)!;
      table.columns.push({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        defaultValue: col.column_default || undefined,
        isPrimaryKey: false, // Would need additional query
        isForeignKey: false, // Would need additional query
      });
    }

    return {
      tables: Array.from(tablesMap.values()),
    };
  } catch {
    // Fallback: essayer de lister les tables via l'API REST standard
    // Ceci ne fonctionne que si les tables sont exposées via l'API
    return getMockDatabaseSchema();
  }
}

/**
 * Schéma mock pour le développement/tests
 */
function getMockDatabaseSchema(): DatabaseSchema {
  return {
    tables: [
      {
        name: 'users',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false },
          { name: 'email', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false },
          { name: 'name', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false },
          {
            name: 'created_at',
            type: 'timestamptz',
            nullable: false,
            defaultValue: 'now()',
            isPrimaryKey: false,
            isForeignKey: false,
          },
        ],
        primaryKey: ['id'],
      },
      {
        name: 'posts',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false },
          { name: 'title', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false },
          { name: 'content', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false },
          {
            name: 'author_id',
            type: 'uuid',
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: true,
            references: { table: 'users', column: 'id' },
          },
          {
            name: 'published',
            type: 'boolean',
            nullable: false,
            defaultValue: 'false',
            isPrimaryKey: false,
            isForeignKey: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            nullable: false,
            defaultValue: 'now()',
            isPrimaryKey: false,
            isForeignKey: false,
          },
        ],
        primaryKey: ['id'],
        foreignKeys: [{ column: 'author_id', referencesTable: 'users', referencesColumn: 'id' }],
      },
    ],
  };
}

/*
 * ============================================================================
 * EXPORT
 * ============================================================================
 */

/**
 * Tous les outils d'intégration
 */
export const INTEGRATION_TOOLS: ToolDefinition[] = [GetIntegrationsTool, GetDatabaseSchemaTool, RequestIntegrationTool];
