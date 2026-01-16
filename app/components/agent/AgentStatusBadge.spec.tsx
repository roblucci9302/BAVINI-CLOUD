import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Create mock stores
const { mockActiveAgentsStore, mockAgentStatusStore, mockActiveAgentCountStore, mockAgentStatsStore } = vi.hoisted(
  () => {
    const { atom } = require('nanostores');
    return {
      mockActiveAgentsStore: atom([]),
      mockAgentStatusStore: atom({}),
      mockActiveAgentCountStore: atom(0),
      mockAgentStatsStore: atom({
        totalAgents: 8,
        busyAgents: 0,
        completedTasks: 0,
        failedTasks: 0,
        pendingTasks: 0,
      }),
    };
  },
);

// Mock stores
vi.mock('~/lib/stores/agents', () => ({
  activeAgentsStore: mockActiveAgentsStore,
  agentStatusStore: mockAgentStatusStore,
  activeAgentCountStore: mockActiveAgentCountStore,
  agentStatsStore: mockAgentStatsStore,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, className, ...props }: any, ref: any) => (
      <div ref={ref} className={className} {...props}>
        {children}
      </div>
    )),
    button: React.forwardRef(({ children, className, onClick, disabled, ...props }: any, ref: any) => (
      <button ref={ref} className={className} onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Import after mocks
import { AgentStatusBadge, AgentStopButton, AgentLoadingIndicator } from './AgentStatusBadge';

describe('AgentStatusBadge', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveAgentsStore.set([]);
    mockAgentStatusStore.set({});
    mockActiveAgentCountStore.set(0);
  });

  describe('rendering', () => {
    it('should render when not compact and no active agents', () => {
      render(<AgentStatusBadge onClick={mockOnClick} />);

      expect(screen.getByText('Agents')).toBeInTheDocument();
    });

    it('should not render when compact and no active agents', () => {
      render(<AgentStatusBadge onClick={mockOnClick} compact={true} />);

      expect(screen.queryByText('Agents')).not.toBeInTheDocument();
    });

    it('should show active count when agents are active', () => {
      mockActiveAgentCountStore.set(2);

      render(<AgentStatusBadge onClick={mockOnClick} />);

      expect(screen.getByText('2 actifs')).toBeInTheDocument();
    });

    it('should show singular form when one agent active', () => {
      mockActiveAgentCountStore.set(1);

      render(<AgentStatusBadge onClick={mockOnClick} />);

      expect(screen.getByText('1 actif')).toBeInTheDocument();
    });

    it('should have displayName set', () => {
      expect(AgentStatusBadge.displayName).toBe('AgentStatusBadge');
    });
  });

  describe('interaction', () => {
    it('should call onClick when clicked', () => {
      render(<AgentStatusBadge onClick={mockOnClick} />);

      fireEvent.click(screen.getByRole('button'));

      expect(mockOnClick).toHaveBeenCalled();
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(<AgentStatusBadge onClick={mockOnClick} className="custom-class" />);

      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('should have accent styling when agents are active', () => {
      mockActiveAgentCountStore.set(1);

      render(<AgentStatusBadge onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-accent-500/10');
    });
  });

  describe('agent dots', () => {
    it('should show agent dots when not compact and agents active', () => {
      mockActiveAgentCountStore.set(2);
      mockActiveAgentsStore.set(['coder', 'tester']);
      mockAgentStatusStore.set({
        coder: 'executing',
        tester: 'thinking',
      });

      const { container } = render(<AgentStatusBadge onClick={mockOnClick} />);

      // Should have dots for each agent (max 4)
      const dots = container.querySelectorAll('.rounded-full.animate-pulse');
      expect(dots.length).toBeGreaterThan(0);
    });

    it('should show +N indicator when more than 4 agents active', () => {
      const agents = ['coder', 'tester', 'builder', 'reviewer', 'deployer'];
      mockActiveAgentCountStore.set(5);
      mockActiveAgentsStore.set(agents);
      mockAgentStatusStore.set({
        coder: 'executing',
        tester: 'executing',
        builder: 'executing',
        reviewer: 'executing',
        deployer: 'executing',
      });

      render(<AgentStatusBadge onClick={mockOnClick} />);

      expect(screen.getByText('+1')).toBeInTheDocument();
    });
  });
});

describe('AgentStopButton', () => {
  const mockOnStop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveAgentCountStore.set(0);
  });

  describe('rendering', () => {
    it('should not render when no active agents', () => {
      render(<AgentStopButton onStop={mockOnStop} />);

      expect(screen.queryByText('Arrêter')).not.toBeInTheDocument();
    });

    it('should render when agents are active', () => {
      mockActiveAgentCountStore.set(2);

      render(<AgentStopButton onStop={mockOnStop} />);

      expect(screen.getByText('Arrêter')).toBeInTheDocument();
    });

    it('should show active agent count', () => {
      mockActiveAgentCountStore.set(3);

      render(<AgentStopButton onStop={mockOnStop} />);

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should have displayName set', () => {
      expect(AgentStopButton.displayName).toBe('AgentStopButton');
    });
  });

  describe('interaction', () => {
    it('should call onStop when clicked', () => {
      mockActiveAgentCountStore.set(1);

      render(<AgentStopButton onStop={mockOnStop} />);

      fireEvent.click(screen.getByRole('button'));

      expect(mockOnStop).toHaveBeenCalled();
    });

    it('should be disabled when disabled prop is true', () => {
      mockActiveAgentCountStore.set(1);

      render(<AgentStopButton onStop={mockOnStop} disabled={true} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      mockActiveAgentCountStore.set(1);

      render(<AgentStopButton onStop={mockOnStop} className="custom-stop-class" />);

      expect(screen.getByRole('button')).toHaveClass('custom-stop-class');
    });

    it('should have red gradient background', () => {
      mockActiveAgentCountStore.set(1);

      render(<AgentStopButton onStop={mockOnStop} />);

      expect(screen.getByRole('button')).toHaveClass('from-red-500');
    });
  });
});

describe('AgentLoadingIndicator', () => {
  describe('rendering', () => {
    it('should render default message', () => {
      render(<AgentLoadingIndicator />);

      expect(screen.getByText('Traitement...')).toBeInTheDocument();
    });

    it('should render with agent name', () => {
      render(<AgentLoadingIndicator agent="coder" />);

      expect(screen.getByText('Coder en cours...')).toBeInTheDocument();
    });

    it('should render custom message', () => {
      render(<AgentLoadingIndicator message="Custom loading message" />);

      expect(screen.getByText('Custom loading message')).toBeInTheDocument();
    });

    it('should render with agent and custom message', () => {
      render(<AgentLoadingIndicator agent="builder" message="Building project..." />);

      expect(screen.getByText('Building project...')).toBeInTheDocument();
    });

    it('should have displayName set', () => {
      expect(AgentLoadingIndicator.displayName).toBe('AgentLoadingIndicator');
    });
  });

  describe('agent icons', () => {
    it('should show spinner icon', () => {
      const { container } = render(<AgentLoadingIndicator />);

      const spinner = container.querySelector('.i-svg-spinners\\:90-ring-with-bg');
      expect(spinner).toBeInTheDocument();
    });
  });
});

// Helper function logic tests
describe('AgentStatusBadge helper functions', () => {
  describe('getStatusColor', () => {
    const statusColors = {
      idle: 'gray',
      thinking: 'yellow',
      executing: 'green',
      waiting_for_tool: 'blue',
      completed: 'green',
      failed: 'red',
      aborted: 'orange',
    };

    it('should handle all status types', () => {
      // Verify all statuses are handled by rendering with different statuses
      mockActiveAgentCountStore.set(1);
      mockActiveAgentsStore.set(['coder']);

      Object.keys(statusColors).forEach((status) => {
        mockAgentStatusStore.set({ coder: status });

        expect(() => {
          render(<AgentStatusBadge onClick={vi.fn()} />);
        }).not.toThrow();
      });
    });
  });

  describe('getAgentIcon', () => {
    const agentTypes = ['orchestrator', 'explore', 'coder', 'builder', 'tester', 'deployer', 'reviewer', 'fixer'];

    it('should handle all agent types', () => {
      mockActiveAgentCountStore.set(1);
      mockAgentStatusStore.set({});

      agentTypes.forEach((agent) => {
        mockActiveAgentsStore.set([agent]);
        mockAgentStatusStore.set({ [agent]: 'executing' });

        expect(() => {
          render(<AgentStatusBadge onClick={vi.fn()} />);
        }).not.toThrow();
      });
    });
  });

  describe('getAgentDisplayName', () => {
    it('should capitalize agent names', () => {
      render(<AgentLoadingIndicator agent="coder" />);
      expect(screen.getByText(/Coder/)).toBeInTheDocument();
    });
  });
});
