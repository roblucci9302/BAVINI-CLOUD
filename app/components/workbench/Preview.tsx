'use client';

import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { previewErrorStore } from '~/lib/stores/previews';
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
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSelectedPreview, setHasSelectedPreview] = useState(false);
  const previews = useStore(workbenchStore.previews);
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

  /**
   * Listen for postMessage from the preview iframe.
   * Handles console logs, errors, and other messages from the sandboxed preview.
   * CRITICAL: Always cleanup listener on unmount to prevent memory leaks.
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // SECURITY: Validate origin - only accept blob: URLs or null (sandboxed)
      // 'null' is the origin for blob: URLs and sandboxed iframes
      if (event.origin !== 'null' && !event.origin.startsWith('blob:')) {
        // Also allow same origin for WebContainer previews
        if (event.origin !== window.location.origin) {
          return;
        }
      }

      // Validate message structure
      if (!event.data || typeof event.data !== 'object') {
        return;
      }

      const { type, payload } = event.data;

      switch (type) {
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
    }
  }, [iframeUrl]);

  useEffect(() => {
    if (!activePreview) {
      logger.info('No active preview, clearing URL');
      setUrl('');
      setIframeUrl(undefined);

      return;
    }

    const { baseUrl, ready } = activePreview;
    logger.info(`Preview effect triggered: baseUrl=${baseUrl}, ready=${ready}`);

    // Only set iframe URL when preview is ready
    if (ready && baseUrl) {
      logger.info(`Setting iframe URL to: ${baseUrl}`);
      setUrl(baseUrl);

      /*
       * Set iframe URL directly without setTimeout hack
       * The setTimeout was causing race conditions with device mode switches
       */
      setIframeUrl(baseUrl);
    }
  }, [activePreview?.baseUrl, activePreview?.ready]);

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

  const reloadPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {isPortDropdownOpen && (
        <div className="z-iframe-overlay w-full h-full absolute" onClick={() => setIsPortDropdownOpen(false)} />
      )}
      <div className="px-3.5 py-2.5 flex items-center gap-2.5 bg-[var(--bolt-bg-panel,#0f0f11)] border-b border-bolt-elements-borderColor">
        <IconButton icon="i-ph:arrow-clockwise" title="Recharger l'aperçu" onClick={reloadPreview} />
        <IconButton
          icon="i-ph:arrows-out"
          title="Plein écran"
          onClick={enterFullscreen}
          disabled={!iframeUrl || !activePreview?.ready}
        />
        <IconButton
          icon="i-ph:arrow-square-out"
          title="Ouvrir dans un nouvel onglet"
          onClick={openInNewTab}
          disabled={!iframeUrl || !activePreview?.ready}
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
          <PortDropdown
            activePreviewIndex={activePreviewIndex}
            setActivePreviewIndex={setActivePreviewIndex}
            isDropdownOpen={isPortDropdownOpen}
            setHasSelectedPreview={setHasSelectedPreview}
            setIsDropdownOpen={setIsPortDropdownOpen}
            previews={previews}
          />
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
          activePreview.ready ? (

            /*
             * CRITICAL FIX: Always use DeviceFrame wrapper to prevent iframe remounting.
             * DeviceFrame handles desktop vs mobile display internally using CSS only.
             * This prevents the layout thrashing bug that caused screen glitching.
             */
            <DeviceFrame>
              <iframe
                ref={iframeRef}
                className="border-none w-full h-full bg-white"
                src={iframeUrl}
                title="Aperçu de l'application"
              />
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
