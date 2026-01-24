/**
 * Agent Executor - Central orchestration for agent actions
 *
 * Entry point for all agent action execution.
 * Handles:
 * - Action batching for approval
 * - Sequential or parallel execution
 * - Result reporting
 */

import { createScopedLogger } from '~/utils/logger';
import type { AgentType, ToolType, ToolExecutionResult, Task, TaskResult } from '../types';
import {
  createProposedAction,
  createActionBatch,
  type ProposedAction,
  type PendingActionBatch,
  type FileCreateDetails,
  type FileModifyDetails,
  type FileDeleteDetails,
} from '../security/action-validator';
// BAVINI Adapters via Factory
import {
  createFSAdapter,
  createShellAdapter,
  createFileOperationsAdapter,
  type IFSAdapter,
  type IShellAdapter,
  type IFileOperationsAdapter,
} from './adapter-factory';
import {
  pendingBatchStore,
  approvalModalOpenStore,
  processedBatchesStore,
  type AgentControlMode,
} from '~/lib/stores/chat';
import { addAgentLog, updateAgentStatus, setCurrentTask } from '~/lib/stores/agents';

const logger = createScopedLogger('AgentExecutor');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface ExecutorConfig {
  /** Control mode */
  controlMode: AgentControlMode;

  /** Global timeout in ms */
  globalTimeout?: number;

  /** Allow parallel execution? */
  allowParallel?: boolean;

  /** Callbacks */
  onBatchApproved?: (batch: PendingActionBatch) => void;
  onBatchRejected?: (batch: PendingActionBatch) => void;
  onActionExecuted?: (action: ProposedAction, result: ToolExecutionResult) => void;
  onError?: (error: Error, action?: ProposedAction) => void;
}

export interface ToolCallRequest {
  /** Tool name */
  name: ToolType | string;

  /** Input parameters */
  input: Record<string, unknown>;

  /** Call ID (optional) */
  callId?: string;
}

export interface ExecutionContext {
  /** Executing agent */
  agentName: AgentType;

  /** Current task */
  task?: Task;

  /** Session ID */
  sessionId?: string;
}

interface ApprovalResolver {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
}

/*
 * ============================================================================
 * AGENT EXECUTOR CLASS
 * ============================================================================
 */

export class AgentExecutor {
  private config: ExecutorConfig;
  private adapters: Map<
    AgentType,
    {
      fs: IFSAdapter;
      files: IFileOperationsAdapter;
      shell: IShellAdapter;
    }
  > = new Map();

  // Queue of actions waiting for approval
  private pendingApprovals: Map<string, ApprovalResolver> = new Map();

  // Executed actions (for potential rollback)
  private executedActions: ProposedAction[] = [];

  // Store unsubscribe function to prevent memory leaks
  private unsubscribeBatch: (() => void) | null = null;

  constructor(config: ExecutorConfig) {
    this.config = {
      globalTimeout: 300000, // 5 minutes
      allowParallel: false,
      ...config,
    };

    // Listen for batch processed changes
    this.setupBatchListener();
  }

  /**
   * Setup listener for batch approvals
   * Stores unsubscribe function to prevent memory leaks
   */
  private setupBatchListener(): void {
    // Clean up any existing subscription first
    if (this.unsubscribeBatch) {
      this.unsubscribeBatch();
      this.unsubscribeBatch = null;
    }

    this.unsubscribeBatch = processedBatchesStore.subscribe((batches) => {
      const lastBatch = batches[batches.length - 1];

      if (lastBatch) {
        const resolver = this.pendingApprovals.get(lastBatch.id);

        if (resolver) {
          const hasApprovedActions = lastBatch.actions.some((a) => a.status === 'approved');
          resolver.resolve(hasApprovedActions);
          this.pendingApprovals.delete(lastBatch.id);
        }
      }
    });
  }

  /*
   * --------------------------------------------------------------------------
   * TOOL EXECUTION
   * --------------------------------------------------------------------------
   */

  /**
   * Execute a tool call
   */
  async executeTool(request: ToolCallRequest, context: ExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const { name, input } = request;
    const { agentName, task } = context;

    this.log(agentName, 'debug', `Executing tool: ${name}`);
    updateAgentStatus(agentName, 'executing');

    try {
      const adapters = this.getAdaptersForAgent(agentName, task?.id);
      let result: ToolExecutionResult;

      switch (name) {
        // Read-only - no approval needed
        case 'read_file':
          result = await adapters.files.readFile(input.path as string);
          break;

        case 'list_directory':
          result = await adapters.fs.listDirectory(input.path as string);
          break;

        case 'glob':
          result = await adapters.files.glob({
            pattern: input.pattern as string,
            cwd: input.cwd as string | undefined,
            ignore: input.ignore as string[] | undefined,
          });
          break;

        case 'grep':
          result = await adapters.files.grep({
            pattern: input.pattern as string,
            include: input.include as string | undefined,
            exclude: input.exclude as string[] | undefined,
            ignoreCase: input.ignoreCase as boolean | undefined,
            contextBefore: input.contextBefore as number | undefined,
            contextAfter: input.contextAfter as number | undefined,
            maxResults: input.maxResults as number | undefined,
          });
          break;

        // Write operations - go through FSAdapter with its own approval flow
        case 'write_file':
          result = await adapters.fs.writeFile(input.path as string, input.content as string);
          break;

        case 'create_file':
          result = await adapters.fs.createFile(input.path as string, input.content as string);
          break;

        case 'edit_file':
          result = await adapters.fs.writeFile(input.path as string, input.newContent as string);
          break;

        case 'delete_file':
          result = await adapters.fs.deleteFile(input.path as string);
          break;

        // Shell commands
        case 'shell_command':
          result = await adapters.shell.executeCommand(input.command as string);
          break;

        case 'npm_command': {
          const npmCmd = input.command as string;

          if (npmCmd.startsWith('install')) {
            result = await adapters.shell.npmInstall({
              packages: input.packages as string[] | undefined,
              dev: input.dev as boolean | undefined,
            });
          } else if (npmCmd.startsWith('run')) {
            result = await adapters.shell.npmRun({
              script: input.script as string,
              args: input.args as string[] | undefined,
            });
          } else if (npmCmd === 'test') {
            result = await adapters.shell.npmTest();
          } else if (npmCmd === 'build') {
            result = await adapters.shell.npmBuild();
          } else {
            result = await adapters.shell.executeCommand(`npm ${npmCmd}`);
          }

          break;
        }

        case 'git_command':
          result = await adapters.shell.gitCommand({
            operation: input.operation as 'status' | 'add' | 'commit' | 'push' | 'pull' | 'diff' | 'log' | 'branch',
            args: input.args as string[] | undefined,
          });
          break;

        case 'run_tests':
          result = await adapters.shell.npmTest(input.timeout as number | undefined);
          break;

        default:
          result = {
            success: false,
            output: null,
            error: `Unknown tool: ${name}`,
          };
      }

      result.executionTime = Date.now() - startTime;

      this.log(
        agentName,
        result.success ? 'debug' : 'warn',
        `Tool ${name} ${result.success ? 'succeeded' : 'failed'}: ${result.error || 'OK'}`,
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log(agentName, 'error', `Tool ${name} threw error: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple tools in batch
   */
  async executeToolBatch(
    requests: ToolCallRequest[],
    context: ExecutionContext,
  ): Promise<Map<string, ToolExecutionResult>> {
    const results = new Map<string, ToolExecutionResult>();

    if (this.config.allowParallel) {
      // Parallel execution
      const promises = requests.map(async (req) => {
        const result = await this.executeTool(req, context);
        results.set(req.callId || req.name, result);
      });
      await Promise.all(promises);
    } else {
      // Sequential execution
      for (const req of requests) {
        const result = await this.executeTool(req, context);
        results.set(req.callId || req.name, result);

        // Stop on critical error
        if (!result.success && this.isBlockingError(result.error)) {
          break;
        }
      }
    }

    return results;
  }

  /*
   * --------------------------------------------------------------------------
   * BATCH APPROVAL
   * --------------------------------------------------------------------------
   */

  /**
   * Request batch approval
   */
  requestBatchApproval(batch: PendingActionBatch): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Register the resolver
      this.pendingApprovals.set(batch.id, { resolve, reject });

      // Submit batch to store
      pendingBatchStore.set(batch);
      approvalModalOpenStore.set(true);

      this.log(batch.agent, 'info', `Waiting for approval of ${batch.actions.length} actions`);

      // Timeout to avoid blocking indefinitely
      setTimeout(() => {
        if (this.pendingApprovals.has(batch.id)) {
          this.pendingApprovals.delete(batch.id);
          resolve(false);
          this.log(batch.agent, 'warn', 'Approval timed out');
        }
      }, this.config.globalTimeout);
    });
  }

  /*
   * --------------------------------------------------------------------------
   * TASK MANAGEMENT
   * --------------------------------------------------------------------------
   */

  /**
   * Start task execution
   */
  async startTask(task: Task, agentName: AgentType): Promise<void> {
    this.log(agentName, 'info', `Starting task: ${task.id}`);
    updateAgentStatus(agentName, 'executing');
    setCurrentTask(agentName, task);
  }

  /**
   * Complete a task
   */
  async completeTask(task: Task, agentName: AgentType, result: TaskResult): Promise<void> {
    this.log(agentName, result.success ? 'info' : 'warn', `Task ${task.id} ${result.success ? 'completed' : 'failed'}`);

    updateAgentStatus(agentName, result.success ? 'completed' : 'failed');
    setCurrentTask(agentName, null);

    // Reset to idle after delay
    setTimeout(() => updateAgentStatus(agentName, 'idle'), 1000);
  }

  /*
   * --------------------------------------------------------------------------
   * HELPERS
   * --------------------------------------------------------------------------
   */

  /**
   * Get or create adapters for an agent
   * Uses the adapter factory to create appropriate adapters based on runtime
   */
  private getAdaptersForAgent(agentName: AgentType, taskId?: string) {
    let adapters = this.adapters.get(agentName);

    if (!adapters) {
      const onApprovalRequired = async (action: ProposedAction) => {
        const batch = createActionBatch(agentName, [action], action.description);
        return this.requestBatchApproval(batch);
      };

      // Use the unified adapter factory
      // This will create BAVINI adapters (browser runtime) or WebContainer adapters
      // based on the current runtime configuration
      adapters = {
        fs: createFSAdapter({
          agentName,
          taskId,
          strictMode: this.config.controlMode === 'strict',
          onApprovalRequired,
        }),
        files: createFileOperationsAdapter(agentName, taskId),
        shell: createShellAdapter({
          agentName,
          taskId,
          strictMode: this.config.controlMode === 'strict',
          onApprovalRequired,
        }),
      };

      this.adapters.set(agentName, adapters);
    }

    return adapters;
  }

  /**
   * Check if an error is blocking
   */
  private isBlockingError(error?: string): boolean {
    if (!error) {
      return false;
    }

    const blockingPatterns = ['rejected by user', 'permission denied', 'blocked for security', 'timeout'];

    return blockingPatterns.some((p) => error.toLowerCase().includes(p));
  }

  /**
   * Log with agent context
   */
  private log(agentName: AgentType, level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    logger[level](`[${agentName}] ${message}`);

    addAgentLog(agentName, {
      level,
      message,
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset the executor state (keeps subscriptions active)
   */
  reset(): void {
    this.pendingApprovals.clear();
    this.executedActions = [];
    this.adapters.clear();
  }

  /**
   * Dispose the executor and clean up all subscriptions
   * Call this before destroying the instance to prevent memory leaks
   */
  dispose(): void {
    // Unsubscribe from batch store
    if (this.unsubscribeBatch) {
      this.unsubscribeBatch();
      this.unsubscribeBatch = null;
    }

    // Reject any pending approvals
    this.pendingApprovals.forEach((resolver, batchId) => {
      resolver.reject(new Error('Executor disposed'));
    });
    this.pendingApprovals.clear();

    // Clear all state
    this.reset();

    logger.debug('AgentExecutor disposed');
  }
}

/*
 * ============================================================================
 * SINGLETON
 * ============================================================================
 */

let executorInstance: AgentExecutor | null = null;

/**
 * Get the executor instance (singleton)
 */
export function getAgentExecutor(config?: Partial<ExecutorConfig>): AgentExecutor {
  if (!executorInstance) {
    executorInstance = new AgentExecutor({
      controlMode: 'strict',
      ...config,
    });
  } else if (config) {
    executorInstance.updateConfig(config);
  }

  return executorInstance;
}

/**
 * Reset and dispose the executor (properly cleans up subscriptions)
 */
export function resetAgentExecutor(): void {
  if (executorInstance) {
    executorInstance.dispose();
    executorInstance = null;
  }
}
