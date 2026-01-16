/**
 * Tests pour les outils d'interaction utilisateur
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AskUserQuestionTool,
  TodoWriteTool,
  INTERACTION_TOOLS,
  createInteractionToolHandlers,
  getCurrentTodos,
  getTodoState,
  resetTodos,
  getInProgressTodo,
  markTodoCompleted,
  formatTodosForPrompt,
  type UserQuestion,
  type UserAnswer,
  type TodoItem,
} from './interaction-tools';

/*
 * ============================================================================
 * TOOL DEFINITIONS TESTS
 * ============================================================================
 */

describe('Interaction Tool Definitions', () => {
  describe('AskUserQuestionTool', () => {
    it('should have correct name', () => {
      expect(AskUserQuestionTool.name).toBe('ask_user_question');
    });

    it('should have description mentioning clarification', () => {
      expect(AskUserQuestionTool.description).toContain('clarification');
    });

    it('should have required questions property', () => {
      expect(AskUserQuestionTool.inputSchema.required).toContain('questions');
    });

    it('should define questions as array with 1-4 items', () => {
      const props = AskUserQuestionTool.inputSchema.properties as Record<string, unknown>;
      const questions = props.questions as { minItems: number; maxItems: number };
      expect(questions.minItems).toBe(1);
      expect(questions.maxItems).toBe(4);
    });
  });

  describe('TodoWriteTool', () => {
    it('should have correct name', () => {
      expect(TodoWriteTool.name).toBe('todo_write');
    });

    it('should have description mentioning task tracking', () => {
      expect(TodoWriteTool.description).toContain('progression');
    });

    it('should have required todos property', () => {
      expect(TodoWriteTool.inputSchema.required).toContain('todos');
    });

    it('should define status enum with correct values', () => {
      const props = TodoWriteTool.inputSchema.properties as Record<string, unknown>;
      const todos = props.todos as { items: { properties: { status: { enum: string[] } } } };
      expect(todos.items.properties.status.enum).toEqual(['pending', 'in_progress', 'completed']);
    });
  });

  describe('INTERACTION_TOOLS', () => {
    it('should contain both tools', () => {
      expect(INTERACTION_TOOLS).toHaveLength(2);
      expect(INTERACTION_TOOLS.map((t) => t.name)).toContain('ask_user_question');
      expect(INTERACTION_TOOLS.map((t) => t.name)).toContain('todo_write');
    });
  });
});

/*
 * ============================================================================
 * ASK USER QUESTION HANDLER TESTS
 * ============================================================================
 */

describe('AskUserQuestion Handler', () => {
  let handlers: ReturnType<typeof createInteractionToolHandlers>;

  beforeEach(() => {
    handlers = createInteractionToolHandlers();
  });

  it('should return error for empty questions', async () => {
    const result = await handlers.ask_user_question({ questions: [] });

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_INPUT');
  });

  it('should return waiting status in mock mode', async () => {
    const result = await handlers.ask_user_question({
      questions: [
        {
          question: 'Which approach?',
          options: [{ label: 'Option A' }, { label: 'Option B' }],
        },
      ],
    });

    expect(result.success).toBe(true);

    const output = JSON.parse(result.output as string);
    expect(output.waiting).toBe(true);
    expect(output.questions).toHaveLength(1);
    expect(output.questions[0].question).toBe('Which approach?');
  });

  it('should use callback when provided', async () => {
    const mockCallback = vi.fn().mockResolvedValue([
      {
        question: 'Test question?',
        selected: ['Option B'],
        answeredAt: new Date(),
      },
    ]);

    const handlersWithCallback = createInteractionToolHandlers(mockCallback);

    const result = await handlersWithCallback.ask_user_question({
      questions: [
        {
          question: 'Test question?',
          options: [{ label: 'Option A' }, { label: 'Option B' }],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(mockCallback).toHaveBeenCalledTimes(1);

    const output = JSON.parse(result.output as string);
    expect(output.answered).toBe(true);
    expect(output.answers[0].selected).toContain('Option B');
  });

  it('should handle callback errors', async () => {
    const errorCallback = vi.fn().mockRejectedValue(new Error('User cancelled'));

    const handlersWithCallback = createInteractionToolHandlers(errorCallback);

    const result = await handlersWithCallback.ask_user_question({
      questions: [
        {
          question: 'Test?',
          options: [{ label: 'Yes' }],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('CALLBACK_ERROR');
  });

  it('should handle multiSelect option', async () => {
    const result = await handlers.ask_user_question({
      questions: [
        {
          question: 'Select features',
          options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
          multiSelect: true,
        },
      ],
    });

    expect(result.success).toBe(true);

    const output = JSON.parse(result.output as string);
    expect(output.questions[0].multiSelect).toBe(true);
  });
});

/*
 * ============================================================================
 * TODO WRITE HANDLER TESTS
 * ============================================================================
 */

describe('TodoWrite Handler', () => {
  let handlers: ReturnType<typeof createInteractionToolHandlers>;

  beforeEach(() => {
    resetTodos();
    handlers = createInteractionToolHandlers();
  });

  it('should return error for missing todos', async () => {
    const result = await handlers.todo_write({});

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_INPUT');
  });

  it('should create todos from input', async () => {
    const result = await handlers.todo_write({
      todos: [
        { content: 'Task 1', status: 'pending' },
        { content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' },
        { content: 'Task 3', status: 'completed' },
      ],
    });

    expect(result.success).toBe(true);

    const output = JSON.parse(result.output as string);
    expect(output.updated).toBe(true);
    expect(output.todos).toHaveLength(3);
    expect(output.stats.total).toBe(3);
    expect(output.stats.pending).toBe(1);
    expect(output.stats.inProgress).toBe(1);
    expect(output.stats.completed).toBe(1);
  });

  it('should generate display with icons', async () => {
    const result = await handlers.todo_write({
      todos: [
        { content: 'Pending task', status: 'pending' },
        { content: 'Active task', status: 'in_progress', activeForm: 'Doing active task' },
        { content: 'Done task', status: 'completed' },
      ],
    });

    const output = JSON.parse(result.output as string);
    expect(output.display).toContain('⏳');
    expect(output.display).toContain('🔄');
    expect(output.display).toContain('✅');
    expect(output.display).toContain('Doing active task'); // Uses activeForm
  });

  it('should call update callback when provided', async () => {
    const mockCallback = vi.fn();
    const handlersWithCallback = createInteractionToolHandlers(undefined, mockCallback);

    await handlersWithCallback.todo_write({
      todos: [{ content: 'Test task', status: 'pending' }],
    });

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ content: 'Test task', status: 'pending' })]),
    );
  });

  it('should preserve existing todo IDs on update', async () => {
    // Create initial todos
    await handlers.todo_write({
      todos: [{ content: 'Task 1', status: 'pending' }],
    });

    const initialTodos = getCurrentTodos();
    const initialId = initialTodos[0].id;

    // Update with same content
    await handlers.todo_write({
      todos: [{ content: 'Task 1', status: 'completed' }],
    });

    const updatedTodos = getCurrentTodos();
    expect(updatedTodos[0].id).toBe(initialId);
    expect(updatedTodos[0].status).toBe('completed');
  });
});

/*
 * ============================================================================
 * UTILITY FUNCTIONS TESTS
 * ============================================================================
 */

describe('Todo Utility Functions', () => {
  beforeEach(() => {
    resetTodos();
  });

  describe('getCurrentTodos', () => {
    it('should return empty array initially', () => {
      expect(getCurrentTodos()).toEqual([]);
    });

    it('should return copy of todos', async () => {
      const handlers = createInteractionToolHandlers();
      await handlers.todo_write({
        todos: [{ content: 'Task', status: 'pending' }],
      });

      const todos1 = getCurrentTodos();
      const todos2 = getCurrentTodos();
      expect(todos1).not.toBe(todos2);
      expect(todos1).toEqual(todos2);
    });
  });

  describe('getTodoState', () => {
    it('should return complete state with stats', async () => {
      const handlers = createInteractionToolHandlers();
      await handlers.todo_write({
        todos: [
          { content: 'A', status: 'pending' },
          { content: 'B', status: 'in_progress' },
        ],
      });

      const state = getTodoState();
      expect(state.items).toHaveLength(2);
      expect(state.stats.total).toBe(2);
      expect(state.stats.pending).toBe(1);
      expect(state.stats.inProgress).toBe(1);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('getInProgressTodo', () => {
    it('should return undefined when no in_progress todo', () => {
      expect(getInProgressTodo()).toBeUndefined();
    });

    it('should return the in_progress todo', async () => {
      const handlers = createInteractionToolHandlers();
      await handlers.todo_write({
        todos: [
          { content: 'Done', status: 'completed' },
          { content: 'Working', status: 'in_progress' },
          { content: 'Waiting', status: 'pending' },
        ],
      });

      const inProgress = getInProgressTodo();
      expect(inProgress).toBeDefined();
      expect(inProgress!.content).toBe('Working');
    });
  });

  describe('markTodoCompleted', () => {
    it('should mark todo as completed by content', async () => {
      const handlers = createInteractionToolHandlers();
      await handlers.todo_write({
        todos: [{ content: 'Test task', status: 'in_progress' }],
      });

      const result = markTodoCompleted('Test task');
      expect(result).toBe(true);

      const todos = getCurrentTodos();
      expect(todos[0].status).toBe('completed');
    });

    it('should return false for non-existent todo', () => {
      const result = markTodoCompleted('Non-existent');
      expect(result).toBe(false);
    });
  });

  describe('formatTodosForPrompt', () => {
    it('should return empty string when no todos', () => {
      expect(formatTodosForPrompt()).toBe('');
    });

    it('should format todos with status markers', async () => {
      const handlers = createInteractionToolHandlers();
      await handlers.todo_write({
        todos: [
          { content: 'Pending', status: 'pending' },
          { content: 'Working', status: 'in_progress' },
          { content: 'Done', status: 'completed' },
        ],
      });

      const formatted = formatTodosForPrompt();
      expect(formatted).toContain('<current-todos>');
      expect(formatted).toContain('[pending] Pending');
      expect(formatted).toContain('[in_progress] Working');
      expect(formatted).toContain('[completed] Done');
      expect(formatted).toContain('</current-todos>');
    });
  });

  describe('resetTodos', () => {
    it('should clear all todos', async () => {
      const handlers = createInteractionToolHandlers();
      await handlers.todo_write({
        todos: [{ content: 'Task', status: 'pending' }],
      });

      expect(getCurrentTodos()).toHaveLength(1);

      resetTodos();

      expect(getCurrentTodos()).toHaveLength(0);
    });
  });
});
