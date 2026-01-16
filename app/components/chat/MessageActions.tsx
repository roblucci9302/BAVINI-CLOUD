'use client';

import { memo, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { IconButton } from '~/components/ui/IconButton';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MessageActions');

export type MessageRole = 'user' | 'assistant';

export interface MessageActionsProps {
  role: MessageRole;
  messageIndex: number;
  content: string;
  onEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
  onCopy?: (content: string) => void;
  onRegenerate?: (index: number) => void;
  isStreaming?: boolean;
  isLast?: boolean;
  className?: string;
}

export const MessageActions = memo(
  ({
    role,
    messageIndex,
    content,
    onEdit,
    onDelete,
    onCopy,
    onRegenerate,
    isStreaming = false,
    isLast = false,
    className,
  }: MessageActionsProps) => {
    const [copied, setCopied] = useState(false);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);

    const handleCopy = async () => {
      if (!content) {
        return;
      }

      try {
        // Extract text content, removing any HTML if present
        const textContent = content.replace(/<[^>]*>/g, '');
        await navigator.clipboard.writeText(textContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onCopy?.(textContent);
      } catch (err) {
        logger.error('Failed to copy:', err);
      }
    };

    const handleDelete = () => {
      if (showConfirmDelete) {
        onDelete?.(messageIndex);
        setShowConfirmDelete(false);
      } else {
        setShowConfirmDelete(true);

        // Auto-hide confirm after 3 seconds
        setTimeout(() => setShowConfirmDelete(false), 3000);
      }
    };

    // Don't show actions while streaming
    if (isStreaming && isLast) {
      return null;
    }

    return (
      <div
        className={classNames(
          'flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity duration-150',
          className,
        )}
        role="toolbar"
        aria-label={`Actions pour le message ${role === 'user' ? 'utilisateur' : 'assistant'}`}
      >
        {/* Copy button - available for all messages */}
        <IconButton
          icon={copied ? 'i-ph:check' : 'i-ph:copy'}
          size="sm"
          title={copied ? 'Copié !' : 'Copier le message'}
          onClick={handleCopy}
          className={classNames('transition-colors', { 'text-bolt-elements-icon-success': copied })}
        />

        {/* User message actions */}
        {role === 'user' && (
          <>
            {onEdit && (
              <IconButton
                icon="i-ph:pencil-simple"
                size="sm"
                title="Modifier le message"
                onClick={() => onEdit(messageIndex)}
              />
            )}
            {onDelete && (
              <IconButton
                icon={showConfirmDelete ? 'i-ph:trash' : 'i-ph:trash'}
                size="sm"
                title={showConfirmDelete ? 'Cliquer pour confirmer' : 'Supprimer le message'}
                onClick={handleDelete}
                className={classNames('transition-colors', {
                  'text-bolt-elements-button-danger-text bg-bolt-elements-button-danger-background': showConfirmDelete,
                })}
              />
            )}
          </>
        )}

        {/* Assistant message actions */}
        {role === 'assistant' && (
          <>
            {onRegenerate && isLast && (
              <IconButton
                icon="i-ph:arrow-clockwise"
                size="sm"
                title="Régénérer la réponse"
                onClick={() => onRegenerate(messageIndex)}
              />
            )}
          </>
        )}
      </div>
    );
  },
);

MessageActions.displayName = 'MessageActions';

/**
 * Floating action bar that appears on message hover
 */
export interface FloatingActionsProps extends MessageActionsProps {
  position?: 'top-right' | 'bottom-right';
}

export const FloatingMessageActions = memo(({ position = 'top-right', ...props }: FloatingActionsProps) => {
  const positionClasses = {
    'top-right': 'absolute -top-1 -right-1 z-10',
    'bottom-right': 'absolute -bottom-1 -right-1 z-10',
  };

  return (
    <MessageActions
      {...props}
      className={classNames(
        positionClasses[position],
        'bg-bolt-elements-background-depth-1 rounded-md px-1.5 py-1 shadow-md border border-bolt-elements-borderColor',
        props.className,
      )}
    />
  );
});

FloatingMessageActions.displayName = 'FloatingMessageActions';
