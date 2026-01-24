'use client';

import { useStore } from '@nanostores/react';
import type { Message } from '~/types/message';
import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';

// Lazy load framer-motion pour éviter le bundle initial
type AnimateFunction = (
  selector: string,
  keyframes: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<void>;
type AnimationScope = React.RefObject<HTMLDivElement>;

function useLazyAnimate(): [AnimationScope, AnimateFunction] {
  const scopeRef = useRef<HTMLDivElement>(null);
  const animateFnRef = useRef<AnimateFunction | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    import('framer-motion').then((mod) => {
      // Store the animate function for later use
      const { animate } = mod;

      animateFnRef.current = async (
        selector: string,
        keyframes: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        if (scopeRef.current) {
          const element = scopeRef.current.querySelector(selector);

          if (element) {
            await animate(element, keyframes, options);
          }
        }
      };
      forceUpdate((n) => n + 1);
    });
  }, []);

  const animateFn: AnimateFunction = useCallback(async (selector, keyframes, options) => {
    if (animateFnRef.current) {
      await animateFnRef.current(selector, keyframes, options);
    }
  }, []);

  return [scopeRef, animateFn];
}

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
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll } from '~/lib/hooks';
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
import { sharedMessageParser } from '~/lib/hooks/useMessageParser';
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

/*
 * ============================================================================
 * FETCH WITH RETRY & EXPONENTIAL BACKOFF
 * ============================================================================
 */

/**
 * Retry configuration for fetch requests
 */
interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryOn5xx?: boolean;
  retryOn429?: boolean;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryOn5xx: true,
  retryOn429: true,
};

/**
 * Fetch with automatic retry and exponential backoff.
 * Handles server errors (5xx) and rate limiting (429).
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param retryConfig - Retry configuration
 * @returns Response from the fetch
 * @throws Error if all retries are exhausted
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryConfig: RetryConfig = {},
): Promise<Response> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Handle 5xx server errors with retry
      if (config.retryOn5xx && response.status >= 500 && attempt < config.maxRetries - 1) {
        const delay = Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs);
        logger.warn(`Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Handle 429 rate limiting with Retry-After header
      if (config.retryOn429 && response.status === 429 && attempt < config.maxRetries - 1) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, config.maxDelayMs)
          : Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs);

        logger.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Success or non-retryable error
      return response;
    } catch (error) {
      // Network errors - retry with backoff
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < config.maxRetries - 1) {
        const delay = Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs);
        logger.warn(`Fetch error: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

// Image compression settings
const MAX_IMAGE_DIMENSION = 1920; // Max width/height in pixels
const COMPRESSION_QUALITY = 0.8; // 0-1, only for JPEG/WebP

// Seuil pour utiliser le worker (500KB) - en dessous, main thread est plus rapide
const WORKER_COMPRESSION_THRESHOLD = 500 * 1024;

// Worker singleton pour la compression d'images avec idle timeout
let compressionWorker: Worker | null = null;
let workerIdCounter = 0;
let workerIdleTimeout: ReturnType<typeof setTimeout> | null = null;

// Terminate worker after 30s of inactivity to free resources
const WORKER_IDLE_TIMEOUT_MS = 30_000;

/**
 * Terminate the compression worker and cleanup resources.
 * Call this on component unmount or when cleaning up.
 */
const terminateCompressionWorker = (): void => {
  if (workerIdleTimeout) {
    clearTimeout(workerIdleTimeout);
    workerIdleTimeout = null;
  }

  if (compressionWorker) {
    compressionWorker.terminate();
    compressionWorker = null;
    logger.debug('Compression worker terminated');
  }
};

/**
 * Schedule worker termination after idle timeout.
 * Resets the timer on each call.
 */
const scheduleWorkerTermination = (): void => {
  // Clear existing timeout
  if (workerIdleTimeout) {
    clearTimeout(workerIdleTimeout);
  }

  // Schedule new termination
  workerIdleTimeout = setTimeout(() => {
    if (compressionWorker) {
      compressionWorker.terminate();
      compressionWorker = null;
      workerIdleTimeout = null;
      logger.debug('Compression worker terminated due to inactivity');
    }
  }, WORKER_IDLE_TIMEOUT_MS);
};

/**
 * Obtient ou crée le worker de compression d'images.
 * OPTIMIZED: Schedules automatic termination after idle timeout.
 */
const getCompressionWorker = (): Worker => {
  // Reset idle timeout on each access
  scheduleWorkerTermination();

  if (!compressionWorker) {
    compressionWorker = new Worker(new URL('../../workers/image-compression.worker.ts', import.meta.url), {
      type: 'module',
    });
    logger.debug('Compression worker created');
  }

  return compressionWorker;
};

/**
 * Compresse une image volumineuse via Web Worker (>500KB)
 * Évite de bloquer le thread principal pour les grandes images
 */
const compressImageWithWorker = async (file: File): Promise<File> => {
  try {
    // Créer un ImageBitmap pour le transfert au worker
    const imageBitmap = await createImageBitmap(file);

    return new Promise((resolve) => {
      const worker = getCompressionWorker();
      const requestId = `compress-${++workerIdCounter}`;

      const handleMessage = (event: MessageEvent) => {
        const response = event.data;

        if (response.id !== requestId) {
          return;
        }

        worker.removeEventListener('message', handleMessage);

        if (response.type === 'success' && response.result) {
          const { blob, wasCompressed, mimeType } = response.result;

          if (wasCompressed) {
            const compressedFile = new File([blob], file.name, {
              type: mimeType,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        } else {
          // En cas d'erreur, retourner le fichier original
          logger.warn('Worker compression failed:', response.error);
          resolve(file);
        }
      };

      worker.addEventListener('message', handleMessage);

      // Envoyer l'image au worker (transfert de l'ImageBitmap)
      worker.postMessage(
        {
          id: requestId,
          type: 'compress',
          payload: {
            imageData: imageBitmap,
            fileName: file.name,
            mimeType: file.type,
            originalSize: file.size,
          },
        },
        [imageBitmap], // Transférer l'ImageBitmap (pas de copie)
      );
    });
  } catch (error) {
    logger.warn('Failed to use worker for compression:', error);
    return file;
  }
};

/**
 * Compresse une image sur le main thread (pour petites images <500KB)
 * Plus rapide que le worker pour les petites images (pas d'overhead)
 */
const compressImageMainThread = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
          height = MAX_IMAGE_DIMENSION;
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(file); // Fallback to original
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with compression
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = outputType === 'image/png' ? undefined : COMPRESSION_QUALITY;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          // Only use compressed version if it's smaller
          if (blob.size < file.size) {
            const compressedFile = new File([blob], file.name, {
              type: outputType,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        outputType,
        quality,
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Compresses an image file.
 * - Returns original file for GIFs (to preserve animation)
 * - Uses Web Worker for large images (>500KB) to avoid blocking UI
 * - Uses main thread for small images (faster, no worker overhead)
 */
const compressImage = async (file: File): Promise<File> => {
  // Don't compress GIFs (would break animation)
  if (file.type === 'image/gif') {
    return file;
  }

  // Use worker for large images, main thread for small ones
  if (file.size > WORKER_COMPRESSION_THRESHOLD) {
    return compressImageWithWorker(file);
  }

  return compressImageMainThread(file);
};

// converts file to base64 data URL
const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

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

  // Edit message state
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');

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
            context: { continuationContext },
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
                    setCurrentAgent(parsed.agent);
                    updateAgentStatus(parsed.agent, parsed.status);
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

  /*
   * ============================================================================
   * MESSAGE EDITING - Edit and resend from a specific point
   * ============================================================================
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

  const handleCancelEdit = useCallback(() => {
    setEditingMessageIndex(null);
    setEditingMessageContent('');
  }, []);

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
      await sendMessage(fakeEvent, newContent);
    },
    [messages, sendMessage],
  );

  const handleDeleteMessage = useCallback(
    (index: number) => {
      // Delete message and all following messages
      const truncatedMessages = messages.slice(0, index);
      setMessages(truncatedMessages);
      storeMessageHistory(truncatedMessages).catch((error) => toast.error(error.message));
      toast.success('Message supprimé');
    },
    [messages, storeMessageHistory],
  );

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
      await sendMessage(fakeEvent, content);
    },
    [messages, sendMessage],
  );

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
        onEditMessage={handleEditMessage}
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
