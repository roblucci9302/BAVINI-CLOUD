import { useRef, useCallback, useEffect } from 'react';

export function useSnapScroll() {
  const autoScrollRef = useRef(true);
  const scrollNodeRef = useRef<HTMLDivElement | undefined>(undefined);
  const messageNodeRef = useRef<HTMLDivElement | undefined>(undefined);
  const onScrollRef = useRef<(() => void) | undefined>(undefined);
  const observerRef = useRef<ResizeObserver | undefined>(undefined);
  const mutationObserverRef = useRef<MutationObserver | undefined>(undefined);
  const lastScrollHeightRef = useRef(0);

  // Force scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (autoScrollRef.current && scrollNodeRef.current) {
      const { scrollHeight, clientHeight } = scrollNodeRef.current;
      const scrollTarget = scrollHeight - clientHeight;

      scrollNodeRef.current.scrollTo({
        top: scrollTarget,
      });
    }
  }, []);

  const messageRef = useCallback(
    (node: HTMLDivElement | null) => {
      messageNodeRef.current = node ?? undefined;

      if (node) {
        let rafId: number | null = null;

        // ResizeObserver for size changes
        const resizeObserver = new ResizeObserver(() => {
          if (rafId) {
            cancelAnimationFrame(rafId);
          }

          rafId = requestAnimationFrame(() => {
            scrollToBottom();
          });
        });

        resizeObserver.observe(node);
        observerRef.current = resizeObserver;

        // MutationObserver for DOM changes (new messages, text updates)
        const mutationObserver = new MutationObserver(() => {
          if (scrollNodeRef.current) {
            const newScrollHeight = scrollNodeRef.current.scrollHeight;

            // Only scroll if content actually grew
            if (newScrollHeight > lastScrollHeightRef.current) {
              lastScrollHeightRef.current = newScrollHeight;
              scrollToBottom();
            }
          }
        });

        mutationObserver.observe(node, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        mutationObserverRef.current = mutationObserver;
      } else {
        observerRef.current?.disconnect();
        observerRef.current = undefined;
        mutationObserverRef.current?.disconnect();
        mutationObserverRef.current = undefined;
      }
    },
    [scrollToBottom],
  );

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      lastScrollHeightRef.current = node.scrollHeight;

      onScrollRef.current = () => {
        const { scrollTop, scrollHeight, clientHeight } = node;
        const scrollTarget = scrollHeight - clientHeight;

        // More tolerant threshold (50px instead of 10px)
        autoScrollRef.current = Math.abs(scrollTop - scrollTarget) <= 50;
      };

      node.addEventListener('scroll', onScrollRef.current);

      scrollNodeRef.current = node;
    } else {
      if (onScrollRef.current) {
        scrollNodeRef.current?.removeEventListener('scroll', onScrollRef.current);
      }

      scrollNodeRef.current = undefined;
      onScrollRef.current = undefined;
    }
  }, []);

  return [messageRef, scrollRef];
}
