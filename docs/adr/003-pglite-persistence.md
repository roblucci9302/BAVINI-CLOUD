# ADR-003: PGlite pour la Persistance

## Statut

Accepté

## Date

2024-11

## Contexte

BAVINI doit persister les données utilisateur côté client :

1. Historique des conversations
2. Checkpoints (Time Travel)
3. Préférences utilisateur

Les contraintes sont :
- **100% client-side** : Pas de serveur backend pour le stockage
- **Requêtes complexes** : Recherche, filtrage, pagination
- **Données structurées** : Relations entre entités (chats → checkpoints)
- **Performance** : Accès rapide aux données fréquentes

## Décision

Utiliser **PGlite** (PostgreSQL en WebAssembly) comme base de données cliente.

### Qu'est-ce que PGlite ?

PGlite est PostgreSQL compilé en WebAssembly. Il s'exécute entièrement dans le navigateur et persiste les données dans IndexedDB.

```typescript
import { PGlite } from '@electric-sql/pglite';

// Connexion avec persistance
const db = new PGlite('idb://bavini');

// Requêtes SQL standard
const result = await db.query(`
  SELECT * FROM chats
  WHERE updated_at > $1
  ORDER BY updated_at DESC
  LIMIT 10
`, [lastWeek]);
```

### Fonctionnalités utilisées

| Feature | Usage |
|---------|-------|
| **JSONB** | Stockage des messages et snapshots |
| **Indexes** | Recherche rapide par chat_id, date |
| **Foreign Keys** | Intégrité chats ↔ checkpoints |
| **Transactions** | Opérations atomiques sur checkpoints |
| **CHECK Constraints** | Validation des trigger_type |

## Conséquences

### Positives

1. **SQL complet** : Requêtes complexes, jointures, agrégations
2. **JSONB natif** : Stockage efficace des données semi-structurées
3. **Transactions ACID** : Garantie d'intégrité des données
4. **Migration facile** : Schéma versionné avec migrations
5. **Typage** : Types PostgreSQL stricts
6. **Performance** : Indexes et optimiseur de requêtes

### Négatives

1. **Taille du bundle** : ~3 Mo pour le WASM
2. **Temps de démarrage** : ~500ms pour initialiser
3. **Mémoire** : Consomme plus que IndexedDB brut
4. **Navigateurs anciens** : Nécessite support WASM et SharedArrayBuffer

### Benchmarks

| Opération | IndexedDB | PGlite |
|-----------|-----------|--------|
| Insert 1 chat | 5ms | 8ms |
| Get by ID | 2ms | 3ms |
| Search (LIKE) | 50ms* | 15ms |
| Join (chats + checkpoints) | N/A | 20ms |

\* IndexedDB nécessite un scan complet pour les recherches textuelles.

## Alternatives considérées

### 1. IndexedDB natif

API de stockage navigateur standard.

**Avantages** :
- Natif, pas de bundle supplémentaire
- API simple pour le stockage clé-valeur

**Inconvénients** :
- API callback complexe
- Pas de requêtes SQL
- Pas de jointures
- Indexes manuels

**Décision** : Utilisé comme fallback et backend de persistance pour PGlite.

### 2. sql.js (SQLite en WASM)

SQLite compilé en WebAssembly.

**Avantages** :
- Plus léger que PostgreSQL (~1 Mo)
- API similaire

**Inconvénients** :
- Pas de JSONB natif (JSON1 moins puissant)
- Pas de types de données avancés
- Écosystème moins riche

**Décision** : PGlite offre de meilleures fonctionnalités pour les données JSON.

### 3. Dexie.js (wrapper IndexedDB)

Wrapper Promise pour IndexedDB.

**Avantages** :
- Léger
- API moderne

**Inconvénients** :
- Toujours limité par IndexedDB
- Pas de vraies requêtes SQL

### 4. Stockage serveur

Backend avec PostgreSQL/MongoDB.

**Avantages** :
- Performances optimales
- Synchronisation multi-device

**Inconvénients** :
- Coût infrastructure
- Latence réseau
- Complexité authentification

**Décision** : Hors scope pour le MVP, considéré pour une version future.

## Migration depuis IndexedDB

Un système de migration automatique est implémenté pour les utilisateurs existants :

```typescript
export async function migrateFromIndexedDB(pglite: PGlite) {
  // Vérifie si migration nécessaire
  if (isMigrationComplete()) return;

  // Ouvre l'ancienne base
  const legacyDb = await openLegacyDatabase();

  // Transfère les données
  const chats = await getLegacyChats(legacyDb);
  for (const chat of chats) {
    await pglite.query('INSERT INTO chats ...', [chat]);
  }

  // Marque comme migré
  markMigrationComplete();
}
```

## Configuration de fallback

```typescript
export async function openDatabase(): Promise<Database> {
  try {
    // Essayer PGlite en premier
    const pglite = await initPGlite();
    await migrateFromIndexedDB(pglite);
    return pglite;
  } catch (error) {
    // Fallback vers IndexedDB
    logger.warn('PGlite failed, using IndexedDB fallback');
    return openLegacyDatabase();
  }
}
```

## Références

- [PGlite GitHub](https://github.com/electric-sql/pglite)
- [PGlite Documentation](https://pglite.dev/)
- Code source : `app/lib/persistence/`
