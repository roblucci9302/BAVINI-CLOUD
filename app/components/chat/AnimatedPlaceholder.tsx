'use client';

import { useEffect, useState } from 'react';

interface AnimatedPlaceholderProps {
  chatStarted: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function AnimatedPlaceholder({ chatStarted, textareaRef }: AnimatedPlaceholderProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const textarea = textareaRef?.current;

    if (!textarea) {
      return;
    }

    const check = () => setHidden(textarea.value.length > 0);
    check();

    textarea.addEventListener('input', check);

    return () => textarea.removeEventListener('input', check);
  }, [textareaRef]);

  if (chatStarted || hidden) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        right: '3.5rem',
        pointerEvents: 'none',
        fontSize: '1rem',
        color: 'var(--bolt-elements-textTertiary)',
      }}
      aria-hidden="true"
    >
      Décrivez votre projet...
    </div>
  );
}
