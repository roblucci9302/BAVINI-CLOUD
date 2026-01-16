import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Use vi.hoisted to define mock functions that are used in vi.mock factories
const { mockResetAgentStores, mockUseAgentStatus, mockUseIsAgentMode } = vi.hoisted(() => ({
  mockResetAgentStores: vi.fn(),
  mockUseAgentStatus: vi.fn(),
  mockUseIsAgentMode: vi.fn(),
}));

// Mock AgentSystemProvider hooks
vi.mock('./AgentSystemProvider', () => ({
  useAgentStatus: () => mockUseAgentStatus(),
  useIsAgentMode: () => mockUseIsAgentMode(),
}));

// Mock stores
vi.mock('~/lib/stores/agents', () => ({
  resetAgentStores: mockResetAgentStores,
}));

// Mock AgentActivityLog component
vi.mock('~/components/agent/AgentActivityLog', () => ({
  AgentActivityLog: ({
    isOpen,
    onClose,
    maxLogs,
    autoScroll,
  }: {
    isOpen: boolean;
    onClose: () => void;
    maxLogs: number;
    autoScroll: boolean;
  }) =>
    isOpen ? (
      <div data-testid="agent-activity-log" data-max-logs={maxLogs} data-auto-scroll={autoScroll}>
        <button data-testid="close-log" onClick={onClose}>
          Close Log
        </button>
      </div>
    ) : null,
}));

// Mock AgentStatusBadge components
vi.mock('~/components/agent/AgentStatusBadge', () => ({
  AgentStatusBadge: ({ onClick, compact }: { onClick?: () => void; compact?: boolean }) => (
    <button data-testid="agent-status-badge" data-compact={compact} onClick={onClick}>
      Status Badge
    </button>
  ),
  AgentStopButton: ({ onStop, disabled }: { onStop: () => void; disabled?: boolean }) => (
    <button data-testid="agent-stop-button" onClick={onStop} disabled={disabled}>
      Stop All
    </button>
  ),
}));

// Import after mocks
import { AgentActivityWrapper, AgentStatusIndicator } from './AgentActivityWrapper';

describe('AgentActivityWrapper', () => {
  const mockOnStopAll = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgentStatus.mockReturnValue({ activeCount: 0 });
    mockUseIsAgentMode.mockReturnValue(true);
  });

  describe('rendering', () => {
    it('should render when in agent mode', () => {
      mockUseIsAgentMode.mockReturnValue(true);

      render(<AgentActivityWrapper />);

      expect(screen.getByTestId('agent-status-badge')).toBeInTheDocument();
      expect(screen.getByTestId('agent-stop-button')).toBeInTheDocument();
    });

    it('should not render when not in agent mode', () => {
      mockUseIsAgentMode.mockReturnValue(false);

      render(<AgentActivityWrapper />);

      expect(screen.queryByTestId('agent-status-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('agent-stop-button')).not.toBeInTheDocument();
    });

    it('should not render activity log initially', () => {
      render(<AgentActivityWrapper />);

      expect(screen.queryByTestId('agent-activity-log')).not.toBeInTheDocument();
    });

    it('should render with onStopAll callback', () => {
      render(<AgentActivityWrapper onStopAll={mockOnStopAll} />);

      expect(screen.getByTestId('agent-stop-button')).toBeInTheDocument();
    });
  });

  describe('stop button behavior', () => {
    it('should disable stop button when no active agents', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 0 });

      render(<AgentActivityWrapper />);

      expect(screen.getByTestId('agent-stop-button')).toBeDisabled();
    });

    it('should enable stop button when there are active agents', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 2 });

      render(<AgentActivityWrapper />);

      expect(screen.getByTestId('agent-stop-button')).not.toBeDisabled();
    });

    it('should call resetAgentStores when stop button is clicked', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 1 });

      render(<AgentActivityWrapper />);

      fireEvent.click(screen.getByTestId('agent-stop-button'));

      expect(mockResetAgentStores).toHaveBeenCalled();
    });

    it('should call onStopAll callback when stop button is clicked', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 1 });

      render(<AgentActivityWrapper onStopAll={mockOnStopAll} />);

      fireEvent.click(screen.getByTestId('agent-stop-button'));

      expect(mockOnStopAll).toHaveBeenCalled();
    });

    it('should call both resetAgentStores and onStopAll when stop button is clicked', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 1 });

      render(<AgentActivityWrapper onStopAll={mockOnStopAll} />);

      fireEvent.click(screen.getByTestId('agent-stop-button'));

      expect(mockResetAgentStores).toHaveBeenCalled();
      expect(mockOnStopAll).toHaveBeenCalled();
    });

    it('should handle stop button click without onStopAll callback', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 1 });

      render(<AgentActivityWrapper />);

      // Should not throw when onStopAll is not provided
      expect(() => {
        fireEvent.click(screen.getByTestId('agent-stop-button'));
      }).not.toThrow();

      expect(mockResetAgentStores).toHaveBeenCalled();
    });
  });

  describe('activity log behavior', () => {
    it('should open activity log when status badge is clicked', () => {
      render(<AgentActivityWrapper />);

      fireEvent.click(screen.getByTestId('agent-status-badge'));

      expect(screen.getByTestId('agent-activity-log')).toBeInTheDocument();
    });

    it('should close activity log when close button is clicked', () => {
      render(<AgentActivityWrapper />);

      // Open the log first
      fireEvent.click(screen.getByTestId('agent-status-badge'));
      expect(screen.getByTestId('agent-activity-log')).toBeInTheDocument();

      // Close the log
      fireEvent.click(screen.getByTestId('close-log'));
      expect(screen.queryByTestId('agent-activity-log')).not.toBeInTheDocument();
    });

    it('should pass correct props to AgentActivityLog', () => {
      render(<AgentActivityWrapper />);

      fireEvent.click(screen.getByTestId('agent-status-badge'));

      const activityLog = screen.getByTestId('agent-activity-log');
      expect(activityLog).toHaveAttribute('data-max-logs', '200');
      expect(activityLog).toHaveAttribute('data-auto-scroll', 'true');
    });
  });

  describe('edge cases', () => {
    it('should handle activeCount of exactly 0', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 0 });

      render(<AgentActivityWrapper />);

      expect(screen.getByTestId('agent-stop-button')).toBeDisabled();
    });

    it('should handle activeCount of 1', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 1 });

      render(<AgentActivityWrapper />);

      expect(screen.getByTestId('agent-stop-button')).not.toBeDisabled();
    });

    it('should handle high activeCount', () => {
      mockUseAgentStatus.mockReturnValue({ activeCount: 100 });

      render(<AgentActivityWrapper />);

      expect(screen.getByTestId('agent-stop-button')).not.toBeDisabled();
    });
  });
});

describe('AgentStatusIndicator', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsAgentMode.mockReturnValue(true);
  });

  describe('rendering', () => {
    it('should render when in agent mode', () => {
      mockUseIsAgentMode.mockReturnValue(true);

      render(<AgentStatusIndicator />);

      expect(screen.getByTestId('agent-status-badge')).toBeInTheDocument();
    });

    it('should not render when not in agent mode', () => {
      mockUseIsAgentMode.mockReturnValue(false);

      render(<AgentStatusIndicator />);

      expect(screen.queryByTestId('agent-status-badge')).not.toBeInTheDocument();
    });

    it('should render with default compact=true', () => {
      render(<AgentStatusIndicator />);

      expect(screen.getByTestId('agent-status-badge')).toHaveAttribute('data-compact', 'true');
    });

    it('should render with compact=false when specified', () => {
      render(<AgentStatusIndicator compact={false} />);

      expect(screen.getByTestId('agent-status-badge')).toHaveAttribute('data-compact', 'false');
    });

    it('should render with compact=true when specified', () => {
      render(<AgentStatusIndicator compact={true} />);

      expect(screen.getByTestId('agent-status-badge')).toHaveAttribute('data-compact', 'true');
    });
  });

  describe('click handling', () => {
    it('should call onClick when badge is clicked', () => {
      render(<AgentStatusIndicator onClick={mockOnClick} />);

      fireEvent.click(screen.getByTestId('agent-status-badge'));

      expect(mockOnClick).toHaveBeenCalled();
    });

    it('should not throw when onClick is not provided', () => {
      render(<AgentStatusIndicator />);

      expect(() => {
        fireEvent.click(screen.getByTestId('agent-status-badge'));
      }).not.toThrow();
    });

    it('should call onClick with compact=false', () => {
      render(<AgentStatusIndicator onClick={mockOnClick} compact={false} />);

      fireEvent.click(screen.getByTestId('agent-status-badge'));

      expect(mockOnClick).toHaveBeenCalled();
    });
  });

  describe('props combinations', () => {
    it('should handle onClick and compact=true', () => {
      render(<AgentStatusIndicator onClick={mockOnClick} compact={true} />);

      expect(screen.getByTestId('agent-status-badge')).toHaveAttribute('data-compact', 'true');

      fireEvent.click(screen.getByTestId('agent-status-badge'));
      expect(mockOnClick).toHaveBeenCalled();
    });

    it('should handle onClick and compact=false', () => {
      render(<AgentStatusIndicator onClick={mockOnClick} compact={false} />);

      expect(screen.getByTestId('agent-status-badge')).toHaveAttribute('data-compact', 'false');

      fireEvent.click(screen.getByTestId('agent-status-badge'));
      expect(mockOnClick).toHaveBeenCalled();
    });

    it('should handle no props at all', () => {
      render(<AgentStatusIndicator />);

      expect(screen.getByTestId('agent-status-badge')).toBeInTheDocument();
      expect(screen.getByTestId('agent-status-badge')).toHaveAttribute('data-compact', 'true');
    });
  });

  describe('agent mode switching', () => {
    it('should reflect agent mode state changes', () => {
      mockUseIsAgentMode.mockReturnValue(true);
      const { rerender } = render(<AgentStatusIndicator />);

      expect(screen.getByTestId('agent-status-badge')).toBeInTheDocument();

      // Simulate switching to non-agent mode
      mockUseIsAgentMode.mockReturnValue(false);
      rerender(<AgentStatusIndicator />);

      expect(screen.queryByTestId('agent-status-badge')).not.toBeInTheDocument();
    });
  });
});
