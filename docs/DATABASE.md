# Architecture Base de Données BAVINI

Documentation de la couche de persistance utilisant PGlite (PostgreSQL en WebAssembly).

## Table des Matières

- [Vue d'ensemble](#vue-densemble)
- [Technologies](#technologies)
- [Schéma](#schéma)
- [Migrations](#migrations)
- [API de Persistance](#api-de-persistance)

---

## Vue d'ensemble

BAVINI utilise **PGlite** pour la persistance des données côté client. PGlite est une implémentation de PostgreSQL compilée en WebAssembly, permettant d'exécuter une vraie base de données SQL dans le navigateur.

### Avantages de PGlite

- **SQL complet** : Requêtes complexes, jointures, indexes
- **JSONB natif** : Stockage efficace des messages et snapshots
- **Persistance** : Données stockées dans IndexedDB
- **Transactions** : Support ACID complet
- **Pas de serveur** : Tout fonctionne côté client

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Components                      │
│   (useChatHistory, useCheckpoints, etc.)                │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                    Persistence Layer                     │
│   db.ts  │  checkpoints-db.ts  │  migration.ts          │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                       PGlite                             │
│            (PostgreSQL en WebAssembly)                   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                      IndexedDB                           │
│              (Stockage persistant navigateur)           │
└─────────────────────────────────────────────────────────┘
```

---

## Technologies

### PGlite

```typescript
import { PGlite } from '@electric-sql/pglite';

// Initialisation avec persistance IndexedDB
const db = new PGlite('idb://bavini');
```

**Version:** PGlite (PostgreSQL 16 en WASM)

### Fallback IndexedDB

En cas d'échec de PGlite (navigateurs anciens), un fallback vers IndexedDB natif est disponible.

```typescript
// Ordre de préférence :
// 1. PGlite (SQL complet)
// 2. IndexedDB (fallback legacy)
```

---

## Schéma

### Version actuelle : 3

### Table `chats`

Stocke les conversations avec l'IA.

```sql
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  url_id TEXT UNIQUE,
  description TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_chats_url_id ON chats(url_id);
CREATE INDEX idx_chats_updated ON chats(updated_at DESC);
```

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT | ID unique (UUID) |
| `url_id` | TEXT | ID court pour l'URL (optionnel) |
| `description` | TEXT | Description/titre du chat |
| `messages` | JSONB | Array de messages AI SDK |
| `created_at` | TIMESTAMP | Date de création |
| `updated_at` | TIMESTAMP | Dernière mise à jour |

**Structure d'un message:**

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: Date;
  annotations?: Annotation[];
}
```

---

### Table `checkpoints`

Stocke les points de sauvegarde pour le Time Travel.

```sql
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,

  -- Snapshots (JSON ou compressé)
  files_snapshot TEXT NOT NULL,
  messages_snapshot TEXT NOT NULL,
  actions_snapshot TEXT,

  -- Métadonnées
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN ('auto', 'manual', 'before_action')
  ),
  message_id TEXT,

  -- Optimisation stockage
  is_full_snapshot BOOLEAN DEFAULT true,
  parent_checkpoint_id TEXT,
  compressed BOOLEAN DEFAULT false,
  size_bytes INTEGER,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_checkpoints_chat ON checkpoints(chat_id, created_at DESC);
CREATE INDEX idx_checkpoints_parent ON checkpoints(parent_checkpoint_id);
CREATE INDEX idx_checkpoints_trigger ON checkpoints(trigger_type);
```

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT | ID unique (UUID) |
| `chat_id` | TEXT | Référence au chat parent |
| `files_snapshot` | TEXT | JSON des fichiers (peut être compressé) |
| `messages_snapshot` | TEXT | JSON des messages |
| `actions_snapshot` | TEXT | JSON des actions (optionnel) |
| `description` | TEXT | Description du checkpoint |
| `trigger_type` | TEXT | 'auto', 'manual', ou 'before_action' |
| `is_full_snapshot` | BOOLEAN | Snapshot complet ou différentiel |
| `parent_checkpoint_id` | TEXT | Parent pour les diffs |
| `compressed` | BOOLEAN | Données compressées |
| `size_bytes` | INTEGER | Taille en octets |

---

### Table `schema_version`

Suivi des versions de schéma pour les migrations.

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Migrations

### Stratégie

Les migrations sont appliquées automatiquement au démarrage de l'application.

```typescript
// Vérification et application des migrations
async function initPGlite(): Promise<PGlite> {
  const db = new PGlite('idb://bavini');

  // Créer les tables de base
  await db.exec(CREATE_TABLES_SQL);

  // Vérifier la version actuelle
  const version = await getSchemaVersion(db);

  // Appliquer les migrations manquantes
  if (version < 2) await migrateV1ToV2(db);
  if (version < 3) await migrateV2ToV3(db);

  return db;
}
```

### Historique des migrations

#### v1 → v2 : Ajout des checkpoints

```sql
-- Création de la table checkpoints
CREATE TABLE checkpoints (...);
```

#### v2 → v3 : Support compression

```sql
-- Changement de JSONB vers TEXT pour les snapshots
-- Permet le stockage de données compressées
DROP TABLE checkpoints;
CREATE TABLE checkpoints (
  files_snapshot TEXT NOT NULL,  -- Était JSONB
  messages_snapshot TEXT NOT NULL,  -- Était JSONB
  compressed BOOLEAN DEFAULT false,
  ...
);
```

### Migration IndexedDB → PGlite

Migration automatique des données de l'ancien système IndexedDB.

```typescript
export async function migrateFromIndexedDB(pglite: PGlite): Promise<{
  migrated: number;
  errors: number;
}> {
  // Vérifie si la migration a déjà été effectuée
  if (isMigrationComplete()) return { migrated: 0, errors: 0 };

  // Ouvre l'ancienne base IndexedDB
  const legacyDb = await openLegacyDatabase();
  if (!legacyDb) return { migrated: 0, errors: 0 };

  // Transfère chaque chat
  const chats = await getLegacyChats(legacyDb);
  for (const chat of chats) {
    await pglite.query(`
      INSERT INTO chats (id, url_id, description, messages, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [chat.id, chat.urlId, chat.description, chat.messages, chat.timestamp]);
  }

  markMigrationComplete();
  return { migrated: chats.length, errors: 0 };
}
```

---

## API de Persistance

### Chat History

```typescript
// Fichier: app/lib/persistence/db.ts

// Obtenir tous les chats
export async function getAll(db: Database): Promise<ChatHistoryItem[]>;

// Obtenir un chat par ID
export async function getById(db: Database, id: string): Promise<ChatHistoryItem | undefined>;

// Sauvegarder/mettre à jour un chat
export async function saveChat(
  db: Database,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string
): Promise<void>;

// Supprimer un chat
export async function deleteById(db: Database, id: string): Promise<void>;

// Supprimer tous les chats
export async function deleteAll(db: Database): Promise<void>;
```

### Checkpoints

```typescript
// Fichier: app/lib/persistence/checkpoints-db.ts

// Créer un checkpoint
export async function createCheckpoint(
  db: PGlite,
  data: CreateCheckpointData
): Promise<Checkpoint>;

// Obtenir les checkpoints d'un chat
export async function getCheckpointsByChat(
  db: PGlite,
  chatId: string
): Promise<Checkpoint[]>;

// Obtenir un checkpoint par ID
export async function getCheckpointById(
  db: PGlite,
  id: string
): Promise<Checkpoint | null>;

// Supprimer un checkpoint
export async function deleteCheckpoint(
  db: PGlite,
  id: string
): Promise<boolean>;

// Supprimer les vieux checkpoints (rotation)
export async function deleteOldCheckpoints(
  db: PGlite,
  chatId: string,
  keepCount: number,
  options?: { preserveManual?: boolean }
): Promise<number>;
```

### Hook useChatHistory

```typescript
// Fichier: app/lib/persistence/useChatHistory.ts

export function useChatHistory() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const db = useRef<Database>();

  // Initialisation de la base
  useEffect(() => {
    openDatabase()
      .then((database) => {
        db.current = database;
        setReady(true);
      })
      .catch(setError);
  }, []);

  return {
    ready,
    error,
    getAll: () => getAll(db.current!),
    getById: (id) => getById(db.current!, id),
    saveChat: (...args) => saveChat(db.current!, ...args),
    deleteById: (id) => deleteById(db.current!, id),
    deleteAll: () => deleteAll(db.current!),
  };
}
```

---

## Compression des Checkpoints

Pour optimiser le stockage, les checkpoints peuvent être compressés.

```typescript
// Fichier: app/lib/persistence/checkpoint-compression.ts

// Compression avec pako (zlib)
export function compressSnapshot(data: object): string {
  const json = JSON.stringify(data);
  const compressed = pako.deflate(json);
  return btoa(String.fromCharCode(...compressed));
}

// Décompression
export function decompressSnapshot<T>(compressed: string): T {
  const binary = atob(compressed);
  const bytes = new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
  const json = pako.inflate(bytes, { to: 'string' });
  return JSON.parse(json);
}
```

---

## Bonnes Pratiques

### Gestion des erreurs

```typescript
try {
  await db.query('INSERT INTO chats ...');
} catch (error) {
  if (error.code === '23505') {
    // Conflit de clé unique - utiliser UPDATE
  } else {
    logger.error('Database error:', error);
    throw error;
  }
}
```

### Transactions

```typescript
await db.transaction(async (tx) => {
  await tx.query('UPDATE chats SET ...');
  await tx.query('INSERT INTO checkpoints ...');
  // Commit automatique si pas d'erreur
});
```

### Requêtes préparées

```typescript
// Toujours utiliser des paramètres pour éviter l'injection SQL
await db.query(
  'SELECT * FROM chats WHERE id = $1',
  [chatId]
);
```

---

## Fichiers de la Couche de Persistance

| Fichier | Description |
|---------|-------------|
| `schema.ts` | Définitions SQL des tables |
| `pglite.ts` | Initialisation PGlite |
| `db.ts` | API principale (chats) |
| `checkpoints-db.ts` | API checkpoints |
| `migration.ts` | Migration IndexedDB → PGlite |
| `useChatHistory.ts` | Hook React pour l'historique |
| `checkpoint-compression.ts` | Compression des snapshots |
| `checkpoint-diff.ts` | Stockage différentiel |
