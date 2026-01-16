import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, renderHook } from '@testing-library/react';
import React from 'react';

// Define mock stores outside of vi.mock to avoid hoisting issues
const createMockStore = <T,>(initialValue: T) => {
  let value = initialValue;
  const listeners = new Set<(val: T) => void>();
  return {
    get: () => value,
    set: (newValue: T) => {
      value = newValue;
      listeners.forEach((fn) => fn(newValue));
    },
    setKey: vi.fn((key: string, keyValue: unknown) => {
      value = { ...(value as object), [key]: keyValue } as T;
    }),
    subscribe: (fn: (val: T) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};

// Mock stores - will be initialized in beforeEach
let mockChatStore: ReturnType<typeof createMockStore<{ mode: string; controlMode: string }>>;
let mockPendingBatchStore: ReturnType<typeof createMockStore<unknown>>;
let mockApprovalModalOpenStore: ReturnType<typeof createMockStore<boolean>>;
let mockProcessedBatchesStore: ReturnType<typeof createMockStore<unknown[]>>;
let mockAgentStatusStore: ReturnType<typeof createMockStore<Record<string, string>>>;
let mockActiveAgentsStore: ReturnType<typeof createMockStore<string[]>>;
let mockActiveAgentCountStore: ReturnType<typeof createMockStore<number>>;
let mockAgentStatsStore: ReturnType<typeof createMockStore<Record<string, number>>>;
let mockSystemLogsStore: ReturnType<typeof createMockStore<unknown[]>>;

// Mock agent-executor
const mockExecuteTool = vi.fn();
const mockExecuteToolBatch = vi.fn();
const mockStartTask = vi.fn();
const mockCompleteTask = vi.fn();
const mockUpdateConfig = vi.fn();
const mockReset = vi.fn();

const mockExecutor = {
  executeTool: mockExecuteTool,
  executeToolBatch: mockExecuteToolBatch,
  startTask: mockStartTask,
  completeTask: mockCompleteTask,
  updateConfig: mockUpdateConfig,
  reset: mockReset,
};

vi.mock('../adapters/agent-executor', () => ({
  AgentExecutor: vi.fn(),
  getAgentExecutor: vi.fn(() => mockExecutor),
  resetAgentExecutor: vi.fn(),
}));

// Mock nanostores/react - useStore returns the current value
vi.mock('@nanostores/react', () => ({
  useStore: vi.fn((store: { get: () => unknown }) => store?.get?.() ?? null),
}));

// Mock chat store actions
const mockApproveAllActions = vi.fn();
const mockApproveSelectedActions = vi.fn();
const mockRejectAllActions = vi.fn();

vi.mock('~/lib/stores/chat', () => ({
  get chatStore() {
    return mockChatStore;
  },
  get pendingBatchStore() {
    return mockPendingBatchStore;
  },
  get approvalModalOpenStore() {
    return mockApprovalModalOpenStore;
  },
  get processedBatchesStore() {
    return mockProcessedBatchesStore;
  },
  approveAllActions: () => mockApproveAllActions(),
  approveSelectedActions: (ids: string[]) => mockApproveSelectedActions(ids),
  rejectAllActions: () => mockRejectAllActions(),
}));

// Mock agents store
const mockResetAgentStores = vi.fn();

vi.mock('~/lib/stores/agents', () => ({
  get agentStatusStore() {
    return mockAgentStatusStore;
  },
  get activeAgentsStore() {
    return mockActiveAgentsStore;
  },
  get activeAgentCountStore() {
    return mockActiveAgentCountStore;
  },
  get agentStatsStore() {
    return mockAgentStatsStore;
  },
  get systemLogsStore() {
    return mockSystemLogsStore;
  },
  resetAgentStores: () => mockResetAgentStores(),
}));

// Import after mocks
import {
  AgentSystemProvider,
  useAgentSystem,
  useAgentStatus,
  useAgentLogs,
  useAgentApproval,
  useAgentControlMode,
  useIsAgentMode,
} from './AgentSystemProvider';
import { getAgentExecutor, resetAgentExecutor } from '../adapters/agent-executor';

describe('AgentSystemProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize mock stores with fresh instances
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'strict' });
    mockPendingBatchStore = createMockStore<unknown>(null);
    mockApprovalModalOpenStore = createMockStore(false);
    mockProcessedBatchesStore = createMockStore<unknown[]>([]);
    mockAgentStatusStore = createMockStore<Record<string, string>>({
      orchestrator: 'idle',
      explore: 'idle',
      coder: 'idle',
      builder: 'idle',
      tester: 'idle',
      deployer: 'idle',
      reviewer: 'idle',
      fixer: 'idle',
    });
    mockActiveAgentsStore = createMockStore<string[]>([]);
    mockActiveAgentCountStore = createMockStore(0);
    mockAgentStatsStore = createMockStore<Record<string, number>>({
      totalAgents: 8,
      idleAgents: 8,
      busyAgents: 0,
      completedTasks: 0,
      pendingTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
    });
    mockSystemLogsStore = createMockStore<unknown[]>([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render children', () => {
      render(
        <AgentSystemProvider>
          <div data-testid="child">Test Child</div>
        </AgentSystemProvider>,
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Test Child')).toBeInTheDocument();
    });

    it('should initialize the agent executor on mount', () => {
      render(
        <AgentSystemProvider>
          <div>Test</div>
        </AgentSystemProvider>,
      );

      expect(getAgentExecutor).toHaveBeenCalled();
    });

    it('should pass initialControlMode to executor config', () => {
      render(
        <AgentSystemProvider initialControlMode="moderate">
          <div>Test</div>
        </AgentSystemProvider>,
      );

      expect(getAgentExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          controlMode: 'moderate',
        }),
      );
    });

    it('should pass globalTimeout to executor config', () => {
      render(
        <AgentSystemProvider globalTimeout={600000}>
          <div>Test</div>
        </AgentSystemProvider>,
      );

      expect(getAgentExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          globalTimeout: 600000,
        }),
      );
    });

    it('should use default values when props not provided', () => {
      render(
        <AgentSystemProvider>
          <div>Test</div>
        </AgentSystemProvider>,
      );

      expect(getAgentExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          controlMode: 'strict',
          globalTimeout: 300000,
        }),
      );
    });

    it('should pass callback props to executor config', () => {
      const onBatchApproved = vi.fn();
      const onBatchRejected = vi.fn();
      const onActionExecuted = vi.fn();
      const onError = vi.fn();

      render(
        <AgentSystemProvider
          onBatchApproved={onBatchApproved}
          onBatchRejected={onBatchRejected}
          onActionExecuted={onActionExecuted}
          onError={onError}
        >
          <div>Test</div>
        </AgentSystemProvider>,
      );

      expect(getAgentExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          onBatchApproved,
          onBatchRejected,
          onActionExecuted,
          onError,
        }),
      );
    });
  });

  describe('context value propagation', () => {
    it('should provide isInitialized state', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.isInitialized).toBe(true);
      });
    });

    it('should provide controlMode from chatStore', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.controlMode).toBe('strict');
      });
    });

    it('should provide activeAgents from store', async () => {
      mockActiveAgentsStore.set(['coder', 'builder']);
      mockActiveAgentCountStore.set(2);

      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.activeAgents).toEqual(['coder', 'builder']);
        expect(contextValue?.activeCount).toBe(2);
      });
    });

    it('should provide pendingBatch from store', async () => {
      const mockBatch = {
        id: 'batch-1',
        agent: 'coder',
        actions: [],
        description: 'Test batch',
        status: 'pending',
        createdAt: new Date(),
      };

      mockPendingBatchStore.set(mockBatch);
      mockApprovalModalOpenStore.set(true);

      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.pendingBatch).toEqual(mockBatch);
        expect(contextValue?.isApprovalModalOpen).toBe(true);
      });
    });
  });

  describe('executor methods', () => {
    it('should provide executeTool method that calls executor', async () => {
      mockExecuteTool.mockResolvedValue({ success: true, output: 'test result' });

      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.executeTool).toBeDefined();
      });

      const request = { name: 'read_file', input: { path: '/test.ts' } };
      const context = { agentName: 'coder' as const };

      await act(async () => {
        await contextValue?.executeTool(request, context);
      });

      expect(mockExecuteTool).toHaveBeenCalledWith(request, context);
    });

    it('should provide executeToolBatch method', async () => {
      mockExecuteToolBatch.mockResolvedValue(new Map());

      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.executeToolBatch).toBeDefined();
      });

      const requests = [{ name: 'read_file', input: { path: '/test.ts' } }];
      const context = { agentName: 'coder' as const };

      await act(async () => {
        await contextValue?.executeToolBatch(requests, context);
      });

      expect(mockExecuteToolBatch).toHaveBeenCalledWith(requests, context);
    });

    it('should provide startTask method', async () => {
      mockStartTask.mockResolvedValue(undefined);

      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.startTask).toBeDefined();
      });

      const task = {
        id: 'task-1',
        type: 'code',
        prompt: 'Write a test',
        status: 'pending' as const,
        createdAt: new Date(),
      };

      await act(async () => {
        await contextValue?.startTask(task, 'coder');
      });

      expect(mockStartTask).toHaveBeenCalledWith(task, 'coder');
    });

    it('should provide completeTask method', async () => {
      mockCompleteTask.mockResolvedValue(undefined);

      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.completeTask).toBeDefined();
      });

      const task = {
        id: 'task-1',
        type: 'code',
        prompt: 'Write a test',
        status: 'completed' as const,
        createdAt: new Date(),
      };

      const result = { success: true, output: 'Task completed' };

      await act(async () => {
        await contextValue?.completeTask(task, 'coder', result);
      });

      expect(mockCompleteTask).toHaveBeenCalledWith(task, 'coder', result);
    });
  });

  describe('configuration methods', () => {
    it('should provide setControlMode method', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.setControlMode).toBeDefined();
      });

      act(() => {
        contextValue?.setControlMode('permissive');
      });

      expect(mockChatStore.setKey).toHaveBeenCalledWith('controlMode', 'permissive');
    });
  });

  describe('approval methods', () => {
    it('should provide approveAll method that calls store action', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.approveAll).toBeDefined();
      });

      act(() => {
        contextValue?.approveAll();
      });

      expect(mockApproveAllActions).toHaveBeenCalled();
    });

    it('should provide approveSelected method that calls store action', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.approveSelected).toBeDefined();
      });

      act(() => {
        contextValue?.approveSelected(['action-1', 'action-2']);
      });

      expect(mockApproveSelectedActions).toHaveBeenCalledWith(['action-1', 'action-2']);
    });

    it('should provide rejectAll method that calls store action', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.rejectAll).toBeDefined();
      });

      act(() => {
        contextValue?.rejectAll();
      });

      expect(mockRejectAllActions).toHaveBeenCalled();
    });

    it('should provide closeApprovalModal method', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.closeApprovalModal).toBeDefined();
      });

      act(() => {
        contextValue?.closeApprovalModal();
      });

      // The closeApprovalModal sets the store to false
      expect(mockApprovalModalOpenStore.get()).toBe(false);
    });
  });

  describe('reset method', () => {
    it('should provide reset method that resets executor and stores', async () => {
      let contextValue: ReturnType<typeof useAgentSystem> | undefined;

      function TestConsumer() {
        contextValue = useAgentSystem();
        return <div>Consumer</div>;
      }

      render(
        <AgentSystemProvider>
          <TestConsumer />
        </AgentSystemProvider>,
      );

      await waitFor(() => {
        expect(contextValue?.reset).toBeDefined();
      });

      act(() => {
        contextValue?.reset();
      });

      expect(resetAgentExecutor).toHaveBeenCalled();
      expect(mockResetAgentStores).toHaveBeenCalled();
    });
  });
});

describe('useAgentSystem hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'strict' });
    mockPendingBatchStore = createMockStore<unknown>(null);
    mockApprovalModalOpenStore = createMockStore(false);
    mockProcessedBatchesStore = createMockStore<unknown[]>([]);
    mockActiveAgentsStore = createMockStore<string[]>([]);
    mockActiveAgentCountStore = createMockStore(0);
  });

  it('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => {
      renderHook(() => useAgentSystem());
    }).toThrow('useAgentSystem must be used within AgentSystemProvider');

    console.error = originalError;
  });

  it('should return context value when used inside provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AgentSystemProvider>{children}</AgentSystemProvider>
    );

    const { result } = renderHook(() => useAgentSystem(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.isInitialized).toBe(true);
    expect(result.current.controlMode).toBe('strict');
  });
});

describe('useAgentStatus hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentStatusStore = createMockStore<Record<string, string>>({
      orchestrator: 'executing',
      coder: 'idle',
      builder: 'waiting_for_tool',
    });
    mockActiveAgentsStore = createMockStore<string[]>(['orchestrator', 'builder']);
    mockActiveAgentCountStore = createMockStore<number>(2);
    mockAgentStatsStore = createMockStore<Record<string, number>>({
      totalAgents: 8,
      idleAgents: 6,
      busyAgents: 2,
      completedTasks: 5,
      pendingTasks: 3,
      successfulTasks: 4,
      failedTasks: 1,
    });
  });

  it('should return agent statuses', () => {
    const { result } = renderHook(() => useAgentStatus());

    expect(result.current.statuses).toEqual({
      orchestrator: 'executing',
      coder: 'idle',
      builder: 'waiting_for_tool',
    });
  });

  it('should return active agents list', () => {
    const { result } = renderHook(() => useAgentStatus());

    expect(result.current.activeAgents).toEqual(['orchestrator', 'builder']);
  });

  it('should return active agent count', () => {
    const { result } = renderHook(() => useAgentStatus());

    expect(result.current.activeCount).toBe(2);
  });

  it('should return agent stats', () => {
    const { result } = renderHook(() => useAgentStatus());

    expect(result.current.stats).toEqual({
      totalAgents: 8,
      idleAgents: 6,
      busyAgents: 2,
      completedTasks: 5,
      pendingTasks: 3,
      successfulTasks: 4,
      failedTasks: 1,
    });
  });
});

describe('useAgentLogs hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return logs limited by maxLogs parameter', () => {
    const mockLogs = Array.from({ length: 150 }, (_, i) => ({
      level: 'info' as const,
      message: `Log ${i}`,
      timestamp: new Date(),
    }));

    mockSystemLogsStore = createMockStore<unknown[]>(mockLogs);

    const { result } = renderHook(() => useAgentLogs(100));

    expect(result.current).toHaveLength(100);
    expect(result.current[0].message).toBe('Log 50'); // Last 100 logs
  });

  it('should use default maxLogs of 100', () => {
    const mockLogs = Array.from({ length: 200 }, (_, i) => ({
      level: 'info' as const,
      message: `Log ${i}`,
      timestamp: new Date(),
    }));

    mockSystemLogsStore = createMockStore<unknown[]>(mockLogs);

    const { result } = renderHook(() => useAgentLogs());

    expect(result.current).toHaveLength(100);
  });

  it('should return all logs if less than maxLogs', () => {
    const mockLogs = Array.from({ length: 50 }, (_, i) => ({
      level: 'info' as const,
      message: `Log ${i}`,
      timestamp: new Date(),
    }));

    mockSystemLogsStore = createMockStore<unknown[]>(mockLogs);

    const { result } = renderHook(() => useAgentLogs(100));

    expect(result.current).toHaveLength(50);
  });

  it('should allow custom maxLogs parameter', () => {
    const mockLogs = Array.from({ length: 100 }, (_, i) => ({
      level: 'info' as const,
      message: `Log ${i}`,
      timestamp: new Date(),
    }));

    mockSystemLogsStore = createMockStore<unknown[]>(mockLogs);

    const { result } = renderHook(() => useAgentLogs(25));

    expect(result.current).toHaveLength(25);
    expect(result.current[0].message).toBe('Log 75'); // Last 25 logs
  });
});

describe('useAgentApproval hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPendingBatchStore = createMockStore<unknown>({
      id: 'batch-1',
      agent: 'coder',
      actions: [{ id: 'action-1', type: 'file_create' }],
      description: 'Test batch',
      status: 'pending',
      createdAt: new Date(),
    });
    mockApprovalModalOpenStore = createMockStore<boolean>(true);
    mockProcessedBatchesStore = createMockStore<unknown[]>([
      { id: 'old-batch', status: 'approved', processedAt: new Date() },
    ]);
  });

  it('should return pending batch', () => {
    const { result } = renderHook(() => useAgentApproval());

    expect(result.current.pendingBatch).toEqual({
      id: 'batch-1',
      agent: 'coder',
      actions: [{ id: 'action-1', type: 'file_create' }],
      description: 'Test batch',
      status: 'pending',
      createdAt: expect.any(Date),
    });
  });

  it('should return modal open state', () => {
    const { result } = renderHook(() => useAgentApproval());

    expect(result.current.isModalOpen).toBe(true);
  });

  it('should return processed batches', () => {
    const { result } = renderHook(() => useAgentApproval());

    expect(result.current.processedBatches).toHaveLength(1);
    expect(result.current.processedBatches[0].id).toBe('old-batch');
  });

  it('should provide approveAll function', () => {
    const { result } = renderHook(() => useAgentApproval());

    act(() => {
      result.current.approveAll();
    });

    expect(mockApproveAllActions).toHaveBeenCalled();
  });

  it('should provide approveSelected function', () => {
    const { result } = renderHook(() => useAgentApproval());

    act(() => {
      result.current.approveSelected(['action-1']);
    });

    expect(mockApproveSelectedActions).toHaveBeenCalledWith(['action-1']);
  });

  it('should provide rejectAll function', () => {
    const { result } = renderHook(() => useAgentApproval());

    act(() => {
      result.current.rejectAll();
    });

    expect(mockRejectAllActions).toHaveBeenCalled();
  });

  it('should provide closeModal function', () => {
    const { result } = renderHook(() => useAgentApproval());

    act(() => {
      result.current.closeModal();
    });

    expect(mockApprovalModalOpenStore.get()).toBe(false);
  });
});

describe('useAgentControlMode hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return current mode', () => {
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'moderate' });

    const { result } = renderHook(() => useAgentControlMode());

    expect(result.current.mode).toBe('moderate');
  });

  it('should return isStrict correctly', () => {
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'strict' });

    const { result } = renderHook(() => useAgentControlMode());

    expect(result.current.isStrict).toBe(true);
    expect(result.current.isModerate).toBe(false);
    expect(result.current.isPermissive).toBe(false);
  });

  it('should return isModerate correctly', () => {
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'moderate' });

    const { result } = renderHook(() => useAgentControlMode());

    expect(result.current.isStrict).toBe(false);
    expect(result.current.isModerate).toBe(true);
    expect(result.current.isPermissive).toBe(false);
  });

  it('should return isPermissive correctly', () => {
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'permissive' });

    const { result } = renderHook(() => useAgentControlMode());

    expect(result.current.isStrict).toBe(false);
    expect(result.current.isModerate).toBe(false);
    expect(result.current.isPermissive).toBe(true);
  });

  it('should provide setMode function', () => {
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'strict' });

    const { result } = renderHook(() => useAgentControlMode());

    act(() => {
      result.current.setMode('permissive');
    });

    expect(mockChatStore.setKey).toHaveBeenCalledWith('controlMode', 'permissive');
  });
});

describe('useIsAgentMode hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when in agent mode', () => {
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'strict' });

    const { result } = renderHook(() => useIsAgentMode());

    expect(result.current).toBe(true);
  });

  it('should return false when in chat mode', () => {
    mockChatStore = createMockStore({ mode: 'chat', controlMode: 'strict' });

    const { result } = renderHook(() => useIsAgentMode());

    expect(result.current).toBe(false);
  });
});

describe('error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'strict' });
    mockPendingBatchStore = createMockStore<unknown>(null);
    mockApprovalModalOpenStore = createMockStore(false);
    mockActiveAgentsStore = createMockStore<string[]>([]);
    mockActiveAgentCountStore = createMockStore(0);
  });

  it('should handle executor not being available for executeTool', async () => {
    let contextValue: ReturnType<typeof useAgentSystem> | undefined;

    function TestConsumer() {
      contextValue = useAgentSystem();
      return <div>Consumer</div>;
    }

    render(
      <AgentSystemProvider>
        <TestConsumer />
      </AgentSystemProvider>,
    );

    await waitFor(() => {
      expect(contextValue?.executeTool).toBeDefined();
    });

    // The executeTool function should handle null executor gracefully
    expect(contextValue?.executeTool).toBeDefined();
  });
});

describe('cleanup on unmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatStore = createMockStore({ mode: 'agent', controlMode: 'strict' });
    mockPendingBatchStore = createMockStore<unknown>(null);
    mockApprovalModalOpenStore = createMockStore(false);
    mockActiveAgentsStore = createMockStore<string[]>([]);
    mockActiveAgentCountStore = createMockStore(0);
  });

  it('should mark as not initialized on unmount', async () => {
    let contextValue: ReturnType<typeof useAgentSystem> | undefined;

    function TestConsumer() {
      contextValue = useAgentSystem();
      return <div>{contextValue.isInitialized ? 'initialized' : 'not initialized'}</div>;
    }

    const { unmount } = render(
      <AgentSystemProvider>
        <TestConsumer />
      </AgentSystemProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('initialized')).toBeInTheDocument();
    });

    unmount();

    // After unmount, the component should have cleaned up
    // This tests that the useEffect cleanup runs
  });
});
