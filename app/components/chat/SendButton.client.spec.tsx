import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SendButton } from './SendButton.client';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, onClick, disabled, title, className }: any) => (
      <button onClick={onClick} disabled={disabled} title={title} className={className}>
        {children}
      </button>
    ),
  },
  cubicBezier: () => (t: number) => t,
}));

describe('SendButton', () => {
  describe('rendering states', () => {
    it('should render disabled state when no content', () => {
      render(<SendButton hasContent={false} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Écrivez un message');
    });

    it('should render enabled state when has content', () => {
      render(<SendButton hasContent={true} />);

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('title', 'Envoyer');
    });

    it('should render streaming state', () => {
      render(<SendButton hasContent={false} isStreaming={true} />);

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('title', 'Arrêter');
    });

    it('should show arrow icon when not streaming', () => {
      const { container } = render(<SendButton hasContent={true} />);

      const arrowIcon = container.querySelector('.i-ph\\:arrow-up-bold');
      expect(arrowIcon).toBeInTheDocument();
    });

    it('should show stop icon when streaming', () => {
      const { container } = render(<SendButton hasContent={false} isStreaming={true} />);

      const stopIcon = container.querySelector('.i-ph\\:stop-fill');
      expect(stopIcon).toBeInTheDocument();
    });
  });

  describe('click handling', () => {
    it('should call onClick when has content and clicked', () => {
      const handleClick = vi.fn();
      render(<SendButton hasContent={true} onClick={handleClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick when streaming and clicked', () => {
      const handleClick = vi.fn();
      render(<SendButton hasContent={false} isStreaming={true} onClick={handleClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      const handleClick = vi.fn();
      render(<SendButton hasContent={false} onClick={handleClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should prevent default on click', () => {
      const handleClick = vi.fn((e) => {
        // Event should have been prevented
        expect(e.defaultPrevented).toBe(true);
      });

      render(<SendButton hasContent={true} onClick={handleClick} />);

      const button = screen.getByRole('button');
      const event = new MouseEvent('click', { bubbles: true });
      fireEvent(button, event);
    });
  });

  describe('styling', () => {
    it('should have base button classes', () => {
      const { container } = render(<SendButton hasContent={false} />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('flex');
      expect(button?.className).toContain('items-center');
      expect(button?.className).toContain('rounded-full');
    });

    it('should have accent color when has content', () => {
      const { container } = render(<SendButton hasContent={true} />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('bg-accent-500');
    });

    it('should have red color when streaming', () => {
      const { container } = render(<SendButton hasContent={false} isStreaming={true} />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('bg-red-500');
    });

    it('should have disabled styling when no content', () => {
      const { container } = render(<SendButton hasContent={false} />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('cursor-not-allowed');
    });
  });
});
