/**
 * Hook pour synchroniser les todos backend/frontend
 *
 * Ce hook fait le bridge entre:
 * - Le système TodoWrite des agents (backend)
 * - Le store todos côté client (frontend)
 *
 * Il expose un callback à passer à l'orchestrator pour recevoir
 * les mises à jour de todos en temps réel.
 */

import { useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import type { TodoItem } from '~/lib/agents/tools/interaction-tools';
import { todosStore, writeTodos, clearTodos, toggleTodosPanel, type Todo, type TodoStatus } from '~/lib/stores/todos';

/**
 * Convertit un TodoItem backend en Todo frontend
 */
function backendToFrontend(item: TodoItem): Todo {
  return {
    id: item.id,
    content: item.content,
    activeForm: item.activeForm || item.content,
    status: item.status as TodoStatus,
    startedAt: item.status === 'in_progress' ? new Date() : undefined,
    completedAt: item.status === 'completed' ? item.updatedAt || new Date() : undefined,
  };
}

/**
 * Hook pour synchroniser les todos
 *
 * @returns Object avec le callback à passer à l'orchestrator et les helpers
 */
export function useTodosSync() {
  const state = useStore(todosStore);

  /**
   * Callback à passer à l'orchestrator.setUpdateTodosCallback()
   * Reçoit les mises à jour de l'agent et met à jour le store frontend
   */
  const updateTodosCallback = useCallback(
    async (backendTodos: TodoItem[]) => {
      // Convertir les todos backend en format frontend
      const frontendTodos: Todo[] = backendTodos.map(backendToFrontend);

      // Écrire dans le store
      writeTodos(frontendTodos);

      // Ouvrir automatiquement le panel si c'est la première fois qu'on reçoit des todos
      if (backendTodos.length > 0 && state.todos.length === 0) {
        toggleTodosPanel(true);
      }
    },
    [state.todos.length],
  );

  /**
   * Reset les todos (nouvelle conversation)
   */
  const resetTodos = useCallback(() => {
    clearTodos();
  }, []);

  /**
   * Vérifie si des todos sont actifs
   */
  const hasTodos = state.todos.length > 0;

  /**
   * Obtient la tâche en cours
   */
  const currentTask = state.todos.find((t) => t.status === 'in_progress') || null;

  /**
   * Compte des tâches complétées
   */
  const completed = state.todos.filter((t) => t.status === 'completed').length;

  /**
   * Total des tâches
   */
  const total = state.todos.length;

  /**
   * Pourcentage de progression
   */
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    // Callback pour l'orchestrator
    updateTodosCallback,

    // Helpers
    resetTodos,
    hasTodos,
    currentTask,
    completed,
    total,
    progress,

    // State brut
    todos: state.todos,
  };
}

/**
 * Hook simplifié pour juste afficher les todos (sans callback)
 */
export function useTodosDisplay() {
  const state = useStore(todosStore);

  const currentTask = state.todos.find((t) => t.status === 'in_progress') || null;
  const completed = state.todos.filter((t) => t.status === 'completed').length;
  const total = state.todos.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    todos: state.todos,
    currentTask,
    completed,
    total,
    progress,
    hasTodos: total > 0,
    allDone: total > 0 && completed === total,
  };
}

export default useTodosSync;
