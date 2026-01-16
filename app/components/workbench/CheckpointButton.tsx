'use client';

/**
 * CheckpointButton component for creating project checkpoints.
 * Provides a button to save the current state for Time Travel functionality.
 */

import { memo, useCallback, useState } from 'react';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { classNames } from '~/utils/classNames';

export interface CheckpointButtonProps {
  /** Callback when checkpoint should be created */
  onCreateCheckpoint?: (description?: string) => Promise<void>;

  /** Whether checkpoint creation is disabled */
  disabled?: boolean;

  /** Whether checkpoint is currently being created */
  isLoading?: boolean;

  /** Number of existing checkpoints (for display) */
  checkpointCount?: number;

  /** Custom class name */
  className?: string;
}

/**
 * Button component for creating checkpoints in the editor panel.
 * Displays a loading state during checkpoint creation.
 */
export const CheckpointButton = memo(
  ({
    onCreateCheckpoint,
    disabled = false,
    isLoading = false,
    checkpointCount = 0,
    className,
  }: CheckpointButtonProps) => {
    const [isCreating, setIsCreating] = useState(false);

    const handleClick = useCallback(async () => {
      if (disabled || isLoading || isCreating || !onCreateCheckpoint) {
        return;
      }

      setIsCreating(true);

      try {
        await onCreateCheckpoint();
      } finally {
        setIsCreating(false);
      }
    }, [disabled, isLoading, isCreating, onCreateCheckpoint]);

    const isDisabled = disabled || isLoading || isCreating;
    const showLoading = isLoading || isCreating;

    const elements: Array<JSX.Element | string> = [
      <div
        key="icon"
        className={classNames(showLoading ? 'i-ph:spinner-gap animate-spin' : 'i-ph:bookmark-simple', 'text-sm')}
      />,
      showLoading ? 'Création...' : 'Checkpoint',
    ];

    if (!showLoading && checkpointCount > 0) {
      elements.push(
        <span key="count" className="text-xs opacity-60">
          ({checkpointCount})
        </span>,
      );
    }

    return (
      <PanelHeaderButton className={classNames(className)} disabled={isDisabled} onClick={handleClick}>
        {elements}
      </PanelHeaderButton>
    );
  },
);

CheckpointButton.displayName = 'CheckpointButton';
