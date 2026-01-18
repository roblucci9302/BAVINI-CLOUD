import type { Message } from '~/types/message';
import { useCallback, useRef, useState } from 'react';
import { StreamingMessageParser } from '~/lib/runtime/message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

/**
 * Singleton du parser de messages.
 * IMPORTANT: Une seule instance pour éviter les doublons d'artifacts/actions.
 * Exporté pour être utilisé dans Chat.client.tsx pour le streaming.
 */
export const sharedMessageParser = new StreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data) => {
      logger.debug('Artifact detected - Opening workbench', { id: data.id, title: data.title });

      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      logger.trace('onArtifactClose');

      workbenchStore.updateArtifact(data, { closed: true });
    },
    onActionOpen: (data) => {
      logger.debug('Action started', { type: data.action.type, actionId: data.actionId });

      if (data.action.type !== 'shell') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      logger.debug('Action completed', { type: data.action.type, actionId: data.actionId });

      if (data.action.type === 'shell') {
        workbenchStore.addAction(data);
      }

      workbenchStore.runAction(data);
    },
  },
});

// Alias pour compatibilité interne
const messageParser = sharedMessageParser;

/**
 * Optimized message parser hook.
 *
 * Improvements over original:
 * - Batching: collects all updates and performs ONE setState call instead of N calls
 * - Skips unchanged messages: tracks previous content to avoid redundant parsing
 * - Uses message IDs as keys (not indices) to prevent issues with reordering
 */
export function useMessageParser() {
  // CHANGED: Use message ID as key instead of index to prevent lookup issues
  const [parsedMessages, setParsedMessages] = useState<{ [key: string]: string }>({});

  // Track previous content to skip unchanged messages
  const prevContentRef = useRef<Map<string, string>>(new Map());

  // Track accumulated parsed content per message ID
  const accumulatedRef = useRef<Map<string, string>>(new Map());

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    let reset = false;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
      prevContentRef.current.clear();
      accumulatedRef.current.clear();
    }

    // Collect all updates in a single object (batching)
    const updates: { [key: string]: string } = {};
    let hasUpdates = false;

    for (const [index, message] of messages.entries()) {
      if (message.role !== 'assistant') {
        continue;
      }

      // Use message.id as key - fallback to index only if id is missing
      const messageId = message.id ?? `msg-${index}`;
      const content = typeof message.content === 'string' ? message.content : '';
      const prevContent = prevContentRef.current.get(messageId);

      // Skip if content hasn't changed (optimization for completed messages)
      if (prevContent === content && !reset) {
        // Use cached accumulated content
        const cached = accumulatedRef.current.get(messageId);

        if (cached !== undefined) {
          updates[messageId] = cached;
          hasUpdates = true;
        }

        continue;
      }

      // Parse the message
      const newParsedContent = messageParser.parse(messageId, content);

      // Accumulate parsed content
      const accumulated = reset ? newParsedContent : (accumulatedRef.current.get(messageId) || '') + newParsedContent;

      accumulatedRef.current.set(messageId, accumulated);
      prevContentRef.current.set(messageId, content);

      updates[messageId] = accumulated;
      hasUpdates = true;
    }

    // Single batched state update instead of N updates
    if (hasUpdates) {
      setParsedMessages((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  return { parsedMessages, parseMessages };
}
