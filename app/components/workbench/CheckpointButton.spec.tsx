/**
 * Tests for CheckpointButton component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckpointButton } from './CheckpointButton';

describe('CheckpointButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with default state', () => {
    render(<CheckpointButton />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
  });

  it('should display checkpoint count when provided', () => {
    render(<CheckpointButton checkpointCount={5} />);

    expect(screen.getByText('(5)')).toBeInTheDocument();
  });

  it('should not display checkpoint count when zero', () => {
    render(<CheckpointButton checkpointCount={0} />);

    expect(screen.queryByText('(0)')).not.toBeInTheDocument();
  });

  it('should display loading state', () => {
    render(<CheckpointButton isLoading={true} />);

    expect(screen.getByText('Création...')).toBeInTheDocument();
    expect(screen.queryByText('Checkpoint')).not.toBeInTheDocument();
  });

  it('should not show count when loading', () => {
    render(<CheckpointButton isLoading={true} checkpointCount={5} />);

    expect(screen.queryByText('(5)')).not.toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<CheckpointButton disabled={true} />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should be disabled when loading', () => {
    render(<CheckpointButton isLoading={true} />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should call onCreateCheckpoint when clicked', async () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined);
    render(<CheckpointButton onCreateCheckpoint={mockCreate} />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  it('should not call onCreateCheckpoint when disabled', async () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined);
    render(<CheckpointButton onCreateCheckpoint={mockCreate} disabled={true} />);

    fireEvent.click(screen.getByRole('button'));

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should show loading state during creation', async () => {
    let resolveCreate: () => void;
    const createPromise = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    const mockCreate = vi.fn().mockReturnValue(createPromise);

    render(<CheckpointButton onCreateCheckpoint={mockCreate} />);

    fireEvent.click(screen.getByRole('button'));

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Création...')).toBeInTheDocument();
    });

    // Resolve the promise
    resolveCreate!();

    // Should return to normal state
    await waitFor(() => {
      expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    });
  });

  it('should apply custom className', () => {
    render(<CheckpointButton className="custom-class" />);

    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('should prevent double-click during creation', async () => {
    let resolveCreate: () => void;
    const createPromise = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    const mockCreate = vi.fn().mockReturnValue(createPromise);

    render(<CheckpointButton onCreateCheckpoint={mockCreate} />);

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));

    // Should only call once
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    resolveCreate!();
  });
});
