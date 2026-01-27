'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { type ChatHistoryItem, chatId } from '~/lib/persistence';
import { DialogTrigger } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
}

export function HistoryItem({ item, onDelete }: HistoryItemProps) {
  const [hovering, setHovering] = useState(false);
  const hoverRef = useRef<HTMLDivElement>(null);
  const currentChatId = useStore(chatId);
  const isActive = currentChatId === item.id;

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    const element = hoverRef.current;

    if (!element) return;

    function mouseEnter() {
      // Clear any pending hide timeout
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      setHovering(true);
    }

    function mouseLeave() {
      // Small delay to prevent flickering when moving between elements
      timeout = setTimeout(() => {
        setHovering(false);
      }, 100);
    }

    element.addEventListener('mouseenter', mouseEnter);
    element.addEventListener('mouseleave', mouseLeave);

    return () => {
      // Cleanup timeout on unmount
      if (timeout) {
        clearTimeout(timeout);
      }
      element.removeEventListener('mouseenter', mouseEnter);
      element.removeEventListener('mouseleave', mouseLeave);
    };
  }, []);

  return (
    <div
      ref={hoverRef}
      className={classNames(
        'group relative rounded-lg transition-all',
        isActive
          ? 'bg-[#0ea5e9]/10 text-[#38bdf8]'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-[#0ea5e9]/10'
      )}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-[#0ea5e9] to-[#38bdf8]" />
      )}

      <a
        href={`/chat/${item.urlId}`}
        className="flex items-center gap-2.5 w-full px-2.5 py-2 text-[13px]"
      >
        <span
          className={classNames(
            'i-ph:chat-circle text-base flex-shrink-0 transition-opacity',
            isActive ? 'opacity-100 text-[#38bdf8]' : 'opacity-50'
          )}
        />
        <span className="truncate flex-1">{item.description}</span>
      </a>

      {/* Delete button - appears on hover */}
      {hovering && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <DialogTrigger asChild>
            <button
              className="flex items-center justify-center w-6 h-6 rounded-md text-bolt-elements-textTertiary hover:text-bolt-elements-item-contentDanger hover:bg-bolt-elements-item-backgroundDanger transition-all"
              title="Supprimer la conversation"
              aria-label="Supprimer la conversation"
              onClick={(event) => {
                event.preventDefault();
                onDelete?.(event);
              }}
            >
              <span className="i-ph:trash text-sm" />
            </button>
          </DialogTrigger>
        </div>
      )}
    </div>
  );
}
