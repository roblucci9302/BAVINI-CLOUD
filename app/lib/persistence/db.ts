/**
 * Database layer for BAVINI chat persistence.
 * Uses PGlite (PostgreSQL in WASM) with fallback to IndexedDB.
 */

import type { PGlite } from '@electric-sql/pglite';
import type { Message } from '~/types/message';
import { createScopedLogger } from '~/utils/logger';
import { migrateFromIndexedDB } from './migration';
import { initPGlite } from './pglite';
import type { ChatHistoryItem } from './useChatHistory';

const logger = createScopedLogger('ChatHistory');

// database instance type - can be PGlite or legacy IDBDatabase
export type Database = PGlite | IDBDatabase;

// flag to track if we're using PGlite or legacy IndexedDB
let usingPGlite = false;

// flag to track if IndexedDB has been closed (after migration)
let indexedDBClosed = false;

/*
 * ============================================================================
 * Cache mémoire LRU pour les messages récents
 * Évite les requêtes DB répétées pour les mêmes conversations
 * ============================================================================
 */
const MESSAGE_CACHE_SIZE = 10; // Nombre max de conversations en cache

interface CacheEntry {
  data: ChatHistoryItem;
  timestamp: number;
}

// Cache Map avec ordre d'insertion préservé (pour LRU)
const messageCache = new Map<string, CacheEntry>();

/**
 * Ajoute ou met à jour une entrée dans le cache
 */
function setCacheEntry(key: string, data: ChatHistoryItem): void {
  // Supprimer l'entrée existante pour la remettre à la fin (plus récent)
  if (messageCache.has(key)) {
    messageCache.delete(key);
  }

  // Éviction LRU si le cache est plein
  if (messageCache.size >= MESSAGE_CACHE_SIZE) {
    const oldestKey = messageCache.keys().next().value;

    if (oldestKey) {
      messageCache.delete(oldestKey);
    }
  }

  messageCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Récupère une entrée du cache (et la marque comme récemment utilisée)
 */
function getCacheEntry(key: string): ChatHistoryItem | undefined {
  const entry = messageCache.get(key);

  if (!entry) {
    return undefined;
  }

  // Déplacer à la fin (plus récent) - LRU
  messageCache.delete(key);
  messageCache.set(key, entry);

  return entry.data;
}

/**
 * Invalide une entrée du cache
 */
export function invalidateCacheEntry(key: string): void {
  messageCache.delete(key);
}

/**
 * Vide tout le cache
 */
export function clearMessageCache(): void {
  messageCache.clear();
}

/**
 * Obtient les stats du cache (pour debug)
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: messageCache.size,
    maxSize: MESSAGE_CACHE_SIZE,
  };
}

/**
 * Check if the database is PGlite.
 */
function isPGlite(db: Database): db is PGlite {
  return usingPGlite && 'query' in db;
}

/**
 * Check if IndexedDB is still usable (not closed).
 */
function isIndexedDBUsable(db: Database): boolean {
  if (isPGlite(db)) {
    return true;
  }

  if (indexedDBClosed) {
    return false;
  }

  // Check if the IDBDatabase connection is still open
  try {
    return (db as IDBDatabase).objectStoreNames.length >= 0;
  } catch {
    return false;
  }
}

/**
 * Mark IndexedDB as closed (called after migration).
 */
export function markIndexedDBClosed(): void {
  indexedDBClosed = true;
}

/**
 * Open the database, preferring PGlite with IndexedDB fallback.
 */
export async function openDatabase(): Promise<Database | undefined> {
  // try PGlite first with a timeout
  try {
    // Add internal timeout for PGlite initialization (25s)
    const pglitePromise = initPGlite();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('PGlite initialization timeout')), 25000);
    });

    const pglite = await Promise.race([pglitePromise, timeoutPromise]);

    // migrate data from IndexedDB if needed
    await migrateFromIndexedDB(pglite);

    usingPGlite = true;
    logger.info('Using PGlite database');

    return pglite;
  } catch (error) {
    logger.warn('PGlite failed, falling back to IndexedDB:', error);
  }

  // fallback to legacy IndexedDB
  logger.info('Attempting IndexedDB fallback...');

  return openLegacyDatabase();
}

/**
 * Open the legacy IndexedDB database.
 * Safe to call in SSR context - returns undefined.
 */
async function openLegacyDatabase(): Promise<IDBDatabase | undefined> {
  // SSR guard: indexedDB is not available on server
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }

  return new Promise((resolve) => {
    const request = indexedDB.open('boltHistory', 1);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
        store.createIndex('urlId', 'urlId', { unique: true });
      }
    };

    request.onsuccess = (event: Event) => {
      usingPGlite = false;
      logger.info('Using legacy IndexedDB database');
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      resolve(undefined);
      logger.error((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Get all chat history items.
 */
export async function getAll(db: Database): Promise<ChatHistoryItem[]> {
  if (isPGlite(db)) {
    const result = await db.query<ChatRowData>('SELECT * FROM chats ORDER BY updated_at DESC');

    return result.rows.map(rowToChatItem);
  }

  // legacy IndexedDB - check if still usable
  if (!isIndexedDBUsable(db)) {
    logger.warn('IndexedDB connection closed, returning empty list');
    return [];
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('chats', 'readonly');
      const store = transaction.objectStore('chats');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as ChatHistoryItem[]);
      request.onerror = () => reject(request.error);
    } catch (error) {
      logger.warn('IndexedDB transaction failed:', error);
      resolve([]);
    }
  });
}

/**
 * Save or update messages for a chat.
 * Met également à jour le cache mémoire.
 */
export async function setMessages(
  db: Database,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
): Promise<void> {
  const now = new Date().toISOString();

  if (isPGlite(db)) {
    await db.query(
      `INSERT INTO chats (id, url_id, description, messages, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (id) DO UPDATE SET
         url_id = COALESCE(EXCLUDED.url_id, chats.url_id),
         description = COALESCE(EXCLUDED.description, chats.description),
         messages = EXCLUDED.messages,
         updated_at = EXCLUDED.updated_at`,
      [id, urlId || null, description || null, JSON.stringify(messages), now],
    );
  } else {
    /* Legacy IndexedDB */
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('chats', 'readwrite');
      const store = transaction.objectStore('chats');

      const request = store.put({
        id,
        messages,
        urlId,
        description,
        timestamp: now,
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Mettre à jour le cache mémoire
  const cacheItem: ChatHistoryItem = {
    id,
    urlId,
    description,
    messages,
    timestamp: now,
  };

  setCacheEntry(id, cacheItem);

  if (urlId) {
    setCacheEntry(urlId, cacheItem);
  }
}

/**
 * Get messages by id or urlId.
 * Utilise le cache mémoire pour accélérer les accès répétés.
 */
export async function getMessages(db: Database, id: string): Promise<ChatHistoryItem> {
  // Vérifier le cache d'abord
  const cached = getCacheEntry(id);

  if (cached) {
    logger.debug(`Cache hit for ${id}`);
    return cached;
  }

  // Sinon, chercher en DB
  const result = (await getMessagesById(db, id)) || (await getMessagesByUrlId(db, id));

  // Mettre en cache si trouvé
  if (result && result.messages?.length > 0) {
    setCacheEntry(id, result);

    // Aussi mettre en cache par urlId si disponible
    if (result.urlId && result.urlId !== id) {
      setCacheEntry(result.urlId, result);
    }
  }

  return result;
}

/**
 * Get messages by urlId.
 */
export async function getMessagesByUrlId(db: Database, id: string): Promise<ChatHistoryItem> {
  if (isPGlite(db)) {
    const result = await db.query<ChatRowData>('SELECT * FROM chats WHERE url_id = $1', [id]);

    return result.rows[0] ? rowToChatItem(result.rows[0]) : (undefined as unknown as ChatHistoryItem);
  }

  // legacy IndexedDB
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get messages by id.
 */
export async function getMessagesById(db: Database, id: string): Promise<ChatHistoryItem> {
  if (isPGlite(db)) {
    const result = await db.query<ChatRowData>('SELECT * FROM chats WHERE id = $1', [id]);

    return result.rows[0] ? rowToChatItem(result.rows[0]) : (undefined as unknown as ChatHistoryItem);
  }

  // legacy IndexedDB
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a chat by id.
 */
export async function deleteById(db: Database, id: string): Promise<void> {
  // Invalider le cache avant la suppression
  invalidateCacheEntry(id);

  if (isPGlite(db)) {
    await db.query('DELETE FROM chats WHERE id = $1', [id]);

    return undefined;
  }

  /* Legacy IndexedDB */
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');
    const request = store.delete(id);

    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the next available chat id.
 */
export async function getNextId(db: Database): Promise<string> {
  if (isPGlite(db)) {
    const result = await db.query<{ max_id: string | null }>('SELECT MAX(CAST(id AS INTEGER)) as max_id FROM chats');
    const maxId = result.rows[0]?.max_id || '0';

    return String(parseInt(maxId, 10) + 1);
  }

  // legacy IndexedDB
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAllKeys();

    request.onsuccess = () => {
      const highestId = request.result.reduce((cur, acc) => Math.max(+cur, +acc), 0);
      resolve(String(+highestId + 1));
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a unique urlId for a chat.
 */
export async function getUrlId(db: Database, id: string): Promise<string> {
  const idList = await getUrlIds(db);

  if (!idList.includes(id)) {
    return id;
  } else {
    let i = 2;

    while (idList.includes(`${id}-${i}`)) {
      i++;
    }

    return `${id}-${i}`;
  }
}

/**
 * Get all existing urlIds.
 */
async function getUrlIds(db: Database): Promise<string[]> {
  if (isPGlite(db)) {
    const result = await db.query<{ url_id: string | null }>('SELECT url_id FROM chats WHERE url_id IS NOT NULL');

    return result.rows.map((row) => row.url_id).filter((id): id is string => id !== null);
  }

  // legacy IndexedDB
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

interface ChatRowData {
  id: string;
  url_id: string | null;
  description: string | null;
  messages: string | Message[];
  created_at: string;
  updated_at: string;
}

/**
 * Convert a PGlite row to a ChatHistoryItem.
 */
function rowToChatItem(row: ChatRowData): ChatHistoryItem {
  return {
    id: row.id,
    urlId: row.url_id || undefined,
    description: row.description || undefined,
    messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages,
    timestamp: row.updated_at || row.created_at,
  };
}
