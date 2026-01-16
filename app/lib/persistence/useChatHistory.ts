import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { atom } from 'nanostores';
import type { Message } from '~/types/message';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { getMessages, getNextId, getUrlId, openDatabase, setMessages, type Database } from './db';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatHistory');

// Debounce delay for message history saves (10 seconds)
const MESSAGE_SAVE_DEBOUNCE_MS = 10_000;

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

// Database instance - initialized lazily, not at module load
let dbInstance: Database | undefined;
let dbInitScheduled = false;

/*
 * Singleton lock pour éviter les race conditions
 * Une seule Promise d'initialisation peut exister à la fois
 */
let initializationLock: Promise<Database | undefined> | null = null;

// Timeouts optimisés (réduits pour une meilleure UX)
const DB_INIT_TIMEOUT_MS = 15_000; // 15s au lieu de 30s
const DB_INIT_TIMEOUT_FAST_MS = 8_000; // 8s pour les cas urgents (session existante)

/**
 * Schedule database initialization during idle time
 * This prevents blocking the initial render
 */
function scheduleDatabaseInit(): void {
  if (dbInitScheduled || initializationLock || !persistenceEnabled) {
    return;
  }

  dbInitScheduled = true;

  // Use requestIdleCallback if available, otherwise setTimeout
  const scheduleInit =
    typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 50);

  scheduleInit(() => {
    // Start init in background - don't await
    initDatabaseInternal(DB_INIT_TIMEOUT_MS).catch(() => {
      // Errors handled internally
    });
  });
}

/**
 * Force immediate database initialization (without waiting for idle)
 * À utiliser quand on a besoin de la DB rapidement (ex: chargement d'une session)
 *
 * Note: No longer truly "forces" - still allows yielding to prevent UI freeze.
 * The initialization will complete as soon as possible while keeping UI responsive.
 */
export function forceInitDatabase(): Promise<Database | undefined> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (!persistenceEnabled) {
    return Promise.resolve(undefined);
  }

  dbInitScheduled = true;

  // Start initialization with shorter timeout, but still async/yielding
  return initDatabaseInternal(DB_INIT_TIMEOUT_FAST_MS);
}

/**
 * Internal database initialization with configurable timeout
 * Uses a singleton lock pattern to prevent race conditions
 */
async function initDatabaseInternal(timeoutMs: number = DB_INIT_TIMEOUT_MS): Promise<Database | undefined> {
  // Return cached instance immediately if available
  if (dbInstance) {
    return dbInstance;
  }

  // If initialization is already in progress, wait for it
  if (initializationLock) {
    return initializationLock;
  }

  // Create the initialization lock - this is the single source of truth
  initializationLock = (async () => {
    try {
      // Double-check dbInstance inside the lock (could have been set by another caller)
      if (dbInstance) {
        return dbInstance;
      }

      // Start initialization with timeout
      const initPromise = openDatabase();
      let timeoutTriggered = false;

      const timeoutPromise = new Promise<undefined>((resolve) => {
        setTimeout(() => {
          if (!dbInstance) {
            timeoutTriggered = true;
            logger.warn(`Database initialization timed out after ${timeoutMs}ms`);
            resolve(undefined);
          }
        }, timeoutMs);
      });

      const db = await Promise.race([initPromise, timeoutPromise]);
      dbInstance = db;

      // Handle late completion after timeout - with proper error handling
      if (timeoutTriggered) {
        initPromise
          .then((lateDb) => {
            if (lateDb && !dbInstance) {
              dbInstance = lateDb;
              logger.info('Database initialized (after timeout) - now available');
            }
          })
          .catch((error) => {
            logger.warn('Database initialization failed after timeout:', error);
          });
      }

      return db;
    } catch (error) {
      logger.error('Database initialization failed:', error);
      return undefined;
    } finally {
      /*
       * Clear the lock after completion (success or failure)
       * This allows retry on next call if needed
       */
      initializationLock = null;
    }
  })();

  return initializationLock;
}

/**
 * Lazy database initialization with timeout
 * Returns the database instance or undefined if init fails/times out
 */
export async function getDatabase(): Promise<Database | undefined> {
  // Return cached instance if available
  if (dbInstance) {
    return dbInstance;
  }

  if (!persistenceEnabled) {
    return undefined;
  }

  // If not yet scheduled, schedule for idle time
  if (!dbInitScheduled) {
    scheduleDatabaseInit();
  }

  // Wait for initialization if already in progress
  return initDatabaseInternal();
}

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(!!mixedId);
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const dbRef = useRef<Database | undefined>(undefined);

  // Debounce refs for message history saves
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessagesRef = useRef<Message[] | null>(null);
  const isSavingRef = useRef<boolean>(false);

  /*
   * Schedule database init on mount (non-blocking) - seulement si pas de mixedId
   * Si mixedId existe, on utilise forceInitDatabase dans l'effet suivant
   */
  useEffect(() => {
    if (!mixedId) {
      scheduleDatabaseInit();
    }
  }, [mixedId]);

  // Initialize database lazily - non-blocking for UI
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;

    // Retries optimisés : moins de retries, délais plus courts
    const maxRetries = 3;
    const retryDelays = [100, 250, 500]; // Délais courts pour une meilleure UX

    async function loadMessages() {
      try {
        logger.debug(`Loading messages for ${mixedId}, attempt ${retryCount + 1}/${maxRetries + 1}`);

        /*
         * Utiliser forceInitDatabase si on a un mixedId (besoin urgent de la DB)
         * Sinon utiliser getDatabase (init lazy)
         */
        const db = mixedId ? await forceInitDatabase() : await getDatabase();

        if (cancelled) {
          return;
        }

        dbRef.current = db;
        setDbReady(true);

        if (!db) {
          // Database not available - retry if we haven't exhausted retries
          if (retryCount < maxRetries) {
            retryCount++;

            const delay = retryDelays[retryCount - 1] || 500;
            logger.debug(`Database not ready, retrying in ${delay}ms (${retryCount}/${maxRetries})...`);
            await new Promise((resolve) => setTimeout(resolve, delay));

            if (!cancelled) {
              loadMessages();
            }

            return;
          }

          // Database really not available after all retries
          setMessagesLoading(false);

          if (persistenceEnabled) {
            toast.error(`La sauvegarde des conversations n'est pas disponible. Rechargez la page pour réessayer.`);
          }

          return;
        }

        // If we have a chat ID in URL, load messages
        if (mixedId) {
          const storedMessages = await getMessages(db, mixedId);

          if (cancelled) {
            return;
          }

          if (storedMessages && storedMessages.messages.length > 0) {
            logger.debug(`Found ${storedMessages.messages.length} messages for ${mixedId}`);
            setInitialMessages(storedMessages.messages);
            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            setMessagesLoading(false);
          } else {
            // Retry a few times before giving up - DB might still be syncing
            if (retryCount < maxRetries) {
              retryCount++;

              const delay = retryDelays[retryCount - 1] || 500;
              logger.debug(
                `Messages not found for ${mixedId}, retrying in ${delay}ms (${retryCount}/${maxRetries})...`,
              );
              await new Promise((resolve) => setTimeout(resolve, delay));

              if (!cancelled) {
                loadMessages();
              }

              return;
            }

            // After all retries, redirect only if this seems like an invalid chat
            logger.warn(`Chat ${mixedId} not found after ${maxRetries} retries, redirecting to home`);
            setMessagesLoading(false);
            navigate(`/`, { replace: true });
          }
        } else {
          setMessagesLoading(false);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        logger.error('Failed to load messages:', error);

        // On error, retry before giving up
        if (retryCount < maxRetries) {
          retryCount++;

          const delay = retryDelays[retryCount - 1] || 500;
          logger.info(`Error loading messages, retrying in ${delay}ms (${retryCount}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, delay));

          if (!cancelled) {
            loadMessages();
          }
        } else {
          // After all retries, don't redirect on error - let user stay on page
          setMessagesLoading(false);
          toast.error('Erreur lors du chargement de la conversation');
        }
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [mixedId, navigate]);

  // Internal function to perform the actual save
  const performSave = useCallback(
    async (messages: Message[]) => {
      const db = dbRef.current;

      if (!db || messages.length === 0) {
        return;
      }

      isSavingRef.current = true;

      try {
        const { firstArtifact } = workbenchStore;

        // Use local variable to track current urlId value (state update is async)
        let currentUrlId = urlId;

        if (!currentUrlId && firstArtifact?.id) {
          const newUrlId = await getUrlId(db, firstArtifact.id);

          navigateChat(newUrlId);
          setUrlId(newUrlId);
          currentUrlId = newUrlId; // Update local variable immediately
        }

        if (!description.get() && firstArtifact?.title) {
          description.set(firstArtifact?.title);
        }

        if (initialMessages.length === 0 && !chatId.get()) {
          const nextId = await getNextId(db);

          chatId.set(nextId);

          if (!currentUrlId) {
            navigateChat(nextId);
          }
        }

        // Pass the current urlId value, not the stale state variable
        await setMessages(db, chatId.get() as string, messages, currentUrlId, description.get());
      } finally {
        isSavingRef.current = false;
        pendingMessagesRef.current = null;
      }
    },
    [urlId, initialMessages.length],
  );

  // Debounced store function - batches saves to reduce DB writes
  const storeMessageHistory = useCallback(
    async (messages: Message[]) => {
      // Store pending messages
      pendingMessagesRef.current = messages;

      // Clear existing timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // If this is the first message or a new chat, save immediately
      if (initialMessages.length === 0 && messages.length <= 2) {
        await performSave(messages);
        return;
      }

      // Otherwise debounce the save
      saveTimerRef.current = setTimeout(async () => {
        const messagesToSave = pendingMessagesRef.current;

        if (messagesToSave && !isSavingRef.current) {
          await performSave(messagesToSave);
        }
      }, MESSAGE_SAVE_DEBOUNCE_MS);
    },
    [initialMessages.length, performSave],
  );

  // Cleanup timer on unmount and save pending messages
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Save any pending messages on unmount (don't lose data)
      const pendingMessages = pendingMessagesRef.current;

      if (pendingMessages && !isSavingRef.current) {
        // Fire and forget - component is unmounting
        performSave(pendingMessages).catch(() => {
          // Ignore errors on unmount
        });
      }
    };
  }, [performSave]);

  return {
    // Always ready immediately - don't block UI
    ready: true,

    // Expose loading state for messages
    messagesLoading,
    initialMessages,
    dbReady,
    storeMessageHistory,
  };
}

function navigateChat(nextId: string) {
  /*
   * note: we use replaceState instead of Remix navigate() because navigate()
   * causes a rerender of <Chat /> that resets the streaming state.
   * this is the intended behavior - not a bug to fix.
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
