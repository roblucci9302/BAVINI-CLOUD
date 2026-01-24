'use client';

import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { previewErrorStore, type PreviewInfo } from '~/lib/stores/previews';
import { isShellRunning } from '~/lib/runtime/action-runner';
import { PortDropdown } from './PortDropdown';
import { DeviceSelector } from './DeviceSelector';
import { DeviceFrame } from './DeviceFrame';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Preview');

export const Preview = memo(() => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const portDropdownRef = useRef<HTMLDivElement>(null);
  // FIX: Track RAF for cancellation to prevent multiple queued frames
  const reloadRafRef = useRef<number | null>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSelectedPreview, setHasSelectedPreview] = useState(false);
  // Track whether an input in the iframe is focused (for keyboard forwarding)
  const [iframeInputFocused, setIframeInputFocused] = useState(false);
  const previews = useStore(workbenchStore.previews);

  // FIX: Validate activePreviewIndex when previews array changes
  // This prevents out-of-bounds access if a preview is removed
  useEffect(() => {
    if (previews.length === 0) {
      // No previews, reset to 0
      if (activePreviewIndex !== 0) {
        setActivePreviewIndex(0);
      }
    } else if (activePreviewIndex >= previews.length) {
      // Index out of bounds, switch to last available preview
      setActivePreviewIndex(previews.length - 1);
    }
  }, [previews.length, activePreviewIndex]);

  const activePreview = previews[activePreviewIndex];

  // Note: selectedDeviceId is now handled internally by DeviceFrame
  const shellRunning = useStore(isShellRunning);
  const previewError = useStore(previewErrorStore);

  // Log preview updates for debugging
  useEffect(() => {
    logger.info(`Previews updated: ${previews.length} previews, active: ${activePreviewIndex}`);

    if (activePreview) {
      logger.info(
        `Active preview: port ${activePreview.port}, ready: ${activePreview.ready}, url: ${activePreview.baseUrl}`,
      );
    }
  }, [previews, activePreviewIndex, activePreview]);

  const [url, setUrl] = useState('');
  const [iframeUrl, setIframeUrl] = useState<string | undefined>();
  const [iframeSrcdoc, setIframeSrcdoc] = useState<string | undefined>();

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenContainerRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // FIX: Cleanup RAF on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (reloadRafRef.current !== null) {
        cancelAnimationFrame(reloadRafRef.current);
      }
    };
  }, []);

  /**
   * KEYBOARD FIX: Focus the iframe contentWindow when user clicks inside the iframe.
   * We detect this by listening for the window blur event - when the parent window
   * loses focus, it's usually because the user clicked inside the iframe.
   * We then focus the contentWindow to route keyboard events to the iframe.
   */
  useEffect(() => {
    const handleWindowBlur = () => {
      // When window loses focus and we have an iframe, focus its contentWindow
      // This ensures keyboard events are routed to the iframe content
      if (iframeRef.current?.contentWindow && (iframeUrl || iframeSrcdoc)) {
        logger.info('[Preview] Window blur detected, focusing iframe contentWindow');
        // Small delay to ensure the iframe has received the click
        setTimeout(() => {
          iframeRef.current?.contentWindow?.focus();
        }, 0);
      }
    };

    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [iframeUrl, iframeSrcdoc]);

  /**
   * KEYBOARD EVENT FORWARDING for srcdoc mode.
   * When an input inside the iframe is focused (detected via postMessage),
   * we capture keyboard events on the parent document and forward them to the iframe.
   * This works around the issue where srcdoc iframes don't receive keyboard events properly.
   */
  useEffect(() => {
    if (!iframeInputFocused || !iframeSrcdoc) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't forward if typing in parent inputs (like URL bar)
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Forward the event to the iframe
      if (iframeRef.current?.contentWindow) {
        logger.debug('[Preview] Forwarding keydown to iframe:', event.key);
        iframeRef.current.contentWindow.postMessage({
          type: 'bavini-keyboard-event',
          payload: {
            eventType: 'keydown',
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
          }
        }, '*');

        // Prevent default for most keys so they don't trigger browser shortcuts
        // but allow some like Tab, Escape for accessibility
        if (!['Tab', 'Escape', 'F5', 'F11', 'F12'].includes(event.key)) {
          event.preventDefault();
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: 'bavini-keyboard-event',
          payload: {
            eventType: 'keyup',
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
          }
        }, '*');
      }
    };

    logger.info('[Preview] Keyboard forwarding ENABLED for iframe input');
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);

    return () => {
      logger.info('[Preview] Keyboard forwarding DISABLED');
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [iframeInputFocused, iframeSrcdoc]);

  // Close port dropdown when clicking outside
  // This replaces the overlay approach which was blocking iframe interactions
  useEffect(() => {
    if (!isPortDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (portDropdownRef.current && !portDropdownRef.current.contains(event.target as Node)) {
        setIsPortDropdownOpen(false);
      }
    };

    // Use capture phase to catch clicks before they reach other handlers
    document.addEventListener('click', handleClickOutside, true);

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isPortDropdownOpen]);

  /**
   * Listen for postMessage from the preview iframe.
   * Handles console logs, errors, and other messages from the preview.
   * CRITICAL: Always cleanup listener on unmount to prevent memory leaks.
   *
   * Origin handling:
   * - Service Worker mode: same origin as parent (preferred)
   * - Blob URL fallback: 'null' origin
   * - srcdoc with allow-same-origin: same origin as parent OR empty origin
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // SECURITY: Validate origin strictly
      // Accept: same origin, 'null' (Blob URL), blob: prefix, or verified iframe source
      const isSameOrigin = event.origin === window.location.origin;
      const isBlobOrigin = event.origin === 'null' || event.origin.startsWith('blob:');
      // FIX: Removed `event.origin === ''` check - too permissive and can be spoofed
      // Only accept messages from our actual iframe contentWindow
      const isFromOurIframe = event.source === iframeRef.current?.contentWindow;

      if (!isSameOrigin && !isBlobOrigin && !isFromOurIframe) {
        return;
      }

      // Validate message structure
      if (!event.data || typeof event.data !== 'object') {
        return;
      }

      const { type, payload } = event.data;

      switch (type) {
        case 'bavini-focus-request':
          // Iframe content is requesting keyboard focus routing
          // Focus the contentWindow so keyboard events route to the iframe
          if (iframeRef.current?.contentWindow) {
            logger.debug('[Preview] Focus request received, focusing contentWindow');
            iframeRef.current.contentWindow.focus();
          }
          break;

        case 'bavini-input-focused':
          // An input/textarea in the iframe is now focused
          // Enable keyboard event forwarding
          logger.info('[Preview] Iframe input focused, enabling keyboard forwarding');
          setIframeInputFocused(true);
          break;

        case 'bavini-input-blurred':
          // The input in the iframe was blurred
          // Disable keyboard event forwarding
          logger.info('[Preview] Iframe input blurred, disabling keyboard forwarding');
          setIframeInputFocused(false);
          break;

        case 'console':
          // Log console messages from preview
          if (payload?.type === 'error') {
            logger.error('[Preview Console]', ...(payload.args || []));
          } else if (payload?.type === 'warn') {
            logger.warn('[Preview Console]', ...(payload.args || []));
          } else {
            logger.debug('[Preview Console]', ...(payload.args || []));
          }
          break;

        case 'error':
          // Handle runtime errors from preview
          logger.error('[Preview Error]', payload?.message, payload?.stack);
          break;

        case 'ready':
          // Preview is ready (optional - for custom signaling)
          logger.info('[Preview] Ready signal received');
          break;

        default:
          // Unknown message type - log for debugging
          logger.debug('[Preview Message]', type, payload);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const enterFullscreen = useCallback(() => {
    if (fullscreenContainerRef.current) {
      fullscreenContainerRef.current.requestFullscreen().catch((err) => {
        logger.error('Erreur plein écran:', err);
        toast.error('Impossible de passer en plein écran');
      });
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => {
        logger.error('Erreur sortie plein écran:', err);
        toast.error('Impossible de quitter le plein écran');
      });
    }
  }, []);

  const openInNewTab = useCallback(() => {
    if (iframeUrl) {
      window.open(iframeUrl, '_blank', 'noopener,noreferrer');
    } else if (iframeSrcdoc) {
      // For srcdoc mode, create a temporary blob URL to open in new tab
      const blob = new Blob([iframeSrcdoc], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      // FIX: Increased timeout from 1s to 5s to handle slow network conditions
      // The blob URL needs to remain valid until the new tab finishes loading
      // With noopener, we can't detect when loading completes, so we use a safe delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  }, [iframeUrl, iframeSrcdoc]);

  // FIX: Maximum srcdoc size to prevent browser freezing (50MB)
  const MAX_SRCDOC_SIZE = 50 * 1024 * 1024;

  useEffect(() => {
    if (!activePreview) {
      logger.info('No active preview, clearing URL');
      setUrl('');
      setIframeUrl(undefined);
      setIframeSrcdoc(undefined);

      return;
    }

    const { baseUrl, ready, srcdoc } = activePreview;
    logger.info(`Preview effect triggered: baseUrl=${baseUrl}, ready=${ready}, srcdoc=${srcdoc ? 'yes' : 'no'}`);

    // Only set iframe content when preview is ready
    if (ready) {
      // Prefer srcdoc mode (avoids blob URL origin issues with form inputs)
      if (srcdoc) {
        // FIX: Validate srcdoc size to prevent browser freezing
        if (srcdoc.length > MAX_SRCDOC_SIZE) {
          const sizeMB = (srcdoc.length / 1024 / 1024).toFixed(2);
          logger.error(`srcdoc content too large: ${sizeMB}MB (max: 50MB)`);
          toast.error(`Le contenu est trop volumineux (${sizeMB}MB). Maximum: 50MB`);
          return;
        }

        logger.info('Using srcdoc mode for preview (recommended)');
        setUrl('about:srcdoc');
        setIframeSrcdoc(srcdoc);
        setIframeUrl(undefined); // Clear URL when using srcdoc
      } else if (baseUrl) {
        logger.info(`Setting iframe URL to: ${baseUrl}`);
        setUrl(baseUrl);
        setIframeUrl(baseUrl);
        setIframeSrcdoc(undefined); // Clear srcdoc when using URL
      }
    }
  }, [activePreview?.baseUrl, activePreview?.ready, activePreview?.srcdoc]);

  const validateUrl = useCallback(
    (value: string) => {
      if (!activePreview) {
        return false;
      }

      const { baseUrl } = activePreview;

      if (value === baseUrl) {
        return true;
      } else if (value.startsWith(baseUrl)) {
        return ['/', '?', '#'].includes(value.charAt(baseUrl.length));
      }

      return false;
    },
    [activePreview],
  );

  const findMinPortIndex = useCallback(
    (minIndex: number, preview: { port: number }, index: number, array: { port: number }[]) => {
      return preview.port < array[minIndex].port ? index : minIndex;
    },
    [],
  );

  // when previews change, display the lowest port if user hasn't selected a preview
  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview) {
      const minPortIndex = previews.reduce(findMinPortIndex, 0);

      setActivePreviewIndex(minPortIndex);
    }
  }, [previews, findMinPortIndex, hasSelectedPreview]);

  const reloadPreview = useCallback(() => {
    if (!iframeRef.current) return;

    // FIX: Cancel any pending RAF to prevent multiple queued frames
    if (reloadRafRef.current !== null) {
      cancelAnimationFrame(reloadRafRef.current);
      reloadRafRef.current = null;
    }

    if (iframeSrcdoc) {
      // For srcdoc mode, use React state (not DOM) for the content
      // This ensures thread-safety with React's async updates
      const contentToReload = iframeSrcdoc;
      iframeRef.current.srcdoc = '';

      // Use requestAnimationFrame to ensure the empty state is applied before reload
      reloadRafRef.current = requestAnimationFrame(() => {
        if (iframeRef.current && contentToReload) {
          iframeRef.current.srcdoc = contentToReload;
        }
        reloadRafRef.current = null;
      });
    } else if (iframeUrl) {
      // For URL mode (Service Worker), reassign src to trigger reload
      iframeRef.current.src = iframeUrl;
    }
  }, [iframeSrcdoc, iframeUrl]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3.5 py-2.5 flex items-center gap-2.5 bg-[var(--bolt-bg-panel,#0f0f11)] border-b border-bolt-elements-borderColor">
        <IconButton icon="i-ph:arrow-clockwise" title="Recharger l'aperçu" onClick={reloadPreview} />
        <IconButton
          icon="i-ph:arrows-out"
          title="Plein écran"
          onClick={enterFullscreen}
          disabled={(!iframeUrl && !iframeSrcdoc) || !activePreview?.ready}
        />
        <IconButton
          icon="i-ph:arrow-square-out"
          title="Ouvrir dans un nouvel onglet"
          onClick={openInNewTab}
          disabled={(!iframeUrl && !iframeSrcdoc) || !activePreview?.ready}
        />
        <div className="flex items-center gap-2.5 flex-grow bg-[var(--bolt-bg-base,#050506)] border border-bolt-elements-borderColor text-bolt-elements-textSecondary rounded-[16px] px-3.5 h-[34px] text-[13px] font-mono transition-all duration-200 focus-within:border-[#0ea5e9] focus-within:text-bolt-elements-textPrimary focus-within:shadow-[0_0_0_2px_rgba(14,165,233,0.15)]">
          <div className="i-ph:globe-simple text-bolt-elements-textMuted text-sm flex-shrink-0" />
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none"
            type="text"
            value={url}
            aria-label="Barre d'adresse de l'aperçu"
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && validateUrl(url)) {
                setIframeUrl(url);

                if (inputRef.current) {
                  inputRef.current.blur();
                }
              }
            }}
          />
        </div>
        {previews.length > 1 && (
          <div ref={portDropdownRef}>
            <PortDropdown
              activePreviewIndex={activePreviewIndex}
              setActivePreviewIndex={setActivePreviewIndex}
              isDropdownOpen={isPortDropdownOpen}
              setHasSelectedPreview={setHasSelectedPreview}
              setIsDropdownOpen={setIsPortDropdownOpen}
              previews={previews}
            />
          </div>
        )}
        {/* Separator */}
        <div className="w-px h-5 bg-bolt-elements-borderColor" />
        {/* Device selector */}
        <DeviceSelector />
      </div>
      <div
        ref={fullscreenContainerRef}
        className="flex-1 overflow-hidden relative bg-bolt-elements-background-depth-1"
      >
        {previewError ? (
          <div className="flex w-full h-full justify-center items-center bg-bolt-elements-background-depth-1">
            <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <div className="i-ph:warning-circle text-3xl text-red-500" />
              </div>
              <div>
                <span className="text-bolt-elements-textPrimary font-medium">Erreur WebContainer</span>
                <p className="text-bolt-elements-textTertiary text-sm mt-2">{previewError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors"
                >
                  Recharger la page
                </button>
              </div>
            </div>
          </div>
        ) : activePreview ? (
          activePreview.ready && (iframeUrl || iframeSrcdoc) ? (

            /*
             * CRITICAL FIX: Always use DeviceFrame wrapper to prevent iframe remounting.
             * DeviceFrame handles desktop vs mobile display internally using CSS only.
             * This prevents the layout thrashing bug that caused screen glitching.
             *
             * PREVIEW MODES:
             * 1. Service Worker mode (iframeUrl like /preview/index.html):
             *    - No sandbox needed - SW provides same-origin URL
             *    - Keyboard events work correctly
             *    - Full browser API access
             *
             * 2. srcdoc mode (fallback):
             *    - Uses sandbox with allow-same-origin for security
             *    - May have keyboard event issues in some browsers
             */
            <DeviceFrame>
              {/* FIX: Separate iframes for src vs srcdoc to avoid attribute conflicts
                * Some browsers have undefined behavior when both src and srcDoc are set
                */}
              {iframeSrcdoc ? (
                <iframe
                  ref={iframeRef}
                  className="border-none w-full h-full bg-white"
                  srcDoc={iframeSrcdoc}
                  title="Aperçu de l'application"
                  // SECURITY NOTE: allow-same-origin + allow-scripts is needed for localStorage
                  // but allows user code to access parent's storage. For true isolation,
                  // use a separate subdomain. See: docs/adr/security-preview-sandbox.md
                  sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads"
                  allow="accelerometer; autoplay; camera; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture; sync-xhr"
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  className="border-none w-full h-full bg-white"
                  src={iframeUrl}
                  title="Aperçu de l'application"
                  // URL mode doesn't need sandbox - natural browser security applies
                  allow="accelerometer; autoplay; camera; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture; sync-xhr"
                />
              )}
            </DeviceFrame>
          ) : (
            <div className="flex w-full h-full justify-center items-center bg-bolt-elements-background-depth-1">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-accent-500/10 flex items-center justify-center">
                    <div className="i-svg-spinners:90-ring-with-bg text-accent-500 text-2xl" />
                  </div>
                </div>
                <div className="text-center">
                  <span className="text-bolt-elements-textPrimary font-medium">
                    {shellRunning ? 'Installation des dépendances...' : 'Démarrage du serveur'}
                  </span>
                  <p className="text-bolt-elements-textTertiary text-sm mt-1">
                    {shellRunning
                      ? 'npm install en cours, cela peut prendre quelques secondes'
                      : "Préparation de l'aperçu..."}
                  </p>
                </div>
              </div>
            </div>
          )
        ) : previews.length > 0 ? (
          /* FIX: Show available previews when activePreview is null but others exist */
          <div className="flex w-full h-full justify-center items-center bg-bolt-elements-background-depth-1">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-bolt-elements-background-depth-3 flex items-center justify-center">
                <div className="i-ph:plug text-3xl text-bolt-elements-textTertiary" />
              </div>
              <div>
                <span className="text-bolt-elements-textSecondary font-medium">Sélectionnez un aperçu</span>
                <p className="text-bolt-elements-textTertiary text-sm mt-1 mb-3">
                  {previews.length} port{previews.length > 1 ? 's' : ''} disponible{previews.length > 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {previews.map((preview: PreviewInfo, index: number) => (
                    <button
                      key={preview.port}
                      onClick={() => setActivePreviewIndex(index)}
                      className="px-3 py-1.5 rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors text-sm"
                    >
                      Port {preview.port}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex w-full h-full justify-center items-center bg-bolt-elements-background-depth-1">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-bolt-elements-background-depth-3 flex items-center justify-center">
                <div className="i-ph:eye-slash text-3xl text-bolt-elements-textTertiary" />
              </div>
              <div>
                <span className="text-bolt-elements-textSecondary font-medium">Aucun aperçu disponible</span>
                <p className="text-bolt-elements-textTertiary text-sm mt-1">Lancez le serveur pour voir l'aperçu</p>
              </div>
            </div>
          </div>
        )}

        {/* Floating exit button - macOS style - only visible in fullscreen */}
        {isFullscreen && (
          <button
            onClick={exitFullscreen}
            className="group absolute top-4 left-4 z-50 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full transition-all flex items-center justify-center shadow-sm"
            title="Quitter le plein écran (Échap)"
          >
            <div className="i-ph:x-bold text-xs text-red-900 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>
    </div>
  );
});

Preview.displayName = 'Preview';
