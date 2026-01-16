/**
 * Migration utilities for IndexedDB to PGlite.
 * Handles one-time migration of existing chat data.
 */

import type { PGlite } from '@electric-sql/pglite';
import type { Message } from '~/types/message';
import { createScopedLogger } from '~/utils/logger';
import { markIndexedDBClosed } from './db';

const logger = createScopedLogger('Migration');

const MIGRATION_KEY = 'bavini_pglite_migrated';
const MIGRATION_RETRY_KEY = 'bavini_pglite_migration_retries';
const MAX_MIGRATION_RETRIES = 3;
const LEGACY_DB_NAME = 'boltHistory';
const LEGACY_STORE_NAME = 'chats';

/**
 * Get the number of migration retry attempts.
 */
function getMigrationRetries(): number {
  if (typeof localStorage === 'undefined') {
    return 0;
  }

  try {
    return parseInt(localStorage.getItem(MIGRATION_RETRY_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * Increment migration retry counter.
 */
function incrementMigrationRetries(): number {
  if (typeof localStorage === 'undefined') {
    return 0;
  }

  const current = getMigrationRetries();
  const next = current + 1;

  try {
    localStorage.setItem(MIGRATION_RETRY_KEY, String(next));
  } catch {
    // Ignore storage errors
  }

  return next;
}

/**
 * Mark migration as failed after max retries.
 */
function markMigrationFailed(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(MIGRATION_KEY, 'failed');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if migration has exceeded max retries.
 */
export function isMigrationExhausted(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  try {
    return localStorage.getItem(MIGRATION_KEY) === 'failed' || getMigrationRetries() >= MAX_MIGRATION_RETRIES;
  } catch {
    return false;
  }
}

interface LegacyChatItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
}

/**
 * Check if migration has already been completed or failed after max retries.
 * Safe to call in SSR context - returns false.
 */
export function isMigrationComplete(): boolean {
  // SSR guard: localStorage is not available on server
  if (typeof localStorage === 'undefined') {
    return false;
  }

  try {
    const status = localStorage.getItem(MIGRATION_KEY);

    // Complete if explicitly marked as done OR failed after max retries
    return status === 'true' || status === 'failed';
  } catch {
    return false;
  }
}

/**
 * Mark migration as complete.
 * Safe to call in SSR context - no-op.
 */
export function markMigrationComplete(): void {
  // SSR guard: localStorage is not available on server
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(MIGRATION_KEY, 'true');
  } catch {
    logger.warn('Could not save migration status to localStorage');
  }
}

/**
 * Open the legacy IndexedDB database.
 * Safe to call in SSR context - returns null.
 */
async function openLegacyDatabase(): Promise<IDBDatabase | null> {
  // SSR guard: indexedDB is not available on server
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(LEGACY_DB_NAME, 1);

      request.onerror = () => {
        logger.debug('No legacy database found');
        resolve(null);
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // check if the store exists
        if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          db.close();
          resolve(null);

          return;
        }

        resolve(db);
      };

      request.onupgradeneeded = () => {
        // if we're upgrading, the db doesn't have our data
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Get all chats from the legacy IndexedDB.
 */
async function getLegacyChats(db: IDBDatabase): Promise<LegacyChatItem[]> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(LEGACY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(LEGACY_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as LegacyChatItem[]);
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Migrate data from IndexedDB to PGlite.
 */
export async function migrateFromIndexedDB(pglite: PGlite): Promise<{ migrated: number; errors: number }> {
  const stats = { migrated: 0, errors: 0 };

  // skip if already migrated
  if (isMigrationComplete()) {
    logger.debug('Migration already complete, skipping');

    return stats;
  }

  logger.info('Starting migration from IndexedDB to PGlite...');

  try {
    // open legacy database
    const legacyDb = await openLegacyDatabase();

    if (!legacyDb) {
      logger.info('No legacy database found, nothing to migrate');
      markMigrationComplete();

      return stats;
    }

    // get all chats
    const chats = await getLegacyChats(legacyDb);

    logger.info(`Found ${chats.length} chats to migrate`);

    // close legacy connection and mark as closed to prevent further access
    legacyDb.close();
    markIndexedDBClosed();

    if (chats.length === 0) {
      markMigrationComplete();

      return stats;
    }

    // migrate each chat
    for (const chat of chats) {
      try {
        await pglite.query(
          `INSERT INTO chats (id, url_id, description, messages, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)
           ON CONFLICT (id) DO UPDATE SET
             url_id = EXCLUDED.url_id,
             description = EXCLUDED.description,
             messages = EXCLUDED.messages,
             updated_at = EXCLUDED.updated_at`,
          [
            chat.id,
            chat.urlId || null,
            chat.description || null,
            JSON.stringify(chat.messages),
            chat.timestamp || new Date().toISOString(),
          ],
        );

        stats.migrated++;
      } catch (error) {
        logger.error(`Failed to migrate chat ${chat.id}:`, error);
        stats.errors++;
      }
    }

    logger.info(`Migration complete: ${stats.migrated} migrated, ${stats.errors} errors`);

    // Mark as complete only if no errors
    if (stats.errors === 0) {
      markMigrationComplete();
    } else {
      // Increment retry counter and check if exhausted
      const retries = incrementMigrationRetries();

      if (retries >= MAX_MIGRATION_RETRIES) {
        logger.error(`Migration failed after ${MAX_MIGRATION_RETRIES} attempts, marking as failed`);
        markMigrationFailed();
      } else {
        logger.warn(`Migration had errors, will retry (attempt ${retries}/${MAX_MIGRATION_RETRIES})`);
      }
    }

    return stats;
  } catch (error) {
    logger.error('Migration failed:', error);

    return stats;
  }
}

/**
 * Check if there is legacy data to migrate.
 */
export async function hasLegacyData(): Promise<boolean> {
  if (isMigrationComplete()) {
    return false;
  }

  const db = await openLegacyDatabase();

  if (!db) {
    return false;
  }

  try {
    const chats = await getLegacyChats(db);
    db.close();

    return chats.length > 0;
  } catch {
    db.close();

    return false;
  }
}
