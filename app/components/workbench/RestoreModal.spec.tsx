/**
 * Tests for RestoreModal component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestoreModal, type RestoreModalCheckpoint } from './RestoreModal';

// Mock framer-motion
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock Radix Dialog
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
  Portal: ({ children }: any) => <div data-testid="dialog-portal">{children}</div>,
  Overlay: ({ children, ...props }: any) => (
    <div data-testid="dialog-overlay" {...props}>
      {children}
    </div>
  ),
  Content: ({ children, ...props }: any) => (
    <div data-testid="dialog-content" {...props}>
      {children}
    </div>
  ),
  Title: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
  Description: ({ children, className, asChild }: any) => <div className={className}>{children}</div>,
  Close: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

describe('RestoreModal', () => {
  const mockCheckpoint: RestoreModalCheckpoint = {
    id: 'ckpt-123',
    description: 'Test checkpoint',
    time: '2024-01-15T10:30:00Z',
    timeAgo: 'Il y a 5 min',
    type: 'manual',
    filesCount: 10,
    messagesCount: 5,
    sizeLabel: '1.5 KB',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    render(<RestoreModal isOpen={false} checkpoint={mockCheckpoint} />);

    expect(screen.queryByTestId('dialog-root')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    expect(screen.getByTestId('dialog-root')).toBeInTheDocument();
  });

  it('should display checkpoint description', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    expect(screen.getByText('Test checkpoint')).toBeInTheDocument();
  });

  it('should display checkpoint metadata', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    expect(screen.getByText('Il y a 5 min')).toBeInTheDocument();
    expect(screen.getByText('Manuel')).toBeInTheDocument();
    expect(screen.getByText('10 fichiers')).toBeInTheDocument();
    expect(screen.getByText('5 messages')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
  });

  it('should display restore options', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    expect(screen.getByText('Restaurer les fichiers')).toBeInTheDocument();
    expect(screen.getByText('Restaurer la conversation')).toBeInTheDocument();
    expect(screen.getByText('Créer un point de restauration')).toBeInTheDocument();
  });

  it('should have default options checked', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    const checkboxes = screen.getAllByRole('checkbox');

    // Restore files should be checked by default
    expect(checkboxes[0]).toBeChecked();

    // Restore conversation should not be checked by default
    expect(checkboxes[1]).not.toBeChecked();

    // Create restore point should be checked by default
    expect(checkboxes[2]).toBeChecked();
  });

  it('should allow toggling options', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    const checkboxes = screen.getAllByRole('checkbox');

    // Toggle restore files off
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();

    // Toggle restore conversation on
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();

    // Toggle create restore point off
    fireEvent.click(checkboxes[2]);
    expect(checkboxes[2]).not.toBeChecked();
  });

  it('should display warning about no restore point', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    const checkboxes = screen.getAllByRole('checkbox');

    // Toggle create restore point off
    fireEvent.click(checkboxes[2]);

    expect(screen.getByText(/cette action ne pourra pas être annulée/)).toBeInTheDocument();
  });

  it('should call onConfirm with selected options', async () => {
    const mockConfirm = vi.fn();
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} onConfirm={mockConfirm} />);

    const checkboxes = screen.getAllByRole('checkbox');

    // Toggle restore conversation on
    fireEvent.click(checkboxes[1]);

    // Click restore button
    fireEvent.click(screen.getByText('Restaurer'));

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith({
        restoreFiles: true,
        restoreConversation: true,
        createRestorePoint: true,
      });
    });
  });

  it('should call onCancel when clicking cancel button', async () => {
    const mockCancel = vi.fn();
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} onCancel={mockCancel} />);

    fireEvent.click(screen.getByText('Annuler'));

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalled();
    });
  });

  it('should show loading state during restore', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} isLoading={true} />);

    expect(screen.getByText('Restauration...')).toBeInTheDocument();
    expect(screen.queryByText('Restaurer')).not.toBeInTheDocument();
  });

  it('should disable buttons during loading', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} isLoading={true} />);

    const checkboxes = screen.getAllByRole('checkbox');

    // All checkboxes should be disabled
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeDisabled();
    });
  });

  it('should display different types correctly', () => {
    const autoCheckpoint: RestoreModalCheckpoint = {
      ...mockCheckpoint,
      type: 'auto',
    };

    render(<RestoreModal isOpen={true} checkpoint={autoCheckpoint} />);
    expect(screen.getByText('Automatique')).toBeInTheDocument();
  });

  it('should display before_action type correctly', () => {
    const beforeActionCheckpoint: RestoreModalCheckpoint = {
      ...mockCheckpoint,
      type: 'before_action',
    };

    render(<RestoreModal isOpen={true} checkpoint={beforeActionCheckpoint} />);
    expect(screen.getByText('Point de restauration')).toBeInTheDocument();
  });

  it('should not render when checkpoint is null', () => {
    render(<RestoreModal isOpen={true} checkpoint={null} />);

    // Dialog should open but content should not render
    expect(screen.queryByText('Test checkpoint')).not.toBeInTheDocument();
  });

  it('should display modal title', () => {
    render(<RestoreModal isOpen={true} checkpoint={mockCheckpoint} />);

    expect(screen.getByText('Restaurer le checkpoint')).toBeInTheDocument();
  });
});
