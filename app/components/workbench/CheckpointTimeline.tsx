'use client';

/**
 * CheckpointTimeline component for displaying and managing checkpoints.
 * Shows a chronological list of checkpoints with restore and delete actions.
 */

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { IconButton } from '~/components/ui/IconButton';
import type { Checkpoint } from '~/types/checkpoint';

export interface TimelineCheckpoint {
  id: string;
  time: string;
  timeAgo: string;
  description: string;
  type: 'auto' | 'manual' | 'before_action';
  sizeLabel: string;
}

export interface CheckpointTimelineProps {
  /** List of checkpoints to display */
  checkpoints: TimelineCheckpoint[];

  /** Currently active/selected checkpoint ID */
  currentCheckpointId?: string | null;

  /** Callback when a checkpoint is selected for restore */
  onSelectCheckpoint?: (checkpointId: string) => void;

  /** Callback when a checkpoint should be deleted */
  onDeleteCheckpoint?: (checkpointId: string) => void;

  /** Whether restore operations are disabled */
  disabled?: boolean;

  /** Whether the component is in loading state */
  isLoading?: boolean;

  /** Custom class name */
  className?: string;

  /** Compact mode for sidebar display */
  compact?: boolean;
}

/**
 * Get icon class for checkpoint type.
 */
function getTypeIcon(type: 'auto' | 'manual' | 'before_action'): string {
  switch (type) {
    case 'auto':
      return 'i-ph:robot';
    case 'manual':
      return 'i-ph:bookmark-simple';
    case 'before_action':
      return 'i-ph:arrow-counter-clockwise';
    default:
      return 'i-ph:circle';
  }
}

/**
 * Get label for checkpoint type.
 */
function getTypeLabel(type: 'auto' | 'manual' | 'before_action'): string {
  switch (type) {
    case 'auto':
      return 'Auto';
    case 'manual':
      return 'Manuel';
    case 'before_action':
      return 'Pré-action';
    default:
      return '';
  }
}

/**
 * Individual checkpoint item in the timeline.
 */
const CheckpointItem = memo(
  ({
    checkpoint,
    isActive,
    isHovered,
    disabled,
    compact,
    onSelect,
    onDelete,
    onMouseEnter,
    onMouseLeave,
  }: {
    checkpoint: TimelineCheckpoint;
    isActive: boolean;
    isHovered: boolean;
    disabled?: boolean;
    compact?: boolean;
    onSelect?: () => void;
    onDelete?: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  }) => {
    const handleClick = useCallback(() => {
      if (!disabled && onSelect) {
        onSelect();
      }
    }, [disabled, onSelect]);

    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!disabled && onDelete) {
          onDelete();
        }
      },
      [disabled, onDelete],
    );

    return (
      <div
        className={classNames(
          'relative flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors',
          'text-bolt-elements-textSecondary',
          {
            'hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3': !disabled,
            'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': isActive,
            'opacity-50 cursor-not-allowed': Boolean(disabled),
          },
        )}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={handleClick}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-selected={isActive}
        aria-disabled={disabled}
      >
        {/* Timeline visual indicator */}
        <div className="flex flex-col items-center shrink-0 pt-0.5">
          <div
            className={classNames(
              'w-2 h-2 rounded-full border transition-colors',
              isActive
                ? 'bg-bolt-elements-item-contentAccent border-bolt-elements-item-contentAccent'
                : 'bg-transparent border-bolt-elements-borderColor',
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Description */}
          <div className={classNames('text-sm truncate', compact ? 'max-w-[150px]' : 'max-w-[250px]')}>
            {checkpoint.description}
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-0.5">
            {/* Type indicator */}
            <span
              className={classNames(
                'flex items-center gap-1 text-xs',
                isActive ? 'text-bolt-elements-item-contentAccent' : 'text-bolt-elements-textTertiary',
              )}
            >
              <span className={classNames(getTypeIcon(checkpoint.type), 'text-[10px]')} />
              {!compact && getTypeLabel(checkpoint.type)}
            </span>

            {/* Time ago */}
            <span className="text-xs text-bolt-elements-textTertiary">{checkpoint.timeAgo}</span>

            {/* Size */}
            {!compact && <span className="text-xs text-bolt-elements-textTertiary">• {checkpoint.sizeLabel}</span>}
          </div>
        </div>

        {/* Actions on hover */}
        <AnimatePresence>
          {isHovered && !disabled && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.1 }}
              className="flex items-center shrink-0"
            >
              <IconButton
                icon="i-ph:trash"
                size="sm"
                className="text-bolt-elements-textTertiary hover:text-bolt-elements-item-contentDanger"
                onClick={handleDelete}
                title="Supprimer"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

CheckpointItem.displayName = 'CheckpointItem';

/**
 * Timeline component displaying a list of checkpoints.
 */
export const CheckpointTimeline = memo(
  ({
    checkpoints,
    currentCheckpointId,
    onSelectCheckpoint,
    onDeleteCheckpoint,
    disabled = false,
    isLoading = false,
    className,
    compact = false,
  }: CheckpointTimelineProps) => {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const handleMouseEnter = useCallback((id: string) => {
      setHoveredId(id);
    }, []);

    const handleMouseLeave = useCallback(() => {
      setHoveredId(null);
    }, []);

    if (isLoading) {
      return (
        <div className={classNames('flex items-center justify-center py-8', className)}>
          <div className="i-ph:spinner-gap animate-spin text-xl text-bolt-elements-textTertiary" />
        </div>
      );
    }

    if (checkpoints.length === 0) {
      return (
        <div className={classNames('flex flex-col items-center justify-center py-8 text-center', className)}>
          <div className="i-ph:bookmark-simple text-3xl text-bolt-elements-textTertiary mb-2" />
          <p className="text-sm text-bolt-elements-textSecondary">Aucun checkpoint</p>
          <p className="text-xs text-bolt-elements-textTertiary mt-1">
            Créez un checkpoint pour sauvegarder l'état actuel
          </p>
        </div>
      );
    }

    return (
      <div className={classNames('space-y-1', className)}>
        {/* Header with count */}
        <div className="flex items-center justify-between px-2 py-1 text-xs text-bolt-elements-textTertiary">
          <span>Checkpoints ({checkpoints.length})</span>
        </div>

        {/* Timeline items */}
        <div className="relative">
          {/* Vertical line connecting checkpoints */}
          {checkpoints.length > 1 && (
            <div
              className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-bolt-elements-borderColor"
              style={{ zIndex: 0 }}
            />
          )}

          {/* Checkpoint items */}
          {checkpoints.map((checkpoint) => (
            <CheckpointItem
              key={checkpoint.id}
              checkpoint={checkpoint}
              isActive={checkpoint.id === currentCheckpointId}
              isHovered={checkpoint.id === hoveredId}
              disabled={disabled}
              compact={compact}
              onSelect={() => onSelectCheckpoint?.(checkpoint.id)}
              onDelete={() => onDeleteCheckpoint?.(checkpoint.id)}
              onMouseEnter={() => handleMouseEnter(checkpoint.id)}
              onMouseLeave={handleMouseLeave}
            />
          ))}
        </div>
      </div>
    );
  },
);

CheckpointTimeline.displayName = 'CheckpointTimeline';
