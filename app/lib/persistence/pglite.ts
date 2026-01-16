/**
 * PGlite wrapper for BAVINI chat persistence.
 * Provides initialization, schema management, and query helpers.
 *
 * OPTIMIZATION: PGlite (~13.8MB) is loaded dynamically on first use,
 * not at application startup. This reduces initial bundle size.
 */

import type { PGlite } from '@electric-sql/pglite';
import { createScopedLogger } from '~/utils/logger';
import {
  CREATE_CHECKPOINTS_TABLE_SQL,
  CREATE_TABLES_SQL,
  GET_SCHEMA_VERSION_SQL,
  INSERT_SCHEMA_VERSION_SQL,
  SCHEMA_VERSION,
} from './schema';

const logger = createScopedLogger('PGlite');

const PGLITE_DB_NAME = 'idb://bavini-chats';

let pgliteInstance: PGlite | null = null;
let pglitePromise: Promise<PGlite> | null = null;

/**
 * Yield to the main thread to prevent blocking.
 * Uses setTimeout(0) to allow the browser to process pending work.
 */
function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Dynamically import PGlite to defer the 13.8MB load until first use.
 * Uses yielding to prevent blocking the main thread.
 */
async function loadPGliteModule(): Promise<typeof import('@electric-sql/pglite')> {
  logger.debug('Loading PGlite module dynamically...');

  // Yield before heavy import to let UI render
  await yieldToMainThread();

  const module = await import('@electric-sql/pglite');

  // Yield after import to let UI catch up
  await yieldToMainThread();

  logger.debug('PGlite module loaded');

  return module;
}

/**
 * Get the current schema version from the database.
 */
async function getCurrentSchemaVersion(db: PGlite): Promise<number> {
  try {
    const result = await db.query<{ version: number | null }>(GET_SCHEMA_VERSION_SQL);

    // Validate result structure
    if (!result || !Array.isArray(result.rows)) {
      logger.warn('Invalid schema version query result structure');

      return 0;
    }

    // Handle empty result set
    if (result.rows.length === 0) {
      logger.debug('Schema version table empty, returning 0');

      return 0;
    }

    const version = result.rows[0]?.version;

    // Validate version is a valid number
    if (version === null || version === undefined) {
      return 0;
    }

    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      logger.warn(`Invalid schema version value: ${version}, resetting to 0`);

      return 0;
    }

    return version;
  } catch (error) {
    // Table doesn't exist yet - this is expected on first run
    logger.debug('Schema version table not found, assuming version 0:', error);

    return 0;
  }
}

/**
 * Run schema migrations if needed.
 */
async function runMigrations(db: PGlite): Promise<void> {
  const currentVersion = await getCurrentSchemaVersion(db);

  if (currentVersion >= SCHEMA_VERSION) {
    logger.debug(`Schema is up to date (v${currentVersion})`);
    return;
  }

  logger.info(`Migrating schema from v${currentVersion} to v${SCHEMA_VERSION}...`);

  let schemaVersion = currentVersion;

  /*
   * migration v2 → v3: change snapshot columns from JSONB to TEXT for compression
   * Also handles fresh installs (v0/v1 → v3) by creating the checkpoints table
   */
  if (schemaVersion < 3) {
    logger.info('Running migration: creating/updating checkpoints table for compression...');

    // Drop old table if exists (from v2) and recreate with TEXT columns
    await db.query('DROP TABLE IF EXISTS checkpoints');
    await db.exec(CREATE_CHECKPOINTS_TABLE_SQL);
    await db.query(INSERT_SCHEMA_VERSION_SQL, [3]);
    schemaVersion = 3;
    logger.info('Migration to v3 complete');
  }

  logger.info(`Schema migration complete (now v${SCHEMA_VERSION})`);
}

/**
 * Initialize PGlite database with schema.
 * Uses dynamic import to defer the 13.8MB module load until first use.
 * Yields to main thread between heavy operations to prevent UI freeze.
 */
export async function initPGlite(): Promise<PGlite> {
  // Return cached instance
  if (pgliteInstance) {
    return pgliteInstance;
  }

  // Return pending initialization (prevents concurrent init)
  if (pglitePromise) {
    return pglitePromise;
  }

  // Start initialization
  pglitePromise = (async () => {
    logger.info('Initializing PGlite database...');

    try {
      // Dynamic import - defers 13.8MB load until first database use
      const { PGlite } = await loadPGliteModule();

      // Yield before creating instance
      await yieldToMainThread();

      const db = new PGlite(PGLITE_DB_NAME, {
        relaxedDurability: true,
      });

      await db.waitReady;

      // Yield after waitReady - this is where most blocking happens
      await yieldToMainThread();

      // create base tables if they don't exist
      await db.exec(CREATE_TABLES_SQL);

      // Yield after table creation
      await yieldToMainThread();

      // record initial schema version if not present
      await db.query(INSERT_SCHEMA_VERSION_SQL, [1]);

      // run any pending migrations
      await runMigrations(db);

      logger.info('PGlite database initialized successfully');

      pgliteInstance = db;

      return db;
    } catch (error) {
      // Reset promise so retry is possible
      pglitePromise = null;
      logger.error('Failed to initialize PGlite:', error);
      throw error;
    }
  })();

  return pglitePromise;
}

/**
 * Get the PGlite instance, initializing if needed.
 */
export async function getPGlite(): Promise<PGlite> {
  if (!pgliteInstance) {
    return initPGlite();
  }

  return pgliteInstance;
}

/**
 * Close the PGlite connection.
 */
export async function closePGlite(): Promise<void> {
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
    pglitePromise = null;
    logger.info('PGlite connection closed');
  }
}

/**
 * Check if PGlite is available and working.
 */
export async function isPGliteAvailable(): Promise<boolean> {
  try {
    const db = await initPGlite();
    const result = await db.query('SELECT 1 as test');

    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Execute a query and return typed results.
 */
export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = await getPGlite();
  const result = await db.query(sql, params);

  return result.rows as T[];
}

/**
 * Execute a query and return a single result.
 */
export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const results = await query<T>(sql, params);

  return results[0] || null;
}

/**
 * Execute a statement (INSERT, UPDATE, DELETE).
 */
export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const db = await getPGlite();
  const result = await db.query(sql, params);

  return result.affectedRows || 0;
}
