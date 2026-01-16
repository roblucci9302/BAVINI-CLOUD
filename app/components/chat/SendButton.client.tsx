'use client';

import { cubicBezier, motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

interface SendButtonProps {
  hasContent: boolean;
  isStreaming?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export function SendButton({ hasContent, isStreaming, onClick }: SendButtonProps) {
  const isDisabled = !hasContent && !isStreaming;

  return (
    <motion.button
      className={classNames(
        'flex justify-center items-center w-9 h-9 rounded-full transition-all duration-200',
        isStreaming
          ? 'bg-red-500 hover:bg-red-600 text-white shadow-md'
          : hasContent
            ? 'bg-accent-500 hover:bg-accent-600 hover:-translate-y-0.5 text-white shadow-md'
            : 'bg-bolt-elements-button-secondary-background text-bolt-elements-textTertiary cursor-not-allowed',
      )}
      transition={{ ease: customEasingFn, duration: 0.17 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={(event) => {
        event.preventDefault();

        if (!isDisabled) {
          onClick?.(event);
        }
      }}
      disabled={isDisabled}
      title={isStreaming ? 'Arrêter' : hasContent ? 'Envoyer' : 'Écrivez un message'}
    >
      {!isStreaming ? (
        <div className="i-ph:arrow-up-bold text-lg"></div>
      ) : (
        <div className="i-ph:stop-fill text-lg"></div>
      )}
    </motion.button>
  );
}
