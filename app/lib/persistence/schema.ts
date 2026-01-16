/**
 * PGlite database schema for BAVINI chat persistence.
 */

export const SCHEMA_VERSION = 3;

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    url_id TEXT UNIQUE,
    description TEXT,
    messages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_chats_url_id ON chats(url_id);
  CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * Schema for checkpoints table (Time Travel feature).
 * Stores snapshots of project state for restoration.
 */
export const CREATE_CHECKPOINTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,

    -- Saved data (TEXT to support both JSON and compressed formats)
    files_snapshot TEXT NOT NULL,
    messages_snapshot TEXT NOT NULL,
    actions_snapshot TEXT,

    -- Metadata
    description TEXT,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('auto', 'manual', 'before_action')),
    message_id TEXT,

    -- Optimized storage
    is_full_snapshot BOOLEAN DEFAULT true,
    parent_checkpoint_id TEXT,
    compressed BOOLEAN DEFAULT false,
    size_bytes INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_checkpoints_chat ON checkpoints(chat_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_checkpoints_parent ON checkpoints(parent_checkpoint_id);
  CREATE INDEX IF NOT EXISTS idx_checkpoints_trigger ON checkpoints(trigger_type);
`;

export const INSERT_SCHEMA_VERSION_SQL = `
  INSERT INTO schema_version (version)
  VALUES ($1)
  ON CONFLICT (version) DO NOTHING;
`;

export const GET_SCHEMA_VERSION_SQL = `
  SELECT MAX(version) as version FROM schema_version;
`;

/**
 * Migration SQL for upgrading from v1 to v2 (adds checkpoints table).
 */
export const MIGRATE_V1_TO_V2_SQL = CREATE_CHECKPOINTS_TABLE_SQL;

/**
 * Migration SQL for upgrading from v2 to v3.
 * Changes snapshot columns from JSONB to TEXT to support compression.
 */
export const MIGRATE_V2_TO_V3_SQL = `
  -- Drop and recreate checkpoints table with TEXT columns
  -- This is safe because checkpoints are transient and can be recreated
  DROP TABLE IF EXISTS checkpoints;
  ${CREATE_CHECKPOINTS_TABLE_SQL}
`;
