/**
 * Outils d'interaction utilisateur pour les agents BAVINI
 *
 * Implémente les outils inspirés de Claude Code:
 * - AskUserQuestion: Poser des questions structurées à l'utilisateur
 * - TodoWrite: Gérer une liste de tâches visible par l'utilisateur
 *
 * @module agents/tools/interaction-tools
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Option pour une question
 */
export interface QuestionOption {
  /** Label affiché à l'utilisateur */
  label: string;

  /** Description de l'option */
  description?: string;

  /** Valeur retournée si sélectionnée */
  value?: string;
}

/**
 * Question à poser à l'utilisateur
 */
export interface UserQuestion {
  /** La question à poser */
  question: string;

  /** En-tête court (max 12 chars) */
  header?: string;

  /** Options de réponse */
  options: QuestionOption[];

  /** Permettre la sélection multiple */
  multiSelect?: boolean;

  /** Permettre une réponse personnalisée */
  allowCustom?: boolean;
}

/**
 * Réponse de l'utilisateur
 */
export interface UserAnswer {
  /** Question posée */
  question: string;

  /** Réponse(s) sélectionnée(s) */
  selected: string[];

  /** Réponse personnalisée si applicable */
  customAnswer?: string;

  /** Timestamp de la réponse */
  answeredAt: Date;
}

/**
 * Élément de la liste de tâches
 */
export interface TodoItem {
  /** ID unique de la tâche */
  id: string;

  /** Contenu de la tâche (forme impérative) */
  content: string;

  /** Forme active (présent continu pour affichage) */
  activeForm?: string;

  /** Statut de la tâche */
  status: 'pending' | 'in_progress' | 'completed';

  /** Timestamp de création */
  createdAt: Date;

  /** Timestamp de mise à jour */
  updatedAt?: Date;
}

/**
 * État de la liste de tâches
 */
export interface TodoState {
  /** Liste des tâches */
  items: TodoItem[];

  /** Timestamp de dernière mise à jour */
  lastUpdated: Date;

  /** Statistiques */
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
}

/**
 * Callback pour demander une réponse à l'utilisateur
 */
export type AskUserCallback = (questions: UserQuestion[]) => Promise<UserAnswer[]>;

/**
 * Callback pour mettre à jour la liste de tâches
 */
export type UpdateTodosCallback = (todos: TodoItem[]) => Promise<void>;

/**
 * Callback pour obtenir l'état actuel des tâches
 */
export type GetTodosCallback = () => TodoItem[];

/*
 * ============================================================================
 * TOOL DEFINITIONS
 * ============================================================================
 */

/**
 * Outil AskUserQuestion - Poser des questions structurées
 */
export const AskUserQuestionTool: ToolDefinition = {
  name: 'ask_user_question',
  description: `Poser une question à l'utilisateur pour obtenir des clarifications ou des choix.
Utilise cet outil quand tu as besoin de:
- Clarifier une ambiguïté dans la demande
- Proposer plusieurs approches et laisser l'utilisateur choisir
- Obtenir des préférences de l'utilisateur
- Confirmer une action importante avant de l'exécuter

L'utilisateur verra les options et pourra choisir ou fournir une réponse personnalisée.`,
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'Liste des questions à poser (1-4 questions)',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'La question complète à poser',
            },
            header: {
              type: 'string',
              description: 'En-tête court (max 12 chars) pour identifier la question',
            },
            options: {
              type: 'array',
              description: 'Options de réponse (2-4 options)',
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: "Label de l'option (1-5 mots)",
                  },
                  description: {
                    type: 'string',
                    description: "Explication de l'option",
                  },
                },
                required: ['label'],
              },
            },
            multiSelect: {
              type: 'boolean',
              description: 'Permettre plusieurs sélections',
            },
          },
          required: ['question', 'options'],
        },
        minItems: 1,
        maxItems: 4,
      },
    },
    required: ['questions'],
  },
};

/**
 * Outil TodoWrite - Gérer la liste de tâches
 */
export const TodoWriteTool: ToolDefinition = {
  name: 'todo_write',
  description: `Créer et gérer une liste de tâches pour suivre la progression.
Utilise cet outil pour:
- Planifier les étapes d'une tâche complexe (3+ étapes)
- Montrer à l'utilisateur ce que tu fais
- Suivre ta progression sur plusieurs actions
- Organiser un travail multi-étapes

Règles importantes:
- Marque une tâche 'in_progress' AVANT de commencer à travailler dessus
- Marque 'completed' IMMÉDIATEMENT après avoir terminé (ne pas accumuler)
- Une seule tâche 'in_progress' à la fois
- Utilise pour les tâches non-triviales (pas pour les questions simples)`,
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'Liste mise à jour des tâches',
        items: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Description de la tâche (forme impérative: "Créer...", "Modifier...")',
            },
            activeForm: {
              type: 'string',
              description: 'Forme active pour l\'affichage ("Créant...", "Modifiant...")',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Statut de la tâche',
            },
          },
          required: ['content', 'status'],
        },
      },
    },
    required: ['todos'],
  },
};

/**
 * Liste complète des outils d'interaction
 */
export const INTERACTION_TOOLS: ToolDefinition[] = [AskUserQuestionTool, TodoWriteTool];

/*
 * ============================================================================
 * TOOL HANDLERS
 * ============================================================================
 */

/**
 * État interne pour les todos
 */
let currentTodos: TodoItem[] = [];
let todoIdCounter = 0;

/**
 * Créer les handlers pour les outils d'interaction
 */
export function createInteractionToolHandlers(
  askUserCallback?: AskUserCallback,
  updateTodosCallback?: UpdateTodosCallback,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  return {
    /**
     * Handler pour ask_user_question
     */
    ask_user_question: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const questionsInput = input.questions as Array<{
        question: string;
        header?: string;
        options: Array<{ label: string; description?: string }>;
        multiSelect?: boolean;
      }>;

      if (!questionsInput || questionsInput.length === 0) {
        return {
          success: false,
          output: 'Aucune question fournie',
          error: 'INVALID_INPUT',
        };
      }

      // Convertir en format UserQuestion
      const questions: UserQuestion[] = questionsInput.map((q) => ({
        question: q.question,
        header: q.header,
        options: q.options.map((opt) => ({
          label: opt.label,
          description: opt.description,
        })),
        multiSelect: q.multiSelect ?? false,
        allowCustom: true, // Toujours permettre "Autre"
      }));

      // Si callback fourni, l'utiliser pour obtenir les réponses
      if (askUserCallback) {
        try {
          const answers = await askUserCallback(questions);

          return {
            success: true,
            output: JSON.stringify({
              answered: true,
              answers: answers.map((a) => ({
                question: a.question,
                selected: a.selected,
                customAnswer: a.customAnswer,
              })),
            }),
          };
        } catch (error) {
          return {
            success: false,
            output: `Erreur lors de la demande: ${error instanceof Error ? error.message : String(error)}`,
            error: 'CALLBACK_ERROR',
          };
        }
      }

      // Mode mock: retourner les questions en attente
      return {
        success: true,
        output: JSON.stringify({
          waiting: true,
          questions: questions.map((q) => ({
            question: q.question,
            header: q.header,
            options: q.options.map((o) => o.label),
            multiSelect: q.multiSelect,
          })),
          message: "Questions envoyées à l'utilisateur. En attente de réponse.",
        }),
      };
    },

    /**
     * Handler pour todo_write
     */
    todo_write: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const todosInput = input.todos as Array<{
        content: string;
        activeForm?: string;
        status: 'pending' | 'in_progress' | 'completed';
      }>;

      if (!todosInput) {
        return {
          success: false,
          output: 'Aucune tâche fournie',
          error: 'INVALID_INPUT',
        };
      }

      // Mettre à jour la liste des todos
      const now = new Date();
      currentTodos = todosInput.map((todo, index) => {
        const existing = currentTodos.find((t) => t.content === todo.content || t.id === `todo-${index}`);

        return {
          id: existing?.id || `todo-${++todoIdCounter}`,
          content: todo.content,
          activeForm: todo.activeForm || todo.content,
          status: todo.status,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
      });

      // Calculer les stats
      const stats = {
        total: currentTodos.length,
        pending: currentTodos.filter((t) => t.status === 'pending').length,
        inProgress: currentTodos.filter((t) => t.status === 'in_progress').length,
        completed: currentTodos.filter((t) => t.status === 'completed').length,
      };

      // Notifier via callback si fourni
      if (updateTodosCallback) {
        try {
          await updateTodosCallback(currentTodos);
        } catch (error) {
          // Log mais ne pas échouer
          console.warn('Failed to notify todo update:', error);
        }
      }

      // Construire l'affichage
      const display = currentTodos
        .map((t) => {
          const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
          return `${icon} ${t.status === 'in_progress' ? t.activeForm : t.content}`;
        })
        .join('\n');

      return {
        success: true,
        output: JSON.stringify({
          updated: true,
          todos: currentTodos.map((t) => ({
            id: t.id,
            content: t.content,
            status: t.status,
          })),
          stats,
          display,
        }),
      };
    },
  };
}

/*
 * ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

/**
 * Obtenir l'état actuel des todos
 */
export function getCurrentTodos(): TodoItem[] {
  return [...currentTodos];
}

/**
 * Obtenir l'état complet des todos avec stats
 */
export function getTodoState(): TodoState {
  return {
    items: [...currentTodos],
    lastUpdated: new Date(),
    stats: {
      total: currentTodos.length,
      pending: currentTodos.filter((t) => t.status === 'pending').length,
      inProgress: currentTodos.filter((t) => t.status === 'in_progress').length,
      completed: currentTodos.filter((t) => t.status === 'completed').length,
    },
  };
}

/**
 * Réinitialiser les todos (pour les tests ou nouvelle session)
 */
export function resetTodos(): void {
  currentTodos = [];
  todoIdCounter = 0;
}

/**
 * Trouver une tâche en cours
 */
export function getInProgressTodo(): TodoItem | undefined {
  return currentTodos.find((t) => t.status === 'in_progress');
}

/**
 * Marquer une tâche comme complétée par son contenu
 */
export function markTodoCompleted(content: string): boolean {
  const todo = currentTodos.find((t) => t.content === content);

  if (todo) {
    todo.status = 'completed';
    todo.updatedAt = new Date();
    return true;
  }

  return false;
}

/**
 * Formater les todos pour affichage dans le prompt
 */
export function formatTodosForPrompt(): string {
  if (currentTodos.length === 0) {
    return '';
  }

  const lines = currentTodos.map((t) => {
    const statusIcon =
      t.status === 'completed' ? '[completed]' : t.status === 'in_progress' ? '[in_progress]' : '[pending]';
    return `${statusIcon} ${t.content}`;
  });

  return `\n\n<current-todos>\n${lines.join('\n')}\n</current-todos>`;
}
