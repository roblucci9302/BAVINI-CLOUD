# ADR-004: Nanostores pour la Gestion d'État

## Statut

Accepté

## Date

2024-09

## Contexte

BAVINI nécessite une gestion d'état réactive pour :

1. État du chat (mode, messages, streaming)
2. Statut des agents (actif, idle, erreur)
3. État du workbench (fichiers ouverts, preview)
4. Thème et préférences utilisateur
5. Logs et activité des agents

Les contraintes sont :
- **Framework-agnostic** : Potentiel usage hors React
- **Performance** : Mises à jour granulaires
- **Simplicité** : API minimale, courbe d'apprentissage faible
- **Bundle size** : Le plus petit possible

## Décision

Utiliser **Nanostores** comme bibliothèque de gestion d'état.

### Qu'est-ce que Nanostores ?

Nanostores est une bibliothèque de gestion d'état minimaliste (~300 bytes) qui fournit des stores réactifs avec une API simple.

```typescript
import { atom, map, computed } from 'nanostores';

// Atom: valeur simple
const count = atom(0);
count.set(1);
count.get(); // 1

// Map: objet avec clés
const user = map({ name: '', email: '' });
user.setKey('name', 'John');

// Computed: valeur dérivée
const doubled = computed(count, n => n * 2);
```

### Intégration React

```typescript
import { useStore } from '@nanostores/react';

function Counter() {
  const $count = useStore(count);
  return <button onClick={() => count.set($count + 1)}>{$count}</button>;
}
```

## Stores BAVINI

### Structure des stores

```
app/lib/stores/
├── chat.ts         # Mode chat, contrôle agents, approbations
├── agents.ts       # Statuts agents, logs, tâches
├── workbench.ts    # Fichiers, preview, artifacts
├── editor.ts       # Documents ouverts, curseur
├── files.ts        # Système de fichiers virtuel
├── terminal.ts     # Historique terminal
├── theme.ts        # Thème clair/sombre
├── git.ts          # État Git
├── previews.ts     # Ports de preview
└── checkpoints.ts  # Checkpoints (Time Travel)
```

### Exemple : Chat Store

```typescript
// app/lib/stores/chat.ts
import { map, atom } from 'nanostores';

export type ChatMode = 'chat' | 'agent';
export type AgentControlMode = 'strict' | 'moderate' | 'permissive';

export interface ChatState {
  started: boolean;
  aborted: boolean;
  showChat: boolean;
  mode: ChatMode;
  controlMode: AgentControlMode;
  awaitingAgentApproval: boolean;
}

export const chatStore = map<ChatState>({
  started: false,
  aborted: false,
  showChat: true,
  mode: 'agent',
  controlMode: 'strict',
  awaitingAgentApproval: false,
});

// Actions
export function setChatMode(mode: ChatMode): void {
  chatStore.setKey('mode', mode);
}
```

### Exemple : Stores calculés

```typescript
// app/lib/stores/agents.ts
import { computed } from 'nanostores';

// Agents actuellement actifs
export const activeAgentCountStore = computed(
  activeAgentsStore,
  (agents) => agents.length
);

// Statistiques globales
export const agentStatsStore = computed(
  [agentStatusStore, completedTasksStore, taskQueueStore],
  (statuses, completed, queue) => ({
    totalAgents: Object.keys(statuses).length,
    busyAgents: Object.values(statuses).filter(s => s !== 'idle').length,
    completedTasks: completed.length,
    pendingTasks: queue.length,
  })
);
```

## Conséquences

### Positives

1. **Ultra-léger** : ~300 bytes (vs 11kb Redux, 13kb Zustand)
2. **Granularité** : Seuls les composants abonnés re-render
3. **Simplicité** : API minimale, pas de boilerplate
4. **TypeScript** : Types inférés automatiquement
5. **Framework-agnostic** : Fonctionne avec React, Vue, Svelte, vanilla
6. **Computed stores** : Dérivations automatiques sans re-calcul inutile

### Négatives

1. **Moins de features** : Pas de middleware, devtools limités
2. **Pattern différent** : Pas de reducers/actions comme Redux
3. **Écosystème** : Moins de plugins que Redux/Zustand

### Comparaison de taille

| Bibliothèque | Taille (gzip) |
|-------------|---------------|
| Nanostores | 0.3 KB |
| Zustand | 1.1 KB |
| Jotai | 2.5 KB |
| Redux Toolkit | 11 KB |
| MobX | 16 KB |

## Alternatives considérées

### 1. Redux Toolkit

Solution standard pour React.

**Avantages** :
- Écosystème riche
- DevTools excellents
- Patterns bien établis

**Inconvénients** :
- Trop lourd (~11 KB)
- Boilerplate important
- Lié à React

**Décision** : Overkill pour les besoins de BAVINI.

### 2. Zustand

Store minimaliste populaire.

**Avantages** :
- API simple
- Middleware (persist, devtools)
- Bonne taille (~1 KB)

**Inconvénients** :
- Lié à React (hooks uniquement)
- Pas de computed natif

**Décision** : Bon choix mais Nanostores est encore plus léger.

### 3. Jotai

Gestion d'état atomique.

**Avantages** :
- Atoms composables
- Bonne intégration React

**Inconvénients** :
- Plus lourd (~2.5 KB)
- API plus complexe

### 4. Signaux (Preact Signals)

Réactivité fine.

**Avantages** :
- Très performant
- API simple

**Inconvénients** :
- Moins mature
- Intégration React moins native

## Patterns recommandés

### 1. Un store par domaine

```typescript
// ✅ Bon
export const chatStore = map<ChatState>({...});
export const agentStore = map<AgentState>({...});

// ❌ Éviter
export const globalStore = map<EverythingState>({...});
```

### 2. Actions comme fonctions

```typescript
// ✅ Bon
export function setChatMode(mode: ChatMode) {
  chatStore.setKey('mode', mode);
}

// ❌ Éviter (mutation directe depuis les composants)
chatStore.setKey('mode', 'agent');
```

### 3. Computed pour les dérivations

```typescript
// ✅ Bon
export const activeCount = computed(agents, a => a.filter(x => x.active).length);

// ❌ Éviter (recalcul dans chaque composant)
function Component() {
  const agents = useStore(agentsStore);
  const count = agents.filter(x => x.active).length; // recalculé à chaque render
}
```

## Références

- [Nanostores GitHub](https://github.com/nanostores/nanostores)
- [Nanostores React](https://github.com/nanostores/react)
- Code source : `app/lib/stores/`
