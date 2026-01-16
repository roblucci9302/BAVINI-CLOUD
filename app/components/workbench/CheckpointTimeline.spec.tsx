/**
 * Tests for CheckpointTimeline component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckpointTimeline, type TimelineCheckpoint } from './CheckpointTimeline';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('CheckpointTimeline', () => {
  const mockCheckpoints: TimelineCheckpoint[] = [
    {
      id: 'cp-1',
      time: '2024-01-15T10:30:00Z',
      timeAgo: 'Il y a 5 min',
      description: 'First checkpoint',
      type: 'manual',
      sizeLabel: '1.2 KB',
    },
    {
      id: 'cp-2',
      time: '2024-01-15T10:00:00Z',
      timeAgo: 'Il y a 35 min',
      description: 'Second checkpoint',
      type: 'auto',
      sizeLabel: '2.5 KB',
    },
    {
      id: 'cp-3',
      time: '2024-01-15T09:30:00Z',
      timeAgo: 'Il y a 1h',
      description: 'Before action point',
      type: 'before_action',
      sizeLabel: '500 B',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render empty state when no checkpoints', () => {
    render(<CheckpointTimeline checkpoints={[]} />);

    expect(screen.getByText('Aucun checkpoint')).toBeInTheDocument();
    expect(screen.getByText(/Créez un checkpoint/)).toBeInTheDocument();
  });

  it('should render loading state', () => {
    render(<CheckpointTimeline checkpoints={[]} isLoading={true} />);

    // Should show spinner
    expect(screen.queryByText('Aucun checkpoint')).not.toBeInTheDocument();
  });

  it('should render checkpoints list', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} />);

    expect(screen.getByText('First checkpoint')).toBeInTheDocument();
    expect(screen.getByText('Second checkpoint')).toBeInTheDocument();
    expect(screen.getByText('Before action point')).toBeInTheDocument();
  });

  it('should display checkpoint count in header', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} />);

    expect(screen.getByText('Checkpoints (3)')).toBeInTheDocument();
  });

  it('should display time ago for each checkpoint', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} />);

    expect(screen.getByText('Il y a 5 min')).toBeInTheDocument();
    expect(screen.getByText('Il y a 35 min')).toBeInTheDocument();
    expect(screen.getByText('Il y a 1h')).toBeInTheDocument();
  });

  it('should display type labels for checkpoints', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} />);

    expect(screen.getByText('Manuel')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Pré-action')).toBeInTheDocument();
  });

  it('should highlight active checkpoint', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} currentCheckpointId="cp-2" />);

    // The second checkpoint should have the active class
    const items = screen.getAllByRole('button');
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('should call onSelectCheckpoint when clicking a checkpoint', async () => {
    const mockSelect = vi.fn();
    render(<CheckpointTimeline checkpoints={mockCheckpoints} onSelectCheckpoint={mockSelect} />);

    fireEvent.click(screen.getByText('First checkpoint'));

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('cp-1');
    });
  });

  it('should not call onSelectCheckpoint when disabled', async () => {
    const mockSelect = vi.fn();
    render(<CheckpointTimeline checkpoints={mockCheckpoints} onSelectCheckpoint={mockSelect} disabled={true} />);

    fireEvent.click(screen.getByText('First checkpoint'));

    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('should show delete button on hover', async () => {
    const mockDelete = vi.fn();
    render(<CheckpointTimeline checkpoints={mockCheckpoints} onDeleteCheckpoint={mockDelete} />);

    const firstItem = screen.getByText('First checkpoint').closest('[role="button"]');
    fireEvent.mouseEnter(firstItem!);

    // Delete button should appear
    await waitFor(() => {
      expect(screen.getByTitle('Supprimer')).toBeInTheDocument();
    });
  });

  it('should call onDeleteCheckpoint when clicking delete', async () => {
    const mockDelete = vi.fn();
    render(<CheckpointTimeline checkpoints={mockCheckpoints} onDeleteCheckpoint={mockDelete} />);

    const firstItem = screen.getByText('First checkpoint').closest('[role="button"]');
    fireEvent.mouseEnter(firstItem!);

    await waitFor(() => {
      const deleteButton = screen.getByTitle('Supprimer');
      fireEvent.click(deleteButton);
    });

    expect(mockDelete).toHaveBeenCalledWith('cp-1');
  });

  it('should hide delete button when disabled', async () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} disabled={true} />);

    const firstItem = screen.getByText('First checkpoint').closest('[role="button"]');
    fireEvent.mouseEnter(firstItem!);

    // Should not show delete button
    expect(screen.queryByTitle('Supprimer')).not.toBeInTheDocument();
  });

  it('should apply compact mode styles', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} compact={true} />);

    // Type labels should be hidden in compact mode
    expect(screen.queryByText('Manuel')).not.toBeInTheDocument();
    expect(screen.queryByText('Auto')).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<CheckpointTimeline checkpoints={mockCheckpoints} className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should hide size in compact mode', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} compact={true} />);

    expect(screen.queryByText('1.2 KB')).not.toBeInTheDocument();
    expect(screen.queryByText('2.5 KB')).not.toBeInTheDocument();
  });

  it('should show size in normal mode', () => {
    render(<CheckpointTimeline checkpoints={mockCheckpoints} compact={false} />);

    expect(screen.getByText(/1.2 KB/)).toBeInTheDocument();
    expect(screen.getByText(/2.5 KB/)).toBeInTheDocument();
  });
});
