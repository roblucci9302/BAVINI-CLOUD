'use client';

import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { SettingsModal } from '~/components/settings';
import { openSettingsModal, connectorsStore } from '~/lib/stores/connectors';
import { getDatabase, deleteById, getAll, chatId, type ChatHistoryItem } from '~/lib/persistence';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-150px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent = { type: 'delete'; item: ChatHistoryItem } | null;

export function Menu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const connectors = useStore(connectorsStore);
  const isGitHubConnected = connectors.github?.isConnected ?? false;

  const loadEntries = useCallback(async () => {
    const db = await getDatabase();

    if (db) {
      getAll(db)
        .then((list) => list.filter((item) => item.urlId && item.description))
        .then(setList)
        .catch((error) => toast.error(error.message));
    }
  }, []);

  const deleteItem = useCallback(
    async (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();

      const db = await getDatabase();

      if (db) {
        deleteById(db, item.id)
          .then(() => {
            loadEntries();

            if (chatId.get() === item.id) {
              // hard page navigation to clear the stores
              window.location.pathname = '/';
            }
          })
          .catch((error) => {
            toast.error('Échec de la suppression de la conversation');
            logger.error(error);
          });
      }
    },
    [loadEntries],
  );

  const closeDialog = () => {
    setDialogContent(null);
  };

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open]);

  // Use ref to track state without causing re-renders in the event handler
  const openRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  // Track when menu animation completes (to avoid closing during animation)
  const canCloseRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep openRef in sync with state
  useEffect(() => {
    openRef.current = open;

    // When menu opens, wait for animation to complete before allowing close
    if (open) {
      canCloseRef.current = false;

      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }

      // Wait 250ms (animation duration + buffer) before allowing close checks
      closeTimeoutRef.current = setTimeout(() => {
        canCloseRef.current = true;
      }, 250);
    } else {
      canCloseRef.current = false;
    }

    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [open]);

  useEffect(() => {
    const enterThreshold = 40;
    const exitThreshold = 40;
    const menuWidth = 280; // Fixed menu width from CSS

    function onMouseMove(event: MouseEvent) {
      // Cancel any pending RAF to avoid queuing multiple updates
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      const mouseX = event.pageX;
      const clientX = event.clientX;

      // Use RAF to batch with next frame and avoid layout thrashing
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;

        // Check enter condition - only update if not already open
        if (mouseX < enterThreshold && !openRef.current) {
          openRef.current = true;
          setOpen(true);
          return;
        }

        // Check exit condition - only if menu is open AND animation has completed
        if (openRef.current && canCloseRef.current) {
          // Use fixed menu width instead of getBoundingClientRect during animation
          // Menu is at left: 0 when open, so right edge is at menuWidth
          if (clientX > menuWidth + exitThreshold) {
            openRef.current = false;
            canCloseRef.current = false;
            setOpen(false);
          }
        }
      });
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', onMouseMove);

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return (
    <>
      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        className="flex flex-col side-menu fixed top-0 w-[280px] h-full bg-bolt-elements-background-depth-2 border-r rounded-r-xl border-bolt-elements-borderColor z-sidebar shadow-lg text-sm"
      >
        {/* Header spacer */}
        <div className="h-[var(--header-height)]" />

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Section title with accent bar */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-[#0ea5e9] to-[#38bdf8]" />
            <span className="text-bolt-elements-textPrimary font-medium text-[13px]">Vos conversations</span>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 sidebar-scrollbar">
            {list.length === 0 && (
              <div className="px-2 py-3 text-bolt-elements-textTertiary text-[13px]">
                Aucune conversation précédente
              </div>
            )}
            <DialogRoot open={dialogContent !== null}>
              {binDates(list).map(({ category, items }) => (
                <div key={category} className="mt-3 first:mt-0">
                  <div className="text-bolt-elements-textTertiary text-[11px] font-medium uppercase tracking-wide sticky top-0 z-1 bg-bolt-elements-background-depth-2 px-2 py-1.5">
                    {category}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <HistoryItem key={item.id} item={item} onDelete={() => setDialogContent({ type: 'delete', item })} />
                    ))}
                  </div>
                </div>
              ))}
              <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
                {dialogContent?.type === 'delete' && (
                  <>
                    <DialogTitle>Supprimer la conversation ?</DialogTitle>
                    <DialogDescription asChild>
                      <div>
                        <p>
                          Vous êtes sur le point de supprimer <strong>{dialogContent.item.description}</strong>.
                        </p>
                        <p className="mt-1">Êtes-vous sûr de vouloir supprimer cette conversation ?</p>
                      </div>
                    </DialogDescription>
                    <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-end">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Annuler
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={(event) => {
                          deleteItem(event, dialogContent.item);
                          closeDialog();
                        }}
                      >
                        Supprimer
                      </DialogButton>
                    </div>
                  </>
                )}
              </Dialog>
            </DialogRoot>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-bolt-elements-borderColor px-3 py-3">
            {/* Home button */}
            <a
              href="/"
              className="flex items-center justify-center w-8 h-8 text-bolt-elements-textTertiary hover:text-[#38bdf8] hover:bg-[#0ea5e9]/10 rounded-lg transition-all"
              title="Accueil"
            >
              <span className="i-ph:house text-lg" />
            </a>
            <button
              onClick={() => openSettingsModal('connectors')}
              className="flex items-center gap-2 px-3 py-2 text-bolt-elements-textTertiary hover:text-[#38bdf8] hover:bg-[#0ea5e9]/10 rounded-lg transition-all"
              title="Paramètres"
            >
              <span className="i-ph:gear text-base" />
              <span className="text-[13px]">Paramètres</span>
            </button>
            <AnimatePresence>
              {isGitHubConnected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-green-500/10 rounded-md"
                  title="GitHub connecté"
                >
                  <span className="i-ph:github-logo text-green-400 text-sm" />
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                </motion.div>
              )}
            </AnimatePresence>
            <ThemeSwitch className="ml-auto" />
          </div>
        </div>
      </motion.div>
      <SettingsModal />
    </>
  );
}
