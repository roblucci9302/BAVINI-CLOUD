/**
 * =============================================================================
 * BAVINI CLOUD - Message Editing Hook
 * =============================================================================
 * Provides message editing functionality for chat components.
 * Handles edit, cancel, save, delete, and regenerate operations.
 *
 * @module lib/hooks/useMessageEditing
 * =============================================================================
 */

import { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import type { Message } from '~/types/message';

/**
 * Message editing state
 */
export interface MessageEditingState {
  editingMessageIndex: number | null;
  editingMessageContent: string;
}

/**
 * Message editing handlers return type
 */
export interface UseMessageEditingReturn {
  editingMessageIndex: number | null;
  editingMessageContent: string;
  handleEditMessage: (index: number) => void;
  handleCancelEdit: () => void;
  handleSaveEdit: (index: number, newContent: string) => Promise<void>;
  handleDeleteMessage: (index: number) => void;
  handleRegenerateMessage: (index: number) => Promise<void>;
}

/**
 * Type for sendMessage function
 */
export type SendMessageFn = (event: React.UIEvent, messageInput?: string) => Promise<void>;

/**
 * Options for useMessageEditing hook
 */
export interface UseMessageEditingOptions {
  messages: Message[];
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  sendMessageRef: React.RefObject<SendMessageFn | null>;
  storeMessageHistory: (messages: Message[]) => Promise<void>;
}

/**
 * Hook for managing message editing operations.
 * Provides handlers for editing, deleting, and regenerating messages.
 *
 * @param options - Configuration options
 * @returns Message editing state and handlers
 *
 * @example
 * ```tsx
 * const sendMessageRef = useRef<SendMessageFn | null>(null);
 *
 * const {
 *   editingMessageIndex,
 *   editingMessageContent,
 *   handleEditMessage,
 *   handleCancelEdit,
 *   handleSaveEdit,
 *   handleDeleteMessage,
 *   handleRegenerateMessage,
 * } = useMessageEditing({
 *   messages,
 *   setMessages,
 *   sendMessageRef,
 *   storeMessageHistory,
 * });
 *
 * // Later, after sendMessage is defined:
 * sendMessageRef.current = sendMessage;
 * ```
 */
export function useMessageEditing({
  messages,
  setMessages,
  sendMessageRef,
  storeMessageHistory,
}: UseMessageEditingOptions): UseMessageEditingReturn {
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');

  /**
   * Start editing a user message
   */
  const handleEditMessage = useCallback(
    (index: number) => {
      const message = messages[index];

      if (message && message.role === 'user') {
        const content = typeof message.content === 'string' ? message.content : '';
        setEditingMessageIndex(index);
        setEditingMessageContent(content);
      }
    },
    [messages],
  );

  /**
   * Cancel editing and reset state
   */
  const handleCancelEdit = useCallback(() => {
    setEditingMessageIndex(null);
    setEditingMessageContent('');
  }, []);

  /**
   * Save edited message and resend from that point
   */
  const handleSaveEdit = useCallback(
    async (index: number, newContent: string) => {
      // Close modal
      setEditingMessageIndex(null);
      setEditingMessageContent('');

      /*
       * Truncate messages up to and including the edited message
       * Then replace the user message with the new content and resend
       */
      const truncatedMessages = messages.slice(0, index);
      setMessages(truncatedMessages);

      // Wait a tick for state to update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Send the new message (this will add it to the messages array)
      const fakeEvent = {} as React.UIEvent;

      if (sendMessageRef.current) {
        await sendMessageRef.current(fakeEvent, newContent);
      }
    },
    [messages, sendMessageRef, setMessages],
  );

  /**
   * Delete a message and all following messages
   */
  const handleDeleteMessage = useCallback(
    (index: number) => {
      // Delete message and all following messages
      const truncatedMessages = messages.slice(0, index);
      setMessages(truncatedMessages);
      storeMessageHistory(truncatedMessages).catch((error) => toast.error(error.message));
      toast.success('Message supprimé');
    },
    [messages, setMessages, storeMessageHistory],
  );

  /**
   * Regenerate an assistant message by resending the previous user message
   */
  const handleRegenerateMessage = useCallback(
    async (index: number) => {
      // Find the last user message before this assistant message
      let lastUserMessageIndex = -1;

      for (let i = index - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserMessageIndex = i;
          break;
        }
      }

      if (lastUserMessageIndex === -1) {
        toast.error('Impossible de régénérer: aucun message utilisateur trouvé');
        return;
      }

      // Get the user message content
      const userMessage = messages[lastUserMessageIndex];
      const content = typeof userMessage.content === 'string' ? userMessage.content : '';

      // Truncate to just before the assistant message
      const truncatedMessages = messages.slice(0, lastUserMessageIndex);
      setMessages(truncatedMessages);

      // Wait a tick for state to update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Resend the user message
      const fakeEvent = {} as React.UIEvent;

      if (sendMessageRef.current) {
        await sendMessageRef.current(fakeEvent, content);
      }
    },
    [messages, sendMessageRef, setMessages],
  );

  return {
    editingMessageIndex,
    editingMessageContent,
    handleEditMessage,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleRegenerateMessage,
  };
}
