import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageActions, FloatingMessageActions } from './MessageActions';

// Mock the IconButton component
vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ title, onClick, icon }: { title: string; onClick?: () => void; icon: string }) => (
    <button data-testid={`icon-btn-${icon}`} title={title} onClick={onClick}>
      {title}
    </button>
  ),
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

Object.assign(navigator, {
  clipboard: mockClipboard,
});

describe('MessageActions', () => {
  const defaultProps = {
    role: 'user' as const,
    messageIndex: 0,
    content: 'Test message content',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Copy functionality', () => {
    it('should render copy button for all messages', () => {
      render(<MessageActions {...defaultProps} />);

      expect(screen.getByTitle('Copier le message')).toBeInTheDocument();
    });

    it('should copy content when copy button is clicked', async () => {
      render(<MessageActions {...defaultProps} />);

      const copyButton = screen.getByTitle('Copier le message');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith('Test message content');
      });
    });

    it('should call onCopy callback when provided', async () => {
      const onCopy = vi.fn();
      render(<MessageActions {...defaultProps} onCopy={onCopy} />);

      const copyButton = screen.getByTitle('Copier le message');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(onCopy).toHaveBeenCalledWith('Test message content');
      });
    });

    it('should show copied state after copying', async () => {
      render(<MessageActions {...defaultProps} />);

      const copyButton = screen.getByTitle('Copier le message');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByTitle('Copié !')).toBeInTheDocument();
      });
    });
  });

  describe('User message actions', () => {
    it('should render edit button for user messages when onEdit is provided', () => {
      const onEdit = vi.fn();
      render(<MessageActions {...defaultProps} onEdit={onEdit} />);

      expect(screen.getByTitle('Modifier le message')).toBeInTheDocument();
    });

    it('should not render edit button when onEdit is not provided', () => {
      render(<MessageActions {...defaultProps} />);

      expect(screen.queryByTitle('Modifier le message')).not.toBeInTheDocument();
    });

    it('should call onEdit when edit button is clicked', () => {
      const onEdit = vi.fn();
      render(<MessageActions {...defaultProps} onEdit={onEdit} />);

      fireEvent.click(screen.getByTitle('Modifier le message'));
      expect(onEdit).toHaveBeenCalledWith(0);
    });

    it('should render delete button for user messages when onDelete is provided', () => {
      const onDelete = vi.fn();
      render(<MessageActions {...defaultProps} onDelete={onDelete} />);

      expect(screen.getByTitle('Supprimer le message')).toBeInTheDocument();
    });

    it('should show confirmation on first delete click', () => {
      const onDelete = vi.fn();
      render(<MessageActions {...defaultProps} onDelete={onDelete} />);

      fireEvent.click(screen.getByTitle('Supprimer le message'));

      expect(screen.getByTitle('Cliquer pour confirmer')).toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('should call onDelete on second click (confirmation)', () => {
      const onDelete = vi.fn();
      render(<MessageActions {...defaultProps} onDelete={onDelete} />);

      const deleteButton = screen.getByTitle('Supprimer le message');
      fireEvent.click(deleteButton);
      fireEvent.click(screen.getByTitle('Cliquer pour confirmer'));

      expect(onDelete).toHaveBeenCalledWith(0);
    });
  });

  describe('Assistant message actions', () => {
    const assistantProps = {
      ...defaultProps,
      role: 'assistant' as const,
    };

    it('should not render edit or delete buttons for assistant messages', () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      render(<MessageActions {...assistantProps} onEdit={onEdit} onDelete={onDelete} />);

      expect(screen.queryByTitle('Modifier le message')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Supprimer le message')).not.toBeInTheDocument();
    });

    it('should render regenerate button for last assistant message', () => {
      const onRegenerate = vi.fn();
      render(<MessageActions {...assistantProps} onRegenerate={onRegenerate} isLast={true} />);

      expect(screen.getByTitle('Régénérer la réponse')).toBeInTheDocument();
    });

    it('should not render regenerate button if not last message', () => {
      const onRegenerate = vi.fn();
      render(<MessageActions {...assistantProps} onRegenerate={onRegenerate} isLast={false} />);

      expect(screen.queryByTitle('Régénérer la réponse')).not.toBeInTheDocument();
    });

    it('should call onRegenerate when regenerate button is clicked', () => {
      const onRegenerate = vi.fn();
      render(<MessageActions {...assistantProps} onRegenerate={onRegenerate} isLast={true} />);

      fireEvent.click(screen.getByTitle('Régénérer la réponse'));
      expect(onRegenerate).toHaveBeenCalledWith(0);
    });
  });

  describe('Streaming state', () => {
    it('should not render actions during streaming for last message', () => {
      const { container } = render(<MessageActions {...defaultProps} isStreaming={true} isLast={true} />);

      expect(container.firstChild).toBeNull();
    });

    it('should render actions during streaming for non-last messages', () => {
      render(<MessageActions {...defaultProps} isStreaming={true} isLast={false} />);

      expect(screen.getByTitle('Copier le message')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have toolbar role', () => {
      render(<MessageActions {...defaultProps} />);

      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('should have appropriate aria-label for user messages', () => {
      render(<MessageActions {...defaultProps} />);

      expect(screen.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions pour le message utilisateur');
    });

    it('should have appropriate aria-label for assistant messages', () => {
      render(<MessageActions {...defaultProps} role="assistant" />);

      expect(screen.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions pour le message assistant');
    });
  });
});

describe('FloatingMessageActions', () => {
  const defaultProps = {
    role: 'user' as const,
    messageIndex: 0,
    content: 'Test message',
  };

  it('should render with default top-right position classes', () => {
    const { container } = render(<FloatingMessageActions {...defaultProps} />);

    // FloatingMessageActions passes className to MessageActions which applies to the toolbar div
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar).toBeInTheDocument();

    // Check that position classes are in the className (uses -top-1 -right-1 for tighter positioning)
    expect(toolbar?.className).toContain('-top-1');
    expect(toolbar?.className).toContain('-right-1');
  });

  it('should render with bottom-right position when specified', () => {
    const { container } = render(<FloatingMessageActions {...defaultProps} position="bottom-right" />);

    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.className).toContain('-bottom-1');
    expect(toolbar?.className).toContain('-right-1');
  });

  it('should apply background and shadow styles', () => {
    const { container } = render(<FloatingMessageActions {...defaultProps} />);

    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.className).toContain('bg-bolt-elements-background-depth-1');
    expect(toolbar?.className).toContain('rounded-md');
    expect(toolbar?.className).toContain('shadow-md');
  });
});
