'use client';

import type { Message } from '~/types/message';
import React, { useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';

// Seuil pour activer la virtualisation (nombre de messages)
const VIRTUALIZATION_THRESHOLD = 50;

// Estimation de la hauteur d'un message en pixels (sera ajustée dynamiquement)
const MESSAGE_HEIGHT_ESTIMATE = 120;

// Nombre d'éléments à pré-rendre en dehors de la zone visible
const OVERSCAN_COUNT = 5;

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  /** Contenu du message en cours de streaming (rendu séparément pour éviter les re-renders) */
  streamingContent?: string;
  messages?: Message[];
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
  onRegenerateMessage?: (index: number) => void;
}

/**
 * Génère un ID stable pour un message
 * Utilise le contenu et l'index pour créer un hash simple
 */
function generateStableId(message: Message, index: number): string {
  if (message.id) {
    return message.id;
  }

  // Créer un hash simple basé sur le contenu et le rôle
  const content =
    typeof message.content === 'string' ? message.content.slice(0, 50) : JSON.stringify(message.content).slice(0, 50);

  const hash = `${message.role}-${index}-${content.length}`;

  return `msg-${hash}`;
}

interface MessageItemProps {
  message: Message;
  stableId: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isStreaming: boolean;
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
  onRegenerateMessage?: (index: number) => void;
}

/**
 * Composant mémoïsé pour un message individuel
 */
const MessageItem = React.memo(
  ({
    message,
    index,
    isFirst,
    isLast,
    isStreaming,
    onEditMessage,
    onDeleteMessage,
    onRegenerateMessage,
  }: MessageItemProps) => {
    const { role, content } = message;
    const isUserMessage = role === 'user';

    return (
      <div
        className={classNames('flex gap-4 w-full', {
          'p-4 rounded-[calc(0.75rem-1px)] bg-bolt-elements-messages-background': isUserMessage,
          'py-3 px-4': !isUserMessage,
          'mt-3': !isFirst,
        })}
      >
        {isUserMessage && (
          <div className="flex items-center justify-center w-[34px] h-[34px] overflow-hidden bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 rounded-full shrink-0 self-start">
            <div className="i-ph:user-fill text-xl"></div>
          </div>
        )}
        <div className="grid grid-cols-1 w-full">
          {isUserMessage ? (
            <UserMessage content={content} messageIndex={index} onEdit={onEditMessage} onDelete={onDeleteMessage} />
          ) : (
            <AssistantMessage
              content={content}
              messageIndex={index}
              isLast={isLast}
              isStreaming={isStreaming}
              onRegenerate={onRegenerateMessage}
            />
          )}
        </div>
      </div>
    );
  },
);

/**
 * Indicateur de streaming (spinner) - affiché quand pas encore de contenu
 */
const StreamingIndicator = React.memo(() => {
  return (
    <div
      className="text-center w-full text-bolt-elements-textSecondary i-svg-spinners:3-dots-fade text-4xl mt-4"
      role="status"
      aria-live="polite"
      aria-label="Génération de la réponse en cours"
    />
  );
});

/**
 * Message de streaming - rendu séparément pour éviter les re-renders des autres messages
 * Utilise son propre memo pour ne se re-render que quand streamingContent change
 */
interface StreamingMessageProps {
  content: string;
  messagesCount: number;
}

const StreamingMessage = React.memo(({ content, messagesCount }: StreamingMessageProps) => {
  const isFirst = messagesCount === 0;

  return (
    <div
      className={classNames('flex gap-4 w-full py-3 px-4', {
        'mt-3': !isFirst,
      })}
    >
      <div className="grid grid-cols-1 w-full">
        <AssistantMessage
          content={content}
          messageIndex={messagesCount}
          isLast={true}
          isStreaming={true}
        />
      </div>
    </div>
  );
});

StreamingMessage.displayName = 'StreamingMessage';

export const Messages = React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const { id, isStreaming = false, streamingContent, messages = [], onEditMessage, onDeleteMessage, onRegenerateMessage } = props;

  // Ref pour le conteneur de scroll (utilisé par le virtualizer)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Map pour conserver les IDs stables entre les re-renders
  const stableIdsRef = useRef<Map<Message, string>>(new Map());

  // Générer des IDs stables pour tous les messages
  const messagesWithStableIds = useMemo(() => {
    const idsMap = stableIdsRef.current;

    // Nettoyer les IDs orphelins (messages supprimés)
    const currentMessages = new Set(messages);

    for (const [msg] of idsMap) {
      if (!currentMessages.has(msg)) {
        idsMap.delete(msg);
      }
    }

    return messages.map((message, index) => {
      // Réutiliser l'ID existant si disponible
      let stableId = idsMap.get(message);

      if (!stableId) {
        stableId = generateStableId(message, index);
        idsMap.set(message, stableId);
      }

      return { message, stableId };
    });
  }, [messages]);

  // Déterminer si on doit utiliser la virtualisation
  const shouldVirtualize = messagesWithStableIds.length > VIRTUALIZATION_THRESHOLD;

  // Configuration du virtualizer
  const virtualizer = useVirtualizer({
    count: messagesWithStableIds.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => MESSAGE_HEIGHT_ESTIMATE,
    overscan: OVERSCAN_COUNT,
    enabled: shouldVirtualize,
  });

  // Callback pour merger les refs (forwardRef + scrollContainerRef)
  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      scrollContainerRef.current = element;

      if (typeof ref === 'function') {
        ref(element);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = element;
      }
    },
    [ref],
  );

  // Mode virtualisé pour les grandes listes de messages
  if (shouldVirtualize) {
    return (
      <div
        id={id}
        ref={setRefs}
        className={classNames('overflow-auto', props.className)}
        style={{ height: '100%' }}
        role="log"
        aria-label="Historique de la conversation"
        aria-live="polite"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const { message, stableId } = messagesWithStableIds[virtualItem.index];
            const isFirst = virtualItem.index === 0;
            // isLast seulement si pas de streaming
            const isLast = virtualItem.index === messagesWithStableIds.length - 1 && !isStreaming;

            return (
              <div
                key={stableId}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MessageItem
                  message={message}
                  stableId={stableId}
                  index={virtualItem.index}
                  isFirst={isFirst}
                  isLast={isLast}
                  isStreaming={false}
                  onEditMessage={onEditMessage}
                  onDeleteMessage={onDeleteMessage}
                  onRegenerateMessage={onRegenerateMessage}
                />
              </div>
            );
          })}
        </div>
        {/* Message de streaming rendu séparément */}
        {isStreaming && streamingContent && (
          <StreamingMessage content={streamingContent} messagesCount={messagesWithStableIds.length} />
        )}
        {isStreaming && !streamingContent && <StreamingIndicator />}
      </div>
    );
  }

  // Mode standard pour les petites listes (pas de virtualisation)
  return (
    <div
      id={id}
      ref={ref}
      className={props.className}
      role="log"
      aria-label="Historique de la conversation"
      aria-live="polite"
    >
      {messagesWithStableIds.length > 0
        ? messagesWithStableIds.map(({ message, stableId }, index) => {
            const isFirst = index === 0;
            // isLast seulement si pas de streaming en cours
            const isLast = index === messagesWithStableIds.length - 1 && !isStreaming;

            return (
              <MessageItem
                key={stableId}
                message={message}
                stableId={stableId}
                index={index}
                isFirst={isFirst}
                isLast={isLast}
                isStreaming={false} // Les messages existants ne sont jamais "en streaming"
                onEditMessage={onEditMessage}
                onDeleteMessage={onDeleteMessage}
                onRegenerateMessage={onRegenerateMessage}
              />
            );
          })
        : null}
      {/* Message de streaming rendu séparément pour éviter les re-renders */}
      {isStreaming && streamingContent && (
        <StreamingMessage content={streamingContent} messagesCount={messagesWithStableIds.length} />
      )}
      {/* Indicateur de chargement si streaming mais pas encore de contenu */}
      {isStreaming && !streamingContent && <StreamingIndicator />}
    </div>
  );
});

Messages.displayName = 'Messages';
