'use client';

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

/** Delay before focusing textarea after modal opens (ms) */
const FOCUS_DELAY_MS = 50;

/** Maximum height for the textarea (px) */
const TEXTAREA_MAX_HEIGHT_PX = 400;

export interface EditMessageModalProps {
  isOpen: boolean;
  initialContent: string;
  messageIndex: number;
  onSave: (index: number, newContent: string) => void;
  onCancel: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

const transition = {
  duration: 0.2,
  ease: cubicEasingFn,
};

export const EditMessageModal = memo(
  ({ isOpen, initialContent, messageIndex, onSave, onCancel }: EditMessageModalProps) => {
    const [content, setContent] = useState(initialContent);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Reset content when modal opens with new initial content
    useEffect(() => {
      if (isOpen) {
        setContent(initialContent);

        // Focus textarea after a small delay to ensure it's rendered
        setTimeout(() => {
          textareaRef.current?.focus();
          textareaRef.current?.select();
        }, FOCUS_DELAY_MS);
      }
    }, [isOpen, initialContent]);

    // Auto-resize textarea
    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
      }
    }, [content]);

    const handleSave = useCallback(() => {
      const trimmedContent = content.trim();

      if (trimmedContent.length === 0) {
        return;
      }

      onSave(messageIndex, trimmedContent);
    }, [content, messageIndex, onSave]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        // Cmd/Ctrl + Enter to save
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleSave();
        }

        // Escape to cancel
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      },
      [handleSave, onCancel],
    );

    const hasChanges = content.trim() !== initialContent.trim();
    const isEmpty = content.trim().length === 0;

    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              variants={overlayVariants}
              transition={transition}
              onClick={onCancel}
            />

            {/* Modal */}
            <motion.div
              className={classNames(
                'relative w-full max-w-2xl',
                'bg-bolt-elements-background-depth-1',
                'border border-bolt-elements-borderColor',
                'rounded-xl shadow-2xl',
                'overflow-hidden',
              )}
              variants={modalVariants}
              transition={transition}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-bolt-elements-borderColor">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent-500/10">
                    <div className="i-ph:pencil-simple text-lg text-accent-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-bolt-elements-textPrimary">Modifier le message</h3>
                    <p className="text-xs text-bolt-elements-textTertiary mt-0.5">
                      La conversation reprendra depuis ce point
                    </p>
                  </div>
                </div>
                <button
                  onClick={onCancel}
                  className="p-2 rounded-lg hover:bg-bolt-elements-background-depth-3 transition-colors"
                  aria-label="Fermer"
                >
                  <div className="i-ph:x text-bolt-elements-textSecondary" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={classNames(
                    'w-full min-h-[120px] max-h-[400px] resize-none',
                    'px-4 py-3 rounded-lg',
                    'bg-bolt-elements-background-depth-2',
                    'border border-bolt-elements-borderColor',
                    'text-bolt-elements-textPrimary text-sm',
                    'placeholder-bolt-elements-textTertiary',
                    'focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20',
                    'transition-all duration-200',
                  )}
                  placeholder="Entrez votre message..."
                />
                <p className="mt-2 text-xs text-bolt-elements-textTertiary">
                  <span className="opacity-60">Astuce:</span>{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                    Cmd+Enter
                  </kbd>{' '}
                  pour sauvegarder,{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                    Échap
                  </kbd>{' '}
                  pour annuler
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                <button
                  onClick={onCancel}
                  className={classNames(
                    'px-4 py-2 rounded-lg text-sm font-medium',
                    'text-bolt-elements-textSecondary',
                    'hover:bg-bolt-elements-background-depth-3',
                    'transition-colors duration-150',
                  )}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  disabled={isEmpty || !hasChanges}
                  className={classNames(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                    'bg-accent-500 text-white',
                    'hover:bg-accent-600',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-all duration-150',
                    'active:scale-[0.98]',
                  )}
                >
                  <div className="i-ph:check-bold text-sm" />
                  Sauvegarder et renvoyer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

EditMessageModal.displayName = 'EditMessageModal';
