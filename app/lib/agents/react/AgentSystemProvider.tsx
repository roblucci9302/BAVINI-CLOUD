'use client';

/**
 * AgentSystemProvider - React integration for BAVINI agent system
 *
 * Provides React context for the agent system, including:
 * - Agent executor singleton
 * - Approval flow integration
 * - Status monitoring
 */

import React, { createContext, useContext, useEffect, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import {
  AgentExecutor,
  getAgentExecutor,
  resetAgentExecutor,
  type ExecutorConfig,
  type ToolCallRequest,
  type ExecutionContext,
} from '../adapters/agent-executor';
import {
  chatStore,
  pendingBatchStore,
  approvalModalOpenStore,
  processedBatchesStore,
  approveAllActions,
  approveSelectedActions,
  rejectAllActions,
  type AgentControlMode,
} from '~/lib/stores/chat';
import {
  agentStatusStore,
  activeAgentsStore,
  activeAgentCountStore,
  agentStatsStore,
  systemLogsStore,
  resetAgentStores,
} from '~/lib/stores/agents';
import {
  userQuestionsStore,
  questionModalOpenStore,
  hasPendingQuestion,
  createAskUserCallback,
} from '~/lib/stores/userQuestions';
import type { AgentType, ToolExecutionResult, Task, TaskResult } from '../types';
import type { PendingActionBatch, ProposedAction } from '../security/action-validator';
import type { UserQuestion, UserAnswer } from '../tools/interaction-tools';

/*
 * ============================================================================
 * CONTEXT TYPES
 * ============================================================================
 */

export interface AgentSystemContextValue {
  // State
  isInitialized: boolean;
  controlMode: AgentControlMode;
  activeAgents: AgentType[];
  activeCount: number;

  // Executor methods
  executeTool: (request: ToolCallRequest, context: ExecutionContext) => Promise<ToolExecutionResult>;
  executeToolBatch: (
    requests: ToolCallRequest[],
    context: ExecutionContext,
  ) => Promise<Map<string, ToolExecutionResult>>;

  // Task management
  startTask: (task: Task, agentName: AgentType) => Promise<void>;
  completeTask: (task: Task, agentName: AgentType, result: TaskResult) => Promise<void>;

  // Configuration
  setControlMode: (mode: AgentControlMode) => void;

  // Approval
  pendingBatch: PendingActionBatch | null;
  isApprovalModalOpen: boolean;
  approveAll: () => void;
  approveSelected: (actionIds: string[]) => void;
  rejectAll: () => void;
  closeApprovalModal: () => void;

  // User Questions
  askUserCallback: (questions: UserQuestion[]) => Promise<UserAnswer[]>;
  hasPendingQuestion: boolean;
  isQuestionModalOpen: boolean;

  // Reset
  reset: () => void;
}

/*
 * ============================================================================
 * CONTEXT
 * ============================================================================
 */

const AgentSystemContext = createContext<AgentSystemContextValue | null>(null);

/*
 * ============================================================================
 * PROVIDER PROPS
 * ============================================================================
 */

export interface AgentSystemProviderProps {
  children: ReactNode;

  /** Initial control mode */
  initialControlMode?: AgentControlMode;

  /** Global timeout for operations */
  globalTimeout?: number;

  /** Callback when batch is approved */
  onBatchApproved?: (batch: PendingActionBatch) => void;

  /** Callback when batch is rejected */
  onBatchRejected?: (batch: PendingActionBatch) => void;

  /** Callback when action is executed */
  onActionExecuted?: (action: ProposedAction, result: ToolExecutionResult) => void;

  /** Callback on error */
  onError?: (error: Error, action?: ProposedAction) => void;
}

/*
 * ============================================================================
 * PROVIDER COMPONENT
 * ============================================================================
 */

export function AgentSystemProvider({
  children,
  initialControlMode = 'strict',
  globalTimeout = 300000,
  onBatchApproved,
  onBatchRejected,
  onActionExecuted,
  onError,
}: AgentSystemProviderProps) {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [executor, setExecutor] = useState<AgentExecutor | null>(null);

  // Store subscriptions
  const chatState = useStore(chatStore);
  const pendingBatch = useStore(pendingBatchStore);
  const isApprovalModalOpen = useStore(approvalModalOpenStore);
  const activeAgents = useStore(activeAgentsStore);
  const activeCount = useStore(activeAgentCountStore);
  const pendingQuestion = useStore(hasPendingQuestion);
  const isQuestionModalOpen = useStore(questionModalOpenStore);

  // Create askUser callback
  const askUserCallback = useMemo(() => createAskUserCallback(), []);

  // Initialize executor
  useEffect(() => {
    const config: Partial<ExecutorConfig> = {
      controlMode: initialControlMode,
      globalTimeout,
      onBatchApproved,
      onBatchRejected,
      onActionExecuted,
      onError,
    };

    const exec = getAgentExecutor(config);
    setExecutor(exec);
    setIsInitialized(true);

    return () => {
      // Cleanup on unmount - don't reset, just mark as not initialized
      setIsInitialized(false);
    };
  }, [initialControlMode, globalTimeout, onBatchApproved, onBatchRejected, onActionExecuted, onError]);

  // Update executor config when control mode changes
  useEffect(() => {
    if (executor && chatState.controlMode) {
      executor.updateConfig({ controlMode: chatState.controlMode });
    }
  }, [executor, chatState.controlMode]);

  // Executor methods
  const executeTool = useCallback(
    async (request: ToolCallRequest, context: ExecutionContext) => {
      if (!executor) {
        return {
          success: false,
          output: null,
          error: 'Agent system not initialized',
        };
      }

      return executor.executeTool(request, context);
    },
    [executor],
  );

  const executeToolBatch = useCallback(
    async (requests: ToolCallRequest[], context: ExecutionContext) => {
      if (!executor) {
        return new Map();
      }

      return executor.executeToolBatch(requests, context);
    },
    [executor],
  );

  const startTask = useCallback(
    async (task: Task, agentName: AgentType) => {
      if (executor) {
        await executor.startTask(task, agentName);
      }
    },
    [executor],
  );

  const completeTask = useCallback(
    async (task: Task, agentName: AgentType, result: TaskResult) => {
      if (executor) {
        await executor.completeTask(task, agentName, result);
      }
    },
    [executor],
  );

  // Configuration
  const setControlMode = useCallback((mode: AgentControlMode) => {
    chatStore.setKey('controlMode', mode);
  }, []);

  // Approval methods
  const approveAll = useCallback(() => {
    approveAllActions();
  }, []);

  const approveSelected = useCallback((actionIds: string[]) => {
    approveSelectedActions(actionIds);
  }, []);

  const rejectAll = useCallback(() => {
    rejectAllActions();
  }, []);

  const closeApprovalModal = useCallback(() => {
    approvalModalOpenStore.set(false);
  }, []);

  // Reset
  const reset = useCallback(() => {
    resetAgentExecutor();
    resetAgentStores();

    // Reinitialize
    const exec = getAgentExecutor({
      controlMode: chatState.controlMode,
      globalTimeout,
    });
    setExecutor(exec);
  }, [chatState.controlMode, globalTimeout]);

  // Context value
  const contextValue = useMemo<AgentSystemContextValue>(
    () => ({
      isInitialized,
      controlMode: chatState.controlMode,
      activeAgents,
      activeCount,
      executeTool,
      executeToolBatch,
      startTask,
      completeTask,
      setControlMode,
      pendingBatch,
      isApprovalModalOpen,
      approveAll,
      approveSelected,
      rejectAll,
      closeApprovalModal,
      askUserCallback,
      hasPendingQuestion: pendingQuestion,
      isQuestionModalOpen,
      reset,
    }),
    [
      isInitialized,
      chatState.controlMode,
      activeAgents,
      activeCount,
      executeTool,
      executeToolBatch,
      startTask,
      completeTask,
      setControlMode,
      pendingBatch,
      isApprovalModalOpen,
      approveAll,
      approveSelected,
      rejectAll,
      closeApprovalModal,
      askUserCallback,
      pendingQuestion,
      isQuestionModalOpen,
      reset,
    ],
  );

  return <AgentSystemContext.Provider value={contextValue}>{children}</AgentSystemContext.Provider>;
}

/*
 * ============================================================================
 * HOOKS
 * ============================================================================
 */

/**
 * Main hook to access the agent system
 */
export function useAgentSystem(): AgentSystemContextValue {
  const context = useContext(AgentSystemContext);

  if (!context) {
    throw new Error('useAgentSystem must be used within AgentSystemProvider');
  }

  return context;
}

/**
 * Hook for agent status monitoring
 */
export function useAgentStatus() {
  const statuses = useStore(agentStatusStore);
  const activeAgents = useStore(activeAgentsStore);
  const activeCount = useStore(activeAgentCountStore);
  const stats = useStore(agentStatsStore);

  return {
    statuses,
    activeAgents,
    activeCount,
    stats,
  };
}

/**
 * Hook for system logs
 */
export function useAgentLogs(maxLogs = 100) {
  const logs = useStore(systemLogsStore);

  return useMemo(() => logs.slice(-maxLogs), [logs, maxLogs]);
}

/**
 * Hook for approval flow
 */
export function useAgentApproval() {
  const pendingBatch = useStore(pendingBatchStore);
  const isModalOpen = useStore(approvalModalOpenStore);
  const processedBatches = useStore(processedBatchesStore);

  const approveAll = useCallback(() => {
    approveAllActions();
  }, []);

  const approveSelected = useCallback((actionIds: string[]) => {
    approveSelectedActions(actionIds);
  }, []);

  const rejectAll = useCallback(() => {
    rejectAllActions();
  }, []);

  const closeModal = useCallback(() => {
    approvalModalOpenStore.set(false);
  }, []);

  return {
    pendingBatch,
    isModalOpen,
    processedBatches,
    approveAll,
    approveSelected,
    rejectAll,
    closeModal,
  };
}

/**
 * Hook for control mode
 */
export function useAgentControlMode() {
  const chatState = useStore(chatStore);

  const setMode = useCallback((mode: AgentControlMode) => {
    chatStore.setKey('controlMode', mode);
  }, []);

  return {
    mode: chatState.controlMode,
    setMode,
    isStrict: chatState.controlMode === 'strict',
    isModerate: chatState.controlMode === 'moderate',
    isPermissive: chatState.controlMode === 'permissive',
  };
}

/**
 * Hook to check if agent mode is active
 */
export function useIsAgentMode() {
  const chatState = useStore(chatStore);
  return chatState.mode === 'agent';
}

/**
 * Hook for user questions (AskUserQuestion tool)
 */
export function useUserQuestions() {
  const userQuestionsState = useStore(userQuestionsStore);
  const isModalOpen = useStore(questionModalOpenStore);

  return {
    pendingQuestion: userQuestionsState.pending,
    questions: userQuestionsState.pending?.questions ?? null,
    history: userQuestionsState.history,
    isModalOpen,
    hasPending: userQuestionsState.pending !== null,
  };
}
