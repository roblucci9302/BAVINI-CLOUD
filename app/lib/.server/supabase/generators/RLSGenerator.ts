/**
 * RLSGenerator - Génération automatique de politiques Row Level Security
 *
 * Ce module génère des politiques RLS pour Supabase basées sur
 * des patterns prédéfinis et l'analyse du schéma de données.
 */

import type { Schema, Table, Column, RLSPolicy, RLSAction, RLSPattern, RLSPatternConfig } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RLSGenerator');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface RLSGeneratorOptions {
  defaultPattern?: RLSPattern;
  enablePublicRead?: boolean;
  requireAuth?: boolean;
  customOwnerColumn?: string;
  customTeamColumn?: string;
}

export interface RLSGenerationResult {
  policies: RLSPolicy[];
  sql: string;
  warnings: string[];
  tablesWithoutRLS: string[];
}

export interface TableRLSConfig {
  table: string;
  pattern: RLSPattern;
  ownerColumn?: string;
  teamColumn?: string;
  customPolicies?: RLSPolicy[];
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<RLSGeneratorOptions> = {
  defaultPattern: 'ownerOnly',
  enablePublicRead: false,
  requireAuth: true,
  customOwnerColumn: 'user_id',
  customTeamColumn: 'team_id',
};

// Colonnes typiques pour identifier le propriétaire
const OWNER_COLUMN_PATTERNS = ['user_id', 'owner_id', 'author_id', 'created_by', 'creator_id'];

// Colonnes typiques pour identifier l'équipe
const TEAM_COLUMN_PATTERNS = ['team_id', 'organization_id', 'org_id', 'workspace_id', 'company_id'];

/*
 * =============================================================================
 * RLSGenerator Class
 * =============================================================================
 */

export class RLSGenerator {
  private options: Required<RLSGeneratorOptions>;

  constructor(options: RLSGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Génère les politiques RLS pour un schéma complet
   */
  generate(schema: Schema, configs?: TableRLSConfig[]): RLSGenerationResult {
    logger.info('Generating RLS policies', { tableCount: schema.tables.length });

    const policies: RLSPolicy[] = [];
    const warnings: string[] = [];
    const tablesWithoutRLS: string[] = [];
    const configMap = new Map(configs?.map((c) => [c.table, c]));

    for (const table of schema.tables) {
      const config = configMap.get(table.name);
      const tablePolicies = this.generateTablePolicies(table, config);

      if (tablePolicies.policies.length === 0) {
        tablesWithoutRLS.push(table.name);
        warnings.push(`Table "${table.name}" n'a pas de politiques RLS générées`);
      } else {
        policies.push(...tablePolicies.policies);
        warnings.push(...tablePolicies.warnings);
      }
    }

    const sql = this.generateSQL(policies, schema.tables);

    logger.info('RLS generation complete', {
      policyCount: policies.length,
      tablesWithoutRLS: tablesWithoutRLS.length,
    });

    return { policies, sql, warnings, tablesWithoutRLS };
  }

  /**
   * Génère les politiques pour une table spécifique
   */
  generateTablePolicies(table: Table, config?: TableRLSConfig): { policies: RLSPolicy[]; warnings: string[] } {
    const policies: RLSPolicy[] = [];
    const warnings: string[] = [];

    // Utiliser la config fournie ou détecter automatiquement
    const pattern = config?.pattern || this.detectPattern(table);
    const ownerColumn = config?.ownerColumn || this.detectOwnerColumn(table);
    const teamColumn = config?.teamColumn || this.detectTeamColumn(table);

    logger.debug('Generating policies for table', {
      table: table.name,
      pattern,
      ownerColumn,
      teamColumn,
    });

    // Ajouter les politiques personnalisées si fournies
    if (config?.customPolicies) {
      policies.push(...config.customPolicies);
    }

    // Générer les politiques selon le pattern
    switch (pattern) {
      case 'ownerOnly':
        policies.push(...this.generateOwnerOnlyPolicies(table, ownerColumn));

        if (!ownerColumn) {
          warnings.push(`Table "${table.name}": pattern ownerOnly sans colonne propriétaire détectée`);
        }

        break;

      case 'publicReadOwnerWrite':
        policies.push(...this.generatePublicReadOwnerWritePolicies(table, ownerColumn));
        break;

      case 'teamBased':
        policies.push(...this.generateTeamBasedPolicies(table, teamColumn, ownerColumn));

        if (!teamColumn) {
          warnings.push(`Table "${table.name}": pattern teamBased sans colonne équipe détectée`);
        }

        break;

      case 'adminOnly':
        policies.push(...this.generateAdminOnlyPolicies(table));
        break;

      case 'authenticated':
        policies.push(...this.generateAuthenticatedPolicies(table));
        break;

      case 'public':
        policies.push(...this.generatePublicPolicies(table));
        warnings.push(`Table "${table.name}": pattern public - aucune restriction d'accès`);
        break;
    }

    return { policies, warnings };
  }

  /**
   * Génère les politiques pour le pattern ownerOnly
   * Seul le propriétaire peut lire/écrire ses propres données
   */
  private generateOwnerOnlyPolicies(table: Table, ownerColumn?: string): RLSPolicy[] {
    const col = ownerColumn || 'user_id';
    const policies: RLSPolicy[] = [];

    // SELECT: propriétaire uniquement
    policies.push({
      name: `${table.name}_select_owner`,
      table: table.name,
      action: 'SELECT',
      roles: ['authenticated'],
      using: `${col} = auth.uid()`,
      permissive: true,
    });

    // INSERT: l'utilisateur doit être le propriétaire
    policies.push({
      name: `${table.name}_insert_owner`,
      table: table.name,
      action: 'INSERT',
      roles: ['authenticated'],
      check: `${col} = auth.uid()`,
      permissive: true,
    });

    // UPDATE: propriétaire uniquement
    policies.push({
      name: `${table.name}_update_owner`,
      table: table.name,
      action: 'UPDATE',
      roles: ['authenticated'],
      using: `${col} = auth.uid()`,
      check: `${col} = auth.uid()`,
      permissive: true,
    });

    // DELETE: propriétaire uniquement
    policies.push({
      name: `${table.name}_delete_owner`,
      table: table.name,
      action: 'DELETE',
      roles: ['authenticated'],
      using: `${col} = auth.uid()`,
      permissive: true,
    });

    return policies;
  }

  /**
   * Génère les politiques pour le pattern publicReadOwnerWrite
   * Tout le monde peut lire, seul le propriétaire peut écrire
   */
  private generatePublicReadOwnerWritePolicies(table: Table, ownerColumn?: string): RLSPolicy[] {
    const col = ownerColumn || 'user_id';
    const policies: RLSPolicy[] = [];

    // SELECT: public
    policies.push({
      name: `${table.name}_select_public`,
      table: table.name,
      action: 'SELECT',
      roles: ['anon', 'authenticated'],
      using: 'true',
      permissive: true,
    });

    // INSERT: utilisateur authentifié comme propriétaire
    policies.push({
      name: `${table.name}_insert_owner`,
      table: table.name,
      action: 'INSERT',
      roles: ['authenticated'],
      check: `${col} = auth.uid()`,
      permissive: true,
    });

    // UPDATE: propriétaire uniquement
    policies.push({
      name: `${table.name}_update_owner`,
      table: table.name,
      action: 'UPDATE',
      roles: ['authenticated'],
      using: `${col} = auth.uid()`,
      check: `${col} = auth.uid()`,
      permissive: true,
    });

    // DELETE: propriétaire uniquement
    policies.push({
      name: `${table.name}_delete_owner`,
      table: table.name,
      action: 'DELETE',
      roles: ['authenticated'],
      using: `${col} = auth.uid()`,
      permissive: true,
    });

    return policies;
  }

  /**
   * Génère les politiques pour le pattern teamBased
   * Les membres d'une équipe peuvent accéder aux données de l'équipe
   */
  private generateTeamBasedPolicies(table: Table, teamColumn?: string, ownerColumn?: string): RLSPolicy[] {
    const teamCol = teamColumn || 'team_id';
    const ownerCol = ownerColumn || 'user_id';
    const policies: RLSPolicy[] = [];

    // Fonction helper pour vérifier l'appartenance à l'équipe
    const teamCheck = `${teamCol} IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())`;

    // SELECT: membres de l'équipe
    policies.push({
      name: `${table.name}_select_team`,
      table: table.name,
      action: 'SELECT',
      roles: ['authenticated'],
      using: teamCheck,
      permissive: true,
    });

    // INSERT: membres de l'équipe
    policies.push({
      name: `${table.name}_insert_team`,
      table: table.name,
      action: 'INSERT',
      roles: ['authenticated'],
      check: teamCheck,
      permissive: true,
    });

    // UPDATE: membres de l'équipe (ou propriétaire selon config)
    policies.push({
      name: `${table.name}_update_team`,
      table: table.name,
      action: 'UPDATE',
      roles: ['authenticated'],
      using: teamCheck,
      check: teamCheck,
      permissive: true,
    });

    // DELETE: propriétaire ou admin de l'équipe
    policies.push({
      name: `${table.name}_delete_owner`,
      table: table.name,
      action: 'DELETE',
      roles: ['authenticated'],
      using: `${ownerCol} = auth.uid() OR (${teamCheck} AND EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND role = 'admin'))`,
      permissive: true,
    });

    return policies;
  }

  /**
   * Génère les politiques pour le pattern adminOnly
   * Seuls les administrateurs peuvent accéder aux données
   */
  private generateAdminOnlyPolicies(table: Table): RLSPolicy[] {
    const adminCheck = `auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'user_role' = 'admin'`;

    return [
      {
        name: `${table.name}_admin_all`,
        table: table.name,
        action: 'ALL',
        roles: ['authenticated'],
        using: adminCheck,
        check: adminCheck,
        permissive: true,
      },
    ];
  }

  /**
   * Génère les politiques pour le pattern authenticated
   * Tous les utilisateurs authentifiés peuvent accéder aux données
   */
  private generateAuthenticatedPolicies(table: Table): RLSPolicy[] {
    return [
      {
        name: `${table.name}_authenticated_select`,
        table: table.name,
        action: 'SELECT',
        roles: ['authenticated'],
        using: 'true',
        permissive: true,
      },
      {
        name: `${table.name}_authenticated_insert`,
        table: table.name,
        action: 'INSERT',
        roles: ['authenticated'],
        check: 'true',
        permissive: true,
      },
      {
        name: `${table.name}_authenticated_update`,
        table: table.name,
        action: 'UPDATE',
        roles: ['authenticated'],
        using: 'true',
        check: 'true',
        permissive: true,
      },
      {
        name: `${table.name}_authenticated_delete`,
        table: table.name,
        action: 'DELETE',
        roles: ['authenticated'],
        using: 'true',
        permissive: true,
      },
    ];
  }

  /**
   * Génère les politiques pour le pattern public
   * Aucune restriction - accès public complet
   */
  private generatePublicPolicies(table: Table): RLSPolicy[] {
    return [
      {
        name: `${table.name}_public_select`,
        table: table.name,
        action: 'SELECT',
        roles: ['anon', 'authenticated'],
        using: 'true',
        permissive: true,
      },
      {
        name: `${table.name}_public_insert`,
        table: table.name,
        action: 'INSERT',
        roles: ['anon', 'authenticated'],
        check: 'true',
        permissive: true,
      },
      {
        name: `${table.name}_public_update`,
        table: table.name,
        action: 'UPDATE',
        roles: ['anon', 'authenticated'],
        using: 'true',
        check: 'true',
        permissive: true,
      },
      {
        name: `${table.name}_public_delete`,
        table: table.name,
        action: 'DELETE',
        roles: ['anon', 'authenticated'],
        using: 'true',
        permissive: true,
      },
    ];
  }

  /**
   * Détecte le pattern RLS approprié basé sur la structure de la table
   */
  private detectPattern(table: Table): RLSPattern {
    const hasOwnerColumn = this.detectOwnerColumn(table) !== undefined;
    const hasTeamColumn = this.detectTeamColumn(table) !== undefined;

    // Tables de jonction (M-N) - généralement teamBased ou authenticated
    if (this.isJunctionTable(table)) {
      return hasTeamColumn ? 'teamBased' : 'authenticated';
    }

    // Tables avec équipe
    if (hasTeamColumn) {
      return 'teamBased';
    }

    // Tables avec propriétaire
    if (hasOwnerColumn) {
      // Si la table a un champ "published" ou "public", utiliser publicReadOwnerWrite
      const hasPublicField = table.columns.some((c) =>
        ['published', 'is_public', 'public', 'visible'].includes(c.name),
      );
      return hasPublicField ? 'publicReadOwnerWrite' : 'ownerOnly';
    }

    // Tables de référence (lookups) - généralement publiques en lecture
    if (this.isLookupTable(table)) {
      return 'authenticated';
    }

    // Par défaut: ownerOnly si requireAuth, sinon authenticated
    return this.options.requireAuth ? 'ownerOnly' : 'authenticated';
  }

  /**
   * Détecte la colonne propriétaire d'une table
   */
  private detectOwnerColumn(table: Table): string | undefined {
    // Chercher d'abord la colonne personnalisée
    if (this.options.customOwnerColumn) {
      const customCol = table.columns.find((c) => c.name === this.options.customOwnerColumn);

      if (customCol) {
        return customCol.name;
      }
    }

    // Chercher les patterns courants
    for (const pattern of OWNER_COLUMN_PATTERNS) {
      const col = table.columns.find((c) => c.name === pattern);

      if (col) {
        return col.name;
      }
    }

    // Chercher les FK vers une table users
    const userFk = table.columns.find((c) => c.isForeignKey && c.references?.table === 'users');

    if (userFk) {
      return userFk.name;
    }

    return undefined;
  }

  /**
   * Détecte la colonne équipe d'une table
   */
  private detectTeamColumn(table: Table): string | undefined {
    // Chercher d'abord la colonne personnalisée
    if (this.options.customTeamColumn) {
      const customCol = table.columns.find((c) => c.name === this.options.customTeamColumn);

      if (customCol) {
        return customCol.name;
      }
    }

    // Chercher les patterns courants
    for (const pattern of TEAM_COLUMN_PATTERNS) {
      const col = table.columns.find((c) => c.name === pattern);

      if (col) {
        return col.name;
      }
    }

    // Chercher les FK vers une table teams/organizations
    const teamFk = table.columns.find(
      (c) =>
        c.isForeignKey &&
        (c.references?.table === 'teams' ||
          c.references?.table === 'organizations' ||
          c.references?.table === 'workspaces'),
    );

    if (teamFk) {
      return teamFk.name;
    }

    return undefined;
  }

  /**
   * Vérifie si une table est une table de jonction (M-N)
   */
  private isJunctionTable(table: Table): boolean {
    /*
     * Une table de jonction a généralement:
     * - Deux colonnes FK qui forment ensemble la clé primaire
     * - Peu de colonnes additionnelles
     */
    const fkColumns = table.columns.filter((c) => c.isForeignKey);
    const pkColumns = table.columns.filter((c) => c.isPrimaryKey);

    return fkColumns.length >= 2 && pkColumns.length >= 2 && table.columns.length <= 5;
  }

  /**
   * Vérifie si une table est une table de lookup/référence
   */
  private isLookupTable(table: Table): boolean {
    /*
     * Tables de lookup typiques:
     * - Peu de colonnes
     * - Pas de FK vers users
     * - Noms typiques: categories, tags, types, statuses
     */
    const lookupPatterns = ['categor', 'tag', 'type', 'status', 'role', 'level', 'country', 'currency'];
    const tableName = table.name.toLowerCase();

    return (
      lookupPatterns.some((p) => tableName.includes(p)) && !this.detectOwnerColumn(table) && table.columns.length <= 5
    );
  }

  /**
   * Génère le SQL pour les politiques RLS
   */
  generateSQL(policies: RLSPolicy[], tables: Table[]): string {
    const statements: string[] = [];

    // Enable RLS sur toutes les tables
    statements.push('-- Enable Row Level Security');

    for (const table of tables) {
      statements.push(`ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`);
    }
    statements.push('');

    // Force RLS pour les propriétaires de table (optionnel mais recommandé)
    statements.push('-- Force RLS for table owners');

    for (const table of tables) {
      statements.push(`ALTER TABLE ${table.name} FORCE ROW LEVEL SECURITY;`);
    }
    statements.push('');

    // Créer les politiques
    statements.push('-- RLS Policies');

    for (const policy of policies) {
      statements.push(this.generatePolicySQL(policy));
    }

    return statements.join('\n');
  }

  /**
   * Génère le SQL pour une politique individuelle
   */
  private generatePolicySQL(policy: RLSPolicy): string {
    const action = policy.action === 'ALL' ? 'ALL' : policy.action;
    const permissive = policy.permissive ? 'PERMISSIVE' : 'RESTRICTIVE';
    const roles = policy.roles.join(', ');

    let sql = `CREATE POLICY "${policy.name}" ON ${policy.table}\n`;
    sql += `  AS ${permissive}\n`;
    sql += `  FOR ${action}\n`;
    sql += `  TO ${roles}`;

    if (policy.using) {
      sql += `\n  USING (${policy.using})`;
    }

    if (policy.check) {
      sql += `\n  WITH CHECK (${policy.check})`;
    }

    sql += ';\n';

    return sql;
  }

  /**
   * Génère des politiques RLS depuis une configuration de pattern
   */
  generateFromPatternConfig(table: Table, config: RLSPatternConfig): RLSPolicy[] {
    const tableConfig: TableRLSConfig = {
      table: table.name,
      pattern: config.pattern,
      ownerColumn: config.ownerColumn,
      teamColumn: config.teamColumn,
    };

    const result = this.generateTablePolicies(table, tableConfig);

    return result.policies;
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createRLSGenerator(options?: RLSGeneratorOptions): RLSGenerator {
  return new RLSGenerator(options);
}
