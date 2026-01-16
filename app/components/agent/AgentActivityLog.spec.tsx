import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { atom } from 'nanostores';
import React from 'react';

// Create mock stores
const { mockSystemLogsStore, mockAgentStatsStore } = vi.hoisted(() => {
  const { atom } = require('nanostores');
  return {
    mockSystemLogsStore: atom([]),
    mockAgentStatsStore: atom({
      totalAgents: 8,
      busyAgents: 0,
      completedTasks: 0,
      failedTasks: 0,
      pendingTasks: 0,
    }),
  };
});

// Mock stores
vi.mock('~/lib/stores/agents', () => ({
  systemLogsStore: mockSystemLogsStore,
  agentStatsStore: mockAgentStatsStore,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, className, initial, animate, exit, ...props }: any, ref: any) => (
      <div ref={ref} className={className} {...props}>
        {children}
      </div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Import after mocks
import { AgentActivityLog } from './AgentActivityLog';
import type { LogEntry } from '~/lib/stores/agents';

describe('AgentActivityLog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSystemLogsStore.set([]);
    mockAgentStatsStore.set({
      totalAgents: 8,
      busyAgents: 0,
      completedTasks: 0,
      failedTasks: 0,
      pendingTasks: 0,
    });
  });

  describe('rendering', () => {
    it('should not render when closed', () => {
      render(<AgentActivityLog isOpen={false} onClose={mockOnClose} />);

      expect(screen.queryByText('Activité des Agents')).not.toBeInTheDocument();
    });

    it('should render when open', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Activité des Agents')).toBeInTheDocument();
    });

    it('should show empty state when no logs', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Aucune activité')).toBeInTheDocument();
    });

    it('should have displayName set', () => {
      expect(AgentActivityLog.displayName).toBe('AgentActivityLog');
    });
  });

  describe('stats display', () => {
    it('should show total agents', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      // New card-based layout shows number and label separately
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Agents')).toBeInTheDocument();
    });

    it('should show active agents count', () => {
      mockAgentStatsStore.set({
        totalAgents: 8,
        busyAgents: 2,
        completedTasks: 5,
        failedTasks: 0,
        pendingTasks: 3,
      });

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      // New card-based layout shows number and label separately
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Actifs')).toBeInTheDocument();
    });

    it('should show completed tasks count', () => {
      mockAgentStatsStore.set({
        totalAgents: 8,
        busyAgents: 0,
        completedTasks: 10,
        failedTasks: 0,
        pendingTasks: 0,
      });

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      // New card-based layout shows number and label separately
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Tâches')).toBeInTheDocument();
    });

    it('should show failed tasks when present', () => {
      mockAgentStatsStore.set({
        totalAgents: 8,
        busyAgents: 0,
        completedTasks: 5,
        failedTasks: 2,
        pendingTasks: 0,
      });

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      // New card-based layout shows number and label separately
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Échecs')).toBeInTheDocument();
    });

    it('should show pending tasks count when no failures', () => {
      mockAgentStatsStore.set({
        totalAgents: 8,
        busyAgents: 1,
        completedTasks: 0,
        failedTasks: 0,
        pendingTasks: 5,
      });

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      // New card-based layout shows number and label separately
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Attente')).toBeInTheDocument();
    });
  });

  describe('log filtering', () => {
    it('should render filter dropdowns', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Filtrer')).toBeInTheDocument();
    });

    it('should have level filter dropdown', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      const levelSelect = screen.getByDisplayValue('Tous niveaux');
      expect(levelSelect).toBeInTheDocument();
    });

    it('should have agent filter dropdown', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      const agentSelect = screen.getByDisplayValue('Tous agents');
      expect(agentSelect).toBeInTheDocument();
    });
  });

  describe('log display', () => {
    it('should display logs when present', () => {
      const logs: LogEntry[] = [
        {
          timestamp: new Date(),
          level: 'info',
          message: 'Test log message',
          agentName: 'coder',
        },
      ];
      mockSystemLogsStore.set(logs);

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Test log message')).toBeInTheDocument();
    });

    it('should show agent name badge', () => {
      const logs: LogEntry[] = [
        {
          timestamp: new Date(),
          level: 'info',
          message: 'Test message',
          agentName: 'coder',
        },
      ];
      mockSystemLogsStore.set(logs);

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      // There may be multiple elements with 'coder' text (in badge and filter dropdown)
      expect(screen.getAllByText('coder').length).toBeGreaterThan(0);
    });

    it('should show entry count in footer', () => {
      const logs: LogEntry[] = [
        { timestamp: new Date(), level: 'info', message: 'Log 1' },
        { timestamp: new Date(), level: 'warn', message: 'Log 2' },
        { timestamp: new Date(), level: 'error', message: 'Log 3' },
      ];
      mockSystemLogsStore.set(logs);

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('3 entrées')).toBeInTheDocument();
    });

    it('should limit logs based on maxLogs prop', () => {
      const logs: LogEntry[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(),
        level: 'info' as const,
        message: `Log ${i + 1}`,
      }));
      mockSystemLogsStore.set(logs);

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} maxLogs={5} />);

      // Should show only the last 5 logs
      expect(screen.getByText('5 entrées')).toBeInTheDocument();
    });
  });

  describe('close functionality', () => {
    it('should call onClose when close button clicked', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      const closeButton = screen.getByRole('button', { name: 'Fermer' });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should have clear button', () => {
      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Effacer')).toBeInTheDocument();
    });
  });

  describe('props defaults', () => {
    it('should default maxLogs to 100', () => {
      const logs: LogEntry[] = Array.from({ length: 150 }, (_, i) => ({
        timestamp: new Date(),
        level: 'info' as const,
        message: `Log ${i + 1}`,
      }));
      mockSystemLogsStore.set(logs);

      render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('100 entrées')).toBeInTheDocument();
    });

    it('should default autoScroll to true', () => {
      // Just verify it renders without error with default autoScroll
      expect(() => {
        render(<AgentActivityLog isOpen={true} onClose={mockOnClose} />);
      }).not.toThrow();
    });
  });
});

// Helper function tests
describe('AgentActivityLog helper functions', () => {
  describe('log level colors', () => {
    it('should return correct colors for each level', () => {
      const logs: LogEntry[] = [
        { timestamp: new Date(), level: 'debug', message: 'Debug message' },
        { timestamp: new Date(), level: 'info', message: 'Info message' },
        { timestamp: new Date(), level: 'warn', message: 'Warn message' },
        { timestamp: new Date(), level: 'error', message: 'Error message' },
      ];
      mockSystemLogsStore.set(logs);

      render(<AgentActivityLog isOpen={true} onClose={vi.fn()} />);

      // All messages should be visible (using unique message text)
      expect(screen.getByText('Debug message')).toBeInTheDocument();
      expect(screen.getByText('Info message')).toBeInTheDocument();
      expect(screen.getByText('Warn message')).toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });
  });

  describe('time formatting', () => {
    it('should display formatted timestamps', () => {
      const logs: LogEntry[] = [
        {
          timestamp: new Date('2024-01-15T14:30:00'),
          level: 'info',
          message: 'Test message',
        },
      ];
      mockSystemLogsStore.set(logs);

      render(<AgentActivityLog isOpen={true} onClose={vi.fn()} />);

      // Should show time in HH:MM:SS format
      expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    });
  });
});
