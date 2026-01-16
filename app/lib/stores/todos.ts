/**
 * Store pour le système TodoWrite visible
 *
 * Gère la liste des tâches en temps réel, permettant à l'utilisateur
 * de voir la progression de BAVINI pendant l'exécution.
 *
 * Inspiré de Claude Code TodoWrite:
 * - Une seule tâche in_progress à la fois
 * - Marquer completed immédiatement
 * - Visible par l'utilisateur en permanence
 */

import { map, atom, computed } from 'nanostores';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Statut d'une tâche
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * Structure d'une tâche
 */
export interface Todo {
  /** ID unique */
  id: string;

  /** Description de la tâche (forme impérative: "Créer le composant") */
  content: string;

  /** Forme active (présent continu: "Création du composant") */
  activeForm: string;

  /** Statut actuel */
  status: TodoStatus;

  /** Agent assigné (optionnel) */
  agent?: string;

  /** Heure de début */
  startedAt?: Date;

  /** Heure de fin */
  completedAt?: Date;

  /** Durée en ms */
  duration?: number;

  /** Message d'erreur si failed */
  error?: string;

  /** Sous-tâches (optionnel) */
  subtasks?: Todo[];
}

/**
 * État du store todos
 */
export interface TodosState {
  /** Liste des tâches */
  todos: Todo[];

  /** ID de la session courante */
  sessionId: string;

  /** Horodatage de la dernière mise à jour */
  lastUpdated: Date;
}

/*
 * ============================================================================
 * STORES
 * ============================================================================
 */

/**
 * Store principal des todos
 */
export const todosStore = map<TodosState>({
  todos: [],
  sessionId: '',
  lastUpdated: new Date(),
});

/**
 * Panel des todos ouvert ?
 */
export const todosPanelOpenStore = atom<boolean>(false);

/**
 * Mode compact (juste l'indicateur) vs mode étendu (liste complète)
 */
export const todosCompactModeStore = atom<boolean>(true);

/*
 * ============================================================================
 * COMPUTED VALUES
 * ============================================================================
 */

/**
 * Tâche actuellement en cours
 */
export const currentTodo = computed(todosStore, (state) => {
  return state.todos.find((t) => t.status === 'in_progress') || null;
});

/**
 * Nombre de tâches complétées
 */
export const completedCount = computed(todosStore, (state) => {
  return state.todos.filter((t) => t.status === 'completed').length;
});

/**
 * Nombre total de tâches
 */
export const totalCount = computed(todosStore, (state) => {
  return state.todos.length;
});

/**
 * Pourcentage de progression
 */
export const progressPercent = computed(todosStore, (state) => {
  if (state.todos.length === 0) {
    return 0;
  }

  const completed = state.todos.filter((t) => t.status === 'completed' || t.status === 'skipped').length;

  return Math.round((completed / state.todos.length) * 100);
});

/**
 * Y a-t-il des tâches actives ?
 */
export const hasTodos = computed(todosStore, (state) => {
  return state.todos.length > 0;
});

/**
 * Toutes les tâches sont-elles terminées ?
 */
export const allCompleted = computed(todosStore, (state) => {
  if (state.todos.length === 0) {
    return false;
  }

  return state.todos.every((t) => t.status === 'completed' || t.status === 'skipped' || t.status === 'failed');
});

/*
 * ============================================================================
 * ACTIONS
 * ============================================================================
 */

/**
 * Génère un ID unique
 */
function generateId(): string {
  return `todo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Démarre une nouvelle session de todos
 */
export function startTodoSession(): string {
  const sessionId = `session-${Date.now()}`;
  todosStore.set({
    todos: [],
    sessionId,
    lastUpdated: new Date(),
  });

  return sessionId;
}

/**
 * Écrit/remplace la liste complète des todos
 * (Similaire à TodoWrite de Claude Code)
 */
export function writeTodos(todos: Array<Omit<Todo, 'id'> & { id?: string }>): void {
  const state = todosStore.get();

  const newTodos: Todo[] = todos.map((t, index) => ({
    ...t,
    id: t.id || generateId(),
  }));

  // Vérifier qu'il n'y a qu'une seule tâche in_progress
  const inProgressCount = newTodos.filter((t) => t.status === 'in_progress').length;

  if (inProgressCount > 1) {
    console.warn("TodoWrite: Plus d'une tâche in_progress détectée, normalisation...");

    let foundFirst = false;
    newTodos.forEach((t) => {
      if (t.status === 'in_progress') {
        if (foundFirst) {
          t.status = 'pending';
        } else {
          foundFirst = true;
        }
      }
    });
  }

  todosStore.set({
    ...state,
    todos: newTodos,
    lastUpdated: new Date(),
  });
}

/**
 * Ajoute une ou plusieurs tâches
 */
export function addTodos(
  todos: Array<{
    content: string;
    activeForm: string;
    agent?: string;
    status?: TodoStatus;
  }>,
): Todo[] {
  const state = todosStore.get();

  const newTodos: Todo[] = todos.map((t) => ({
    id: generateId(),
    content: t.content,
    activeForm: t.activeForm,
    status: t.status || 'pending',
    agent: t.agent,
  }));

  todosStore.set({
    ...state,
    todos: [...state.todos, ...newTodos],
    lastUpdated: new Date(),
  });

  return newTodos;
}

/**
 * Démarre une tâche (la passe en in_progress)
 * S'assure qu'il n'y a qu'une seule tâche in_progress
 */
export function startTodo(todoId: string): void {
  const state = todosStore.get();

  const updatedTodos = state.todos.map((t) => {
    // Mettre les autres tâches in_progress en pending si nécessaire
    if (t.status === 'in_progress' && t.id !== todoId) {
      return { ...t, status: 'pending' as TodoStatus };
    }

    // Démarrer la tâche cible
    if (t.id === todoId) {
      return {
        ...t,
        status: 'in_progress' as TodoStatus,
        startedAt: new Date(),
      };
    }

    return t;
  });

  todosStore.set({
    ...state,
    todos: updatedTodos,
    lastUpdated: new Date(),
  });
}

/**
 * Complète une tâche
 */
export function completeTodo(todoId: string): void {
  const state = todosStore.get();
  const now = new Date();

  const updatedTodos = state.todos.map((t) => {
    if (t.id === todoId) {
      const duration = t.startedAt ? now.getTime() - t.startedAt.getTime() : 0;
      return {
        ...t,
        status: 'completed' as TodoStatus,
        completedAt: now,
        duration,
      };
    }

    return t;
  });

  todosStore.set({
    ...state,
    todos: updatedTodos,
    lastUpdated: new Date(),
  });
}

/**
 * Marque une tâche comme échouée
 */
export function failTodo(todoId: string, error?: string): void {
  const state = todosStore.get();
  const now = new Date();

  const updatedTodos = state.todos.map((t) => {
    if (t.id === todoId) {
      const duration = t.startedAt ? now.getTime() - t.startedAt.getTime() : 0;
      return {
        ...t,
        status: 'failed' as TodoStatus,
        completedAt: now,
        duration,
        error,
      };
    }

    return t;
  });

  todosStore.set({
    ...state,
    todos: updatedTodos,
    lastUpdated: new Date(),
  });
}

/**
 * Skip une tâche
 */
export function skipTodo(todoId: string): void {
  const state = todosStore.get();

  const updatedTodos = state.todos.map((t) => {
    if (t.id === todoId) {
      return {
        ...t,
        status: 'skipped' as TodoStatus,
        completedAt: new Date(),
      };
    }

    return t;
  });

  todosStore.set({
    ...state,
    todos: updatedTodos,
    lastUpdated: new Date(),
  });
}

/**
 * Met à jour une tâche existante
 */
export function updateTodo(todoId: string, updates: Partial<Omit<Todo, 'id'>>): void {
  const state = todosStore.get();

  const updatedTodos = state.todos.map((t) => {
    if (t.id === todoId) {
      return { ...t, ...updates };
    }

    return t;
  });

  todosStore.set({
    ...state,
    todos: updatedTodos,
    lastUpdated: new Date(),
  });
}

/**
 * Supprime une tâche
 */
export function removeTodo(todoId: string): void {
  const state = todosStore.get();

  todosStore.set({
    ...state,
    todos: state.todos.filter((t) => t.id !== todoId),
    lastUpdated: new Date(),
  });
}

/**
 * Réinitialise tous les todos
 */
export function clearTodos(): void {
  todosStore.set({
    todos: [],
    sessionId: '',
    lastUpdated: new Date(),
  });
}

/**
 * Démarre la prochaine tâche pending
 */
export function startNextTodo(): Todo | null {
  const state = todosStore.get();

  // Vérifier qu'aucune tâche n'est en cours
  const currentInProgress = state.todos.find((t) => t.status === 'in_progress');

  if (currentInProgress) {
    return null;
  }

  // Trouver la première tâche pending
  const nextPending = state.todos.find((t) => t.status === 'pending');

  if (nextPending) {
    startTodo(nextPending.id);
    return nextPending;
  }

  return null;
}

/**
 * Termine la tâche courante et démarre la suivante
 */
export function completeAndNext(): Todo | null {
  const current = currentTodo.get();

  if (current) {
    completeTodo(current.id);
  }

  return startNextTodo();
}

/*
 * ============================================================================
 * ACTIONS UI
 * ============================================================================
 */

/**
 * Ouvre/ferme le panel des todos
 */
export function toggleTodosPanel(open?: boolean): void {
  const current = todosPanelOpenStore.get();
  todosPanelOpenStore.set(open !== undefined ? open : !current);
}

/**
 * Bascule entre mode compact et étendu
 */
export function toggleCompactMode(compact?: boolean): void {
  const current = todosCompactModeStore.get();
  todosCompactModeStore.set(compact !== undefined ? compact : !current);
}

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Formate la durée en texte lisible
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);

  return `${minutes}m ${seconds}s`;
}

/**
 * Exporte les todos pour debug
 */
export function exportTodos(): string {
  return JSON.stringify(todosStore.get(), null, 2);
}
