/**
 * Tests for ContextIndicator components
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextIndicatorCompact, ContextIndicatorDetailed } from './ContextIndicator';
import {
  resetContextStore,
  updateContextStats,
  startSummarization,
  endSummarization,
} from '~/lib/stores/context';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, style, ...props }: any) => (
      <div className={className} style={style} {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('ContextIndicator', () => {
  beforeEach(() => {
    resetContextStore();
  });

  describe('ContextIndicatorCompact', () => {
    it('should not render when no messages', () => {
      const { container } = render(<ContextIndicatorCompact />);
      expect(container.firstChild).toBeNull();
    });

    it('should render when messages exist', () => {
      updateContextStats({ messageCount: 5, usagePercent: 30, totalTokens: 5000 });

      render(<ContextIndicatorCompact />);

      expect(screen.getByText('30%')).toBeInTheDocument();
    });

    it('should display percentage based on usage', () => {
      updateContextStats({ messageCount: 10, usagePercent: 45.5, totalTokens: 10000 });

      render(<ContextIndicatorCompact />);

      expect(screen.getByText('46%')).toBeInTheDocument();
    });

    it('should show spinner when summarizing', () => {
      updateContextStats({ messageCount: 5, usagePercent: 80, totalTokens: 50000 });
      startSummarization();

      render(<ContextIndicatorCompact />);

      // Check for spinner icon class
      const container = document.querySelector('.i-svg-spinners\\:90-ring-with-bg');
      expect(container).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      updateContextStats({ messageCount: 5, usagePercent: 30, totalTokens: 5000 });

      const { container } = render(<ContextIndicatorCompact className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should have title with token count', () => {
      updateContextStats({ messageCount: 5, usagePercent: 30, totalTokens: 5000 });

      const { container } = render(<ContextIndicatorCompact />);

      const element = container.firstChild as HTMLElement;
      // formatTokens returns "5.0K" for 5000
      expect(element.getAttribute('title')).toContain('5.0K tokens');
    });
  });

  describe('ContextIndicatorDetailed', () => {
    it('should always render', () => {
      const { container } = render(<ContextIndicatorDetailed />);
      expect(container.firstChild).not.toBeNull();
    });

    it('should display token count', () => {
      updateContextStats({ messageCount: 10, usagePercent: 25, totalTokens: 15000 });

      render(<ContextIndicatorDetailed />);

      // formatTokens returns "15.0K" for 15000
      expect(screen.getByText('15.0K')).toBeInTheDocument();
    });

    it('should display message count', () => {
      updateContextStats({ messageCount: 42, usagePercent: 50, totalTokens: 20000 });

      render(<ContextIndicatorDetailed />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should display summary count when present', () => {
      updateContextStats({ messageCount: 20, usagePercent: 60, totalTokens: 30000, summaryCount: 3 });

      render(<ContextIndicatorDetailed />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Résumés:')).toBeInTheDocument();
    });

    it('should not display summary count when zero', () => {
      updateContextStats({ messageCount: 10, usagePercent: 30, totalTokens: 5000, summaryCount: 0 });

      render(<ContextIndicatorDetailed />);

      expect(screen.queryByText('Résumés:')).not.toBeInTheDocument();
    });

    it('should show summarizing indicator when active', () => {
      updateContextStats({ messageCount: 50, usagePercent: 85, totalTokens: 80000 });
      startSummarization();

      render(<ContextIndicatorDetailed />);

      expect(screen.getByText('Résumé en cours...')).toBeInTheDocument();
    });

    it('should show warning when critical and not summarizing', () => {
      updateContextStats({ messageCount: 100, usagePercent: 90, totalTokens: 150000 });

      render(<ContextIndicatorDetailed />);

      expect(screen.getByText('Contexte presque plein')).toBeInTheDocument();
    });

    it('should not show warning when summarizing', () => {
      updateContextStats({ messageCount: 100, usagePercent: 90, totalTokens: 150000 });
      startSummarization();

      render(<ContextIndicatorDetailed />);

      expect(screen.queryByText('Contexte presque plein')).not.toBeInTheDocument();
    });

    it('should apply correct color classes based on level', () => {
      // Test low level (green)
      updateContextStats({ messageCount: 5, usagePercent: 30, totalTokens: 5000 });
      const { rerender } = render(<ContextIndicatorDetailed />);

      // Check for green class
      expect(document.querySelector('.text-green-500')).toBeInTheDocument();

      // Test critical level (red)
      updateContextStats({ usagePercent: 90 });
      rerender(<ContextIndicatorDetailed />);

      expect(document.querySelector('.text-red-500')).toBeInTheDocument();
    });
  });

  describe('Token formatting', () => {
    it('should format small numbers without suffix', () => {
      updateContextStats({ messageCount: 1, usagePercent: 1, totalTokens: 500 });

      render(<ContextIndicatorDetailed />);

      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('should format thousands with K suffix', () => {
      updateContextStats({ messageCount: 10, usagePercent: 20, totalTokens: 25000 });

      render(<ContextIndicatorDetailed />);

      // formatTokens returns "25.0K" for 25000
      expect(screen.getByText('25.0K')).toBeInTheDocument();
    });

    it('should format millions with M suffix', () => {
      // Edge case - very large token count
      updateContextStats({ messageCount: 1000, usagePercent: 100, totalTokens: 1500000 });

      render(<ContextIndicatorDetailed />);

      expect(screen.getByText('1.50M')).toBeInTheDocument();
    });
  });
});
