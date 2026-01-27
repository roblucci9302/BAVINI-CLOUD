'use client';

import { useStore } from '@nanostores/react';
import type { Message } from '~/types/message';
import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';

// Charger le CSS de toast de manière lazy
let toastCssLoaded = false;
const loadToastCss = () => {
  if (toastCssLoaded) {
    return;
  }

  toastCssLoaded = true;
  import('react-toastify/dist/ReactToastify.css');
};
import { AgentChatIntegration, UserQuestionModal } from '~/components/agent';
import { PlanPreview, PlanModeFloatingIndicator } from '~/components/plan';
import { TaskProgress, TaskProgressIndicatorFloating } from '~/components/todos';
// DISABLED: Auth system temporarily disabled for development
// import { AuthModal } from '~/components/auth/AuthModal';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll, useLazyAnimate, useMessageEditing, type SendMessageFn } from '~/lib/hooks';
import { fetchWithRetry } from '~/utils/fetch-with-retry';
import { compressImage, terminateCompressionWorker, fileToDataURL } from '~/lib/image-compression';
import { useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
// DISABLED: Auth system temporarily disabled for development
// import { canMakeRequest, incrementRequestCount, remainingRequestsStore } from '~/lib/stores/auth';
// import { isSupabaseConfigured } from '~/lib/supabase/client';
import { fileModificationsToHTML } from '~/utils/diff';
import {
  createUserFriendlyError,
  formatErrorForToast,
  getUserFriendlyErrorFromStatus,
} from '~/lib/errors/user-messages';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import { EditMessageModal } from './EditMessageModal';
import { multiAgentEnabledStore } from './MultiAgentToggle';
import { sharedMessageParser, clearProcessedTracking } from '~/lib/hooks/useMessageParser';
import { updateAgentStatus } from '~/lib/stores/agents';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

// Regex pré-compilée pour le parsing du format AI SDK (évite recompilation à chaque chunk)
const AI_SDK_LINE_REGEX = /^([0-9a-z]):(.+)$/i;

// Import utility functions from separate module for easier testing
import { isContinuationRequest, isLastResponseIncomplete, getContinuationContext } from './chat-utils';

// Re-export for backwards compatibility
export { isContinuationRequest, isLastResponseIncomplete, getContinuationContext };

export function Chat() {
  renderLogger.trace('Chat');

  const { initialMessages, storeMessageHistory, messagesLoading } = useChatHistory();
  const showWorkbench = useStore(workbenchStore.showWorkbench);

  return (
    <>
      <ErrorBoundary
        onError={(error) => {
          logger.error('Chat error boundary caught error:', error);
        }}
      >
        {/* Always render ChatImpl immediately for fast FCP
         * Messages will load in background and update via state
         */}
        <ChatImpl
          initialMessages={initialMessages}
          storeMessageHistory={storeMessageHistory}
          messagesLoading={messagesLoading}
        />
      </ErrorBoundary>
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
      {/* Agent system integration - show only when workbench is active */}
      {showWorkbench && <AgentChatIntegration showStatusBadge={true} showActivityLog={true} position="bottom-right" />}

      {/* Plan Mode components */}
      <PlanPreview />
      <PlanModeFloatingIndicator />

      {/* Task Progress components */}
      <TaskProgress position="bottom-left" />
      <TaskProgressIndicatorFloating position="bottom-left" />

      {/* User Question Modal */}
      <UserQuestionModal />
    </>
  );
}

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  messagesLoading?: boolean;
}

interface FilePreview {
  file: File;
  preview: string;
}

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const ChatImpl = memo(({ initialMessages, storeMessageHistory, messagesLoading = false }: ChatProps) => {
  useShortcuts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFilesRef = useRef<FilePreview[]>([]);

  const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
  const [selectedFiles, setSelectedFiles] = useState<FilePreview[]>([]);
  const [continuationContext, setContinuationContext] = useState<{ artifactId: string | null } | null>(null);

  // Update chatStarted when initialMessages load (from DB)
  useEffect(() => {
    if (initialMessages.length > 0) {
      setChatStarted(true);
      chatStore.setKey('started', true);
    }
  }, [initialMessages.length]);

  // Ref for sendMessage (needed by useMessageEditing hook due to circular dependency)
  const sendMessageRef = useRef<SendMessageFn | null>(null);

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { showChat, mode } = useStore(chatStore);
  const multiAgentEnabled = useStore(multiAgentEnabledStore);

  const [animationScope, animate] = useLazyAnimate();

  // Charger le CSS de toast au premier rendu
  useEffect(() => {
    loadToastCss();
  }, []);

  /**
   * Cleanup compression worker on unmount.
   * PERFORMANCE: Frees worker resources when Chat component is unmounted.
   */
  useEffect(() => {
    return () => {
      terminateCompressionWorker();
    };
  }, []);

  /*
   * ============================================================================
   * ÉTAT PARTAGÉ UNIQUE - Messages unifiés pour les deux modes
   * ============================================================================
   * Pattern optimisé : on utilise initialMessages comme base et on track
   * uniquement les messages ajoutés durant la session courante.
   * Cela évite la duplication d'état et les re-renders de synchronisation.
   */
  const hasSyncedFromDBRef = useRef(false);
  const [sessionMessages, setSessionMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Messages = DB messages (initial) + session messages (nouveaux).
   * Cette approche évite la duplication d'état et garantit une source de vérité unique.
   */
  const messages = useMemo(() => {
    return [...initialMessages, ...sessionMessages];
  }, [initialMessages, sessionMessages]);

  /**
   * Track when we've synced from DB (moved from useMemo to useEffect to avoid side effects in memoization)
   */
  useEffect(() => {
    if (initialMessages.length > 0 && !hasSyncedFromDBRef.current) {
      hasSyncedFromDBRef.current = true;
    }
  }, [initialMessages]);

  /**
   * Fonction pour remplacer tous les messages de session.
   * Gère à la fois les updaters fonctionnels et les tableaux directs.
   */
  const setMessages = useCallback(
    (messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])) => {
      if (typeof messagesOrUpdater === 'function') {
        setSessionMessages((prevSession) => {
          const prevTotal = [...initialMessages, ...prevSession];
          const newTotal = messagesOrUpdater(prevTotal);
          const initialIds = new Set(initialMessages.map((m) => m.id));

          return newTotal.filter((m) => !initialIds.has(m.id));
        });
      } else {
        const initialIds = new Set(initialMessages.map((m) => m.id));
        setSessionMessages(messagesOrUpdater.filter((m) => !initialIds.has(m.id)));
      }
    },
    [initialMessages],
  );

  // Message editing hook (uses ref pattern to avoid circular dependency with sendMessage)
  const {
    editingMessageIndex,
    editingMessageContent,
    handleEditMessage,
    handleCancelEdit,
    handleSaveEdit,
    handleDeleteMessage,
    handleRegenerateMessage,
  } = useMessageEditing({
    messages,
    setMessages,
    sendMessageRef,
    storeMessageHistory,
  });

  const [streamingContent, setStreamingContent] = useState('');
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef<string>('');

  // Refs pour le streaming optimisé avec flush garanti
  const streamingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStreamingContentRef = useRef<string>('');
  const lastUpdateTimeRef = useRef<number>(0);

  // Constantes pour le streaming
  const STREAMING_UPDATE_INTERVAL_MS = 16; // ~60fps pour une fluidité optimale
  const STREAMING_FLUSH_DELAY_MS = 32; // Délai max avant flush forcé (réduit pour moins de pauses)

  /**
   * Mise à jour optimisée du contenu de streaming.
   * Utilise un timer interval au lieu de RAF pour garantir que tout le contenu est affiché.
   * - Met à jour immédiatement si le dernier update est > STREAMING_UPDATE_INTERVAL_MS
   * - Sinon, planifie un update garanti après STREAMING_FLUSH_DELAY_MS
   */
  const scheduleStreamingUpdate = useCallback((content: string) => {
    pendingStreamingContentRef.current = content;
    const now = Date.now();

    // Si assez de temps s'est écoulé, mettre à jour immédiatement
    if (now - lastUpdateTimeRef.current >= STREAMING_UPDATE_INTERVAL_MS) {
      lastUpdateTimeRef.current = now;
      setStreamingContent(content);

      // Annuler tout timer pending
      if (streamingUpdateRef.current !== null) {
        clearTimeout(streamingUpdateRef.current);
        streamingUpdateRef.current = null;
      }
    } else if (streamingUpdateRef.current === null) {
      // Planifier un flush garanti pour ne pas perdre de contenu
      streamingUpdateRef.current = setTimeout(() => {
        lastUpdateTimeRef.current = Date.now();
        setStreamingContent(pendingStreamingContentRef.current);
        streamingUpdateRef.current = null;
      }, STREAMING_FLUSH_DELAY_MS);
    }
    // Note: Si un timer est déjà planifié, on met juste à jour la ref
    // Le timer utilisera la dernière valeur de pendingStreamingContentRef
  }, []);

  // Cleanup du timer au démontage
  useEffect(() => {
    return () => {
      if (streamingUpdateRef.current !== null) {
        clearTimeout(streamingUpdateRef.current);
      }
    };
  }, []);

  // Utiliser le parser partagé (singleton) pour éviter les doublons d'artifacts/actions
  const messageParser = sharedMessageParser;

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  // Stop/abort function
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // BUGFIX: Annuler tout timer de streaming pending pour éviter les updates après stop
    if (streamingUpdateRef.current !== null) {
      clearTimeout(streamingUpdateRef.current);
      streamingUpdateRef.current = null;
    }

    setIsLoading(false);
    setStreamingContent('');

    if (multiAgentEnabled) {
      // Utiliser 'aborted' pour le retrait différé
      updateAgentStatus('orchestrator', 'aborted');
    }
  }, [multiAgentEnabled]);

  // Get project files for context - memoized and reactive to file changes
  const workbenchFiles = useStore(workbenchStore.files);

  const projectFiles = useMemo(() => {
    const files: Array<{ path: string; content?: string }> = [];

    try {
      if (workbenchFiles && typeof workbenchFiles === 'object') {
        for (const [path, fileData] of Object.entries(workbenchFiles)) {
          if (fileData && typeof fileData === 'object' && 'content' in fileData) {
            files.push({
              path,
              content: (fileData as { content: string }).content,
            });
          }
        }
      }
    } catch (error) {
      logger.warn('Could not get files from workbench:', error);
    }

    return files;
  }, [workbenchFiles]);

  const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
  const { parsedMessages, parseMessages } = useMessageParser();

  // Cache des messages transformés pour éviter les re-créations d'objets
  const transformedMessagesCache = useRef<Map<string, Message>>(new Map());

  // Memoize les messages SANS le streaming pour éviter les re-renders en cascade
  // Le streaming est géré séparément via streamingContent
  const displayMessages = useMemo(() => {
    const cache = transformedMessagesCache.current;

    return messages.map((message, i) => {
      if (message.role === 'user') {
        return message;
      }

      // Use message.id for lookup, fallback to index-based key for backwards compat
      const messageKey = message.id ?? `msg-${i}`;
      const parsedContent = parsedMessages[messageKey] || '';

      // Vérifier si on a déjà une version cachée avec le même contenu
      const cacheKey = `${messageKey}:${parsedContent.length}`;
      const cached = cache.get(cacheKey);

      if (cached && cached.content === parsedContent) {
        return cached;
      }

      // Créer un nouvel objet seulement si le contenu a changé
      const transformed = {
        ...message,
        content: parsedContent,
      };

      cache.set(cacheKey, transformed);
      return transformed;
    });
    // NOTE: streamingContent retiré des dépendances - géré séparément
  }, [messages, parsedMessages]);

  const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

  /*
   * Sync chatStore on mount - like Bolt.new
   * Since we only render when ready=true, initialMessages is already populated at mount
   */
  useEffect(() => {
    chatStore.setKey('started', initialMessages.length > 0);

    // Clear artifact/action tracking for fresh chat (prevents duplicates on DEV mode re-parse)
    if (initialMessages.length === 0) {
      clearProcessedTracking();
    }
  }, []);

  useEffect(() => {
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  }, [messages, isLoading, parseMessages, initialMessages.length, storeMessageHistory]);

  const scrollTextArea = () => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  };

  const abort = useCallback(() => {
    stop();
    chatStore.setKey('aborted', true);
    workbenchStore.abortAllActions();
  }, [stop]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = 'auto';

      const scrollHeight = textarea.scrollHeight;

      textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;

      // Always use 'auto' to avoid scrollbar appearing/disappearing and shifting content
      textarea.style.overflowY = 'auto';
    }
  }, [input, textareaRef]);

  const runAnimation = async () => {
    if (chatStarted) {
      return;
    }

    await Promise.all([
      animate('#categories', { opacity: 0, display: 'none' }, { duration: 0.1 }),
      animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
    ]);

    chatStore.setKey('started', true);

    setChatStarted(true);
  };

  /*
   * ============================================================================
   * ENVOI UNIFIÉ - Une seule fonction pour les deux modes
   * ============================================================================
   */
  const sendMessage = useCallback(
    async (_event: React.UIEvent, messageInput?: string) => {
      const _input = messageInput || input;

      // allow sending if there's text OR files
      if ((_input.length === 0 && selectedFiles.length === 0) || isLoading) {
        return;
      }

      // DISABLED: Auth check temporarily disabled for development
      // if (isSupabaseConfigured() && !canMakeRequest()) {
      //   // Show auth modal instead of toast
      //   setShowAuthModal(true);
      //   return;
      // }

      await workbenchStore.saveAllFiles();

      const fileModifications = workbenchStore.getFileModifications();

      chatStore.setKey('aborted', false);
      runAnimation();

      // build the message content
      let messageContent = _input;

      // Détecter les demandes de continuation
      if (isContinuationRequest(_input)) {
        const { incomplete, lastContent } = isLastResponseIncomplete(messages);

        if (incomplete || lastContent) {
          logger.debug('Continuation request detected, setting context');

          const context = getContinuationContext(lastContent);
          setContinuationContext(context);
        }
      }

      // if there are file modifications, prefix them
      if (fileModifications !== undefined) {
        const diff = fileModificationsToHTML(fileModifications);
        messageContent = `${diff}\n\n${_input}`;
        workbenchStore.resetAllFileModifications();
      }

      // Add user message to the unified state
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: messageContent,
      };
      setMessages((prev) => [...prev, userMessage]);

      // Handle file uploads (images)
      if (selectedFiles.length > 0) {
        try {
          const imageDataUrls = await Promise.all(selectedFiles.map((filePreview) => fileToDataURL(filePreview.file)));
          const contentParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [];

          imageDataUrls.forEach((dataUrl) => {
            contentParts.push({ type: 'image', image: dataUrl });
          });

          if (messageContent.length > 0) {
            contentParts.push({ type: 'text', text: messageContent });
          } else {
            contentParts.push({ type: 'text', text: 'Voici une image de référence pour mon projet.' });
          }

          // Update user message with multimodal content
          setMessages((prev) =>
            prev.map((m) => (m.id === userMessage.id ? { ...m, content: contentParts as unknown as string } : m)),
          );

          selectedFiles.forEach((filePreview) => {
            URL.revokeObjectURL(filePreview.preview);
          });
          setSelectedFiles([]);
        } catch (error) {
          logger.error('Error converting files to base64:', error);
          toast.error('Erreur lors du traitement des images. Vérifiez que vos fichiers sont valides et réessayez.');

          return;
        }
      }

      // Clear input
      setInput('');
      resetEnhancer();
      textareaRef.current?.blur();

      /*
       * ============================================================================
       * STREAMING - API différente selon le mode, mais même état de messages
       * ============================================================================
       */
      setIsLoading(true);
      setStreamingContent('');
      messageIdRef.current = `stream-${Date.now()}`;
      abortControllerRef.current = new AbortController();

      const apiUrl = multiAgentEnabled ? '/api/agent' : '/api/chat';

      // Filter out system messages and empty content - only send user/assistant messages
      const messagesForApi = messages
        .filter((msg) => msg.role !== 'system' && msg.content && String(msg.content).trim() !== '')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }));

      // Add the new user message
      messagesForApi.push({
        role: 'user',
        content: messageContent,
      });

      if (multiAgentEnabled) {
        updateAgentStatus('orchestrator', 'thinking');
        logger.info(`Sending to ${apiUrl} with ${messagesForApi.length} messages (multi-agent mode)`);
      } else {
        logger.info(`Sending to ${apiUrl} with ${messagesForApi.length} messages (normal mode)`);
      }

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messagesForApi,
            files: projectFiles,
            mode,
            continuationContext,
            controlMode: 'strict',
            multiAgent: multiAgentEnabled,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          // Get retry-after header for rate limiting
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

          // Try to get error details from response body
          let errorMessage = response.statusText;
          try {
            const errorBody = await response.json() as { error?: { message?: string } | string };
            if (typeof errorBody.error === 'object' && errorBody.error?.message) {
              errorMessage = errorBody.error.message;
            } else if (typeof errorBody.error === 'string') {
              errorMessage = errorBody.error;
            }
          } catch {
            // Ignore JSON parsing errors
          }

          // Create user-friendly error
          const friendlyError = getUserFriendlyErrorFromStatus(response.status, errorMessage, retryAfterSeconds);
          toast.error(formatErrorForToast(friendlyError));

          throw new Error(`API error: ${response.status} - ${errorMessage}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        // Optimized content accumulation - O(n) instead of O(n²)
        // We keep both the array (for final message) and a cached full string (for incremental updates)
        const contentChunks: string[] = [];
        let cachedFullContent = ''; // Cached joined content - avoids re-joining on every chunk
        let parsedContent = ''; // Accumulator for parsed content
        let lineBuffer = ''; // Buffer for incomplete JSON lines
        let lastParseTime = 0; // Throttle parsing for performance
        // REDUCED: 50ms causait des pauses visibles. scheduleStreamingUpdate a déjà son throttle (32ms)
        const PARSE_THROTTLE_MS = 16; // Parse at most every 16ms (~60fps)

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });

            if (multiAgentEnabled) {
              /*
               * Parse agent response format (JSON lines)
               * Add chunk to buffer and split by newlines
               */
              lineBuffer += chunk;

              const lines = lineBuffer.split('\n');

              // Keep the last incomplete line in the buffer
              lineBuffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) {
                  continue;
                }

                try {
                  const parsed = JSON.parse(line);

                  if (parsed.type === 'text') {
                    contentChunks.push(parsed.content);
                    // O(1) append instead of O(n) join
                    cachedFullContent += parsed.content;

                    // Throttle parsing for performance
                    const now = Date.now();
                    if (now - lastParseTime >= PARSE_THROTTLE_MS) {
                      lastParseTime = now;
                      const newParsed = messageParser.parse(messageIdRef.current, cachedFullContent);
                      // BUGFIX: Accumuler le contenu parsé - le parser retourne seulement le delta!
                      parsedContent += newParsed;
                      scheduleStreamingUpdate(parsedContent);
                    }
                  } else if (parsed.type === 'agent_status') {
                    // Validate agent_status data before updating
                    if (parsed.agent && parsed.status) {
                      setCurrentAgent(parsed.agent);
                      updateAgentStatus(parsed.agent, parsed.status);
                    } else {
                      logger.warn('Invalid agent_status: missing agent or status', parsed);
                    }
                  } else if (parsed.type === 'error') {
                    logger.error('Agent error:', parsed.error);
                    const friendlyError = createUserFriendlyError({ code: 'AGENT_001', message: parsed.error });
                    toast.error(formatErrorForToast(friendlyError));
                  }
                } catch (e) {
                  // Log parsing errors for debugging
                  logger.warn('Failed to parse line:', line.substring(0, 100));
                }
              }
            } else {
              /*
               * Parse AI SDK format (0:"text"\n)
               * Use lineBuffer to handle incomplete lines across chunks
               */
              lineBuffer += chunk;

              const lines = lineBuffer.split('\n');

              // Keep the last potentially incomplete line in the buffer
              lineBuffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) {
                  continue;
                }

                const match = line.match(AI_SDK_LINE_REGEX);

                if (match) {
                  const [, type, data] = match;

                  if (type === '0') {
                    try {
                      const content = JSON.parse(data);
                      contentChunks.push(content);
                      // O(1) append instead of O(n) join
                      cachedFullContent += content;

                      // Throttle parsing for performance
                      const now = Date.now();
                      if (now - lastParseTime >= PARSE_THROTTLE_MS) {
                        lastParseTime = now;
                        const newParsed = messageParser.parse(messageIdRef.current, cachedFullContent);
                        // BUGFIX: Accumuler le contenu parsé - le parser retourne seulement le delta!
                        parsedContent += newParsed;
                        scheduleStreamingUpdate(parsedContent);
                      }
                    } catch {
                      // JSON parse failed - likely malformed, skip this chunk
                      logger.warn('Failed to parse AI SDK line:', line.substring(0, 100));
                    }
                  }
                }
              }
            }
          }

          // Process any remaining content in the buffer
          if (lineBuffer.trim()) {
            if (multiAgentEnabled) {
              try {
                const parsed = JSON.parse(lineBuffer);

                if (parsed.type === 'text') {
                  contentChunks.push(parsed.content);
                  cachedFullContent += parsed.content;

                  // Final parse - no throttling
                  // BUGFIX: Accumuler le contenu parsé - le parser retourne seulement le delta!
                  const newParsed = messageParser.parse(messageIdRef.current, cachedFullContent);
                  parsedContent += newParsed;
                  scheduleStreamingUpdate(parsedContent);
                }
              } catch {
                logger.warn('Incomplete JSON at stream end:', lineBuffer.substring(0, 100));
              }
            } else {
              // Process remaining AI SDK format line
              const match = lineBuffer.match(AI_SDK_LINE_REGEX);

              if (match) {
                const [, type, data] = match;

                if (type === '0') {
                  try {
                    const content = JSON.parse(data);
                    contentChunks.push(content);
                    cachedFullContent += content;

                    // Final parse - no throttling
                    // BUGFIX: Accumuler le contenu parsé - le parser retourne seulement le delta!
                    const newParsed = messageParser.parse(messageIdRef.current, cachedFullContent);
                    parsedContent += newParsed;
                    scheduleStreamingUpdate(parsedContent);
                  } catch {
                    logger.warn('Incomplete AI SDK line at stream end:', lineBuffer.substring(0, 100));
                  }
                }
              }
            }
          }

          // Ensure final parse is done with all content
          // BUGFIX: Appeler parse() une seule fois et accumuler le résultat
          if (cachedFullContent) {
            const finalDelta = messageParser.parse(messageIdRef.current, cachedFullContent);
            if (finalDelta) {
              parsedContent += finalDelta;
            }
          }

          // BUGFIX: Flush immédiat du contenu final pour éviter les race conditions
          // Annuler tout timer pending et faire un update synchrone
          if (streamingUpdateRef.current !== null) {
            clearTimeout(streamingUpdateRef.current);
            streamingUpdateRef.current = null;
          }
          // Update synchrone final avec tout le contenu parsé
          if (parsedContent) {
            setStreamingContent(parsedContent);
          }
        }

        // Use cached content for final message (already joined, O(1))
        const fullContent = cachedFullContent;

        // Add assistant message to unified state
        const assistantMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: fullContent,
        };

        // BUGFIX: Clear streaming content AVANT d'ajouter le message
        // pour éviter un flash où les deux sont visibles
        setStreamingContent('');
        setMessages((prev) => [...prev, assistantMessage]);

        // Store in history
        storeMessageHistory([...messages, userMessage, assistantMessage]).catch((error) => toast.error(error.message));

        // DISABLED: Increment rate limit counter temporarily disabled for development
        // if (isSupabaseConfigured()) {
        //   incrementRequestCount();
        // }

        if (multiAgentEnabled) {
          // Utiliser 'completed' pour déclencher le retrait différé (visible 1.5s)
          updateAgentStatus('orchestrator', 'completed');
        }

        setContinuationContext(null);
        logger.debug('Finished streaming');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.info('Request aborted');

          if (multiAgentEnabled) {
            updateAgentStatus('orchestrator', 'aborted');
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Request failed:', errorMessage);
          const friendlyError = createUserFriendlyError(error);
          toast.error(formatErrorForToast(friendlyError));

          if (multiAgentEnabled) {
            updateAgentStatus('orchestrator', 'failed');
          }
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;

        // BUGFIX: Toujours annuler les timers de streaming pending
        if (streamingUpdateRef.current !== null) {
          clearTimeout(streamingUpdateRef.current);
          streamingUpdateRef.current = null;
        }

        // Toujours nettoyer l'état du parser (même en cas d'erreur)
        if (messageIdRef.current) {
          messageParser.clearMessage(messageIdRef.current);
        }
      }
    },
    [
      input,
      isLoading,
      selectedFiles,
      messages,
      multiAgentEnabled,
      mode,
      projectFiles,
      storeMessageHistory,
      resetEnhancer,
      scheduleStreamingUpdate,
    ],
  );

  // Update ref for useMessageEditing hook (must be after sendMessage is defined)
  sendMessageRef.current = sendMessage;

  const [messageRef, scrollRef] = useSnapScroll();

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    if (!files) {
      return;
    }

    // Process files in parallel with validation and compression
    const filePromises = Array.from(files).map(async (file): Promise<FilePreview | null> => {
      // validate file type
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        toast.error(`Type de fichier non supporté: ${file.name}. Utilisez JPEG, PNG, GIF ou WebP.`);
        return null;
      }

      // validate file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Fichier trop volumineux: ${file.name}. Maximum 5MB.`);
        return null;
      }

      try {
        // Compress image for better performance
        const compressedFile = await compressImage(file);

        // Create preview URL from compressed file
        const preview = URL.createObjectURL(compressedFile);

        return { file: compressedFile, preview };
      } catch {
        // Fallback to original on compression error
        const preview = URL.createObjectURL(file);
        return { file, preview };
      }
    });

    const results = await Promise.all(filePromises);
    const newFiles = results.filter((f): f is FilePreview => f !== null);

    if (newFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }

    // reset input so same file can be selected again
    event.target.value = '';
  };

  const handleFileRemove = (index: number) => {
    setSelectedFiles((prev) => {
      const newFiles = [...prev];

      // revoke the object URL to free memory
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);

      return newFiles;
    });
  };

  // Keep ref in sync with state for cleanup
  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  // cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      selectedFilesRef.current.forEach((filePreview) => {
        URL.revokeObjectURL(filePreview.preview);
      });
    };
  }, []);

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        aria-label="Sélectionner des images à joindre"
        onChange={handleFileChange}
      />
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading}
        streamingContent={streamingContent}
        isLoadingSession={messagesLoading}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        selectedFiles={selectedFiles}
        sendMessage={sendMessage}
        messageRef={messageRef}
        scrollRef={scrollRef}
        handleInputChange={handleInputChange}
        handleStop={abort}
        onFileSelect={handleFileSelect}
        onFileRemove={handleFileRemove}
        onSaveEdit={handleSaveEdit}
        onDeleteMessage={handleDeleteMessage}
        onRegenerateMessage={handleRegenerateMessage}
        messages={displayMessages}
        enhancePrompt={() => {
          enhancePrompt(input, (input) => {
            setInput(input);
            scrollTextArea();
          });
        }}
      />

      {/* Edit Message Modal */}
      <EditMessageModal
        isOpen={editingMessageIndex !== null}
        initialContent={editingMessageContent}
        messageIndex={editingMessageIndex ?? 0}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
      />

      {/* DISABLED: Auth Modal temporarily disabled for development */}
      {/* <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message="Créez un compte gratuit pour commencer à générer du code"
      /> */}
    </>
  );
});
