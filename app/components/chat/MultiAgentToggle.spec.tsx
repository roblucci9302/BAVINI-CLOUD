import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { atom } from 'nanostores';

// Create mock store with hoisting
const { mockActiveAgentCountStore } = vi.hoisted(() => {
  const { atom } = require('nanostores');
  return { mockActiveAgentCountStore: atom(0) };
});

// Mock agents store before importing the component
vi.mock('~/lib/stores/agents', () => ({
  activeAgentCountStore: mockActiveAgentCountStore,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    span: ({ children, className }: any) => <span className={className}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock IconButton
vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ children, onClick, title, className }: any) => (
    <button onClick={onClick} title={title} className={className} data-testid="icon-button">
      {children}
    </button>
  ),
}));

// Now import after mocks are set up
import {
  MultiAgentToggle,
  multiAgentEnabledStore,
  setMultiAgentEnabled,
  toggleMultiAgent,
  useMultiAgent,
} from './MultiAgentToggle';

describe('MultiAgentToggle', () => {
  beforeEach(() => {
    // Reset store before each test
    multiAgentEnabledStore.set(false);
  });

  describe('store functions', () => {
    it('should have default disabled state', () => {
      expect(multiAgentEnabledStore.get()).toBe(false);
    });

    it('should enable multi-agent mode', () => {
      setMultiAgentEnabled(true);
      expect(multiAgentEnabledStore.get()).toBe(true);
    });

    it('should disable multi-agent mode', () => {
      setMultiAgentEnabled(true);
      setMultiAgentEnabled(false);
      expect(multiAgentEnabledStore.get()).toBe(false);
    });

    it('should toggle multi-agent mode', () => {
      expect(multiAgentEnabledStore.get()).toBe(false);

      toggleMultiAgent();
      expect(multiAgentEnabledStore.get()).toBe(true);

      toggleMultiAgent();
      expect(multiAgentEnabledStore.get()).toBe(false);
    });
  });

  describe('component rendering', () => {
    it('should render toggle button', () => {
      render(<MultiAgentToggle />);

      expect(screen.getByTestId('icon-button')).toBeInTheDocument();
    });

    it('should show disabled title when not enabled', () => {
      render(<MultiAgentToggle />);

      expect(screen.getByTestId('icon-button')).toHaveAttribute(
        'title',
        'Multi-Agent désactivé - Cliquez pour activer',
      );
    });

    it('should show enabled title when enabled', () => {
      multiAgentEnabledStore.set(true);
      render(<MultiAgentToggle />);

      expect(screen.getByTestId('icon-button')).toHaveAttribute(
        'title',
        'Multi-Agent activé - Cliquez pour désactiver',
      );
    });

    it('should apply custom className', () => {
      render(<MultiAgentToggle className="custom-class" />);

      const button = screen.getByTestId('icon-button');
      expect(button.className).toContain('custom-class');
    });

    it('should show robot icon', () => {
      const { container } = render(<MultiAgentToggle />);

      const robotIcon = container.querySelector('[class*="i-ph:robot"]');
      expect(robotIcon).toBeInTheDocument();
    });

    it('should show filled robot icon when enabled', () => {
      multiAgentEnabledStore.set(true);

      const { container } = render(<MultiAgentToggle />);

      const filledIcon = container.querySelector('.i-ph\\:robot-fill');
      expect(filledIcon).toBeInTheDocument();
    });

    it('should show outline robot icon when disabled', () => {
      const { container } = render(<MultiAgentToggle />);

      const outlineIcon = container.querySelector('.i-ph\\:robot');
      expect(outlineIcon).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should toggle state on click', () => {
      render(<MultiAgentToggle />);

      expect(multiAgentEnabledStore.get()).toBe(false);

      fireEvent.click(screen.getByTestId('icon-button'));
      expect(multiAgentEnabledStore.get()).toBe(true);

      fireEvent.click(screen.getByTestId('icon-button'));
      expect(multiAgentEnabledStore.get()).toBe(false);
    });
  });

  describe('useMultiAgent hook', () => {
    beforeEach(() => {
      multiAgentEnabledStore.set(false);
    });

    it('should return current enabled state', () => {
      const { result } = renderHook(() => useMultiAgent());

      expect(result.current.isEnabled).toBe(false);
    });

    it('should return active count', () => {
      const { result } = renderHook(() => useMultiAgent());

      expect(result.current.activeCount).toBe(0);
    });

    it('should provide setEnabled function', () => {
      const { result } = renderHook(() => useMultiAgent());

      act(() => {
        result.current.setEnabled(true);
      });

      expect(multiAgentEnabledStore.get()).toBe(true);
    });

    it('should provide toggle function', () => {
      const { result } = renderHook(() => useMultiAgent());

      act(() => {
        result.current.toggle();
      });

      expect(multiAgentEnabledStore.get()).toBe(true);
    });
  });

  describe('display name', () => {
    it('should have displayName set', () => {
      expect(MultiAgentToggle.displayName).toBe('MultiAgentToggle');
    });
  });
});
