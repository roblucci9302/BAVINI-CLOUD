// Named exports for better tree-shaking (avoid export *)

// Database (db.ts)
export {
  type Database,
  invalidateCacheEntry,
  clearMessageCache,
  getCacheStats,
  markIndexedDBClosed,
  openDatabase,
  getAll,
  setMessages,
  getMessages,
  getMessagesByUrlId,
  getMessagesById,
  deleteById,
  getNextId,
  getUrlId,
} from './db';

// Chat History Hook (useChatHistory.ts)
export {
  type ChatHistoryItem,
  forceInitDatabase,
  getDatabase,
  chatId,
  description,
  useChatHistory,
} from './useChatHistory';

// PGlite (pglite.ts)
export { initPGlite, getPGlite, closePGlite, isPGliteAvailable, query, queryOne, execute } from './pglite';

// Migration (migration.ts)
export {
  isMigrationExhausted,
  isMigrationComplete,
  markMigrationComplete,
  migrateFromIndexedDB,
  hasLegacyData,
} from './migration';

// Schema
export { SCHEMA_VERSION } from './schema';
