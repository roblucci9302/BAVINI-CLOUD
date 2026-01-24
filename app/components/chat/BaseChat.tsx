'use client';

import type { Message } from '~/types/message';
import { useStore } from '@nanostores/react';
import React, { type RefCallback, useRef, useCallback, useState, useEffect, memo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelGroupHandle } from 'react-resizable-panels';
import { ClientOnly } from 'remix-utils/client-only';
import { LazyColorBendsWrapper as ColorBends } from '~/components/ui/ColorBends.lazy';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { chatStore, setChatMode } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { preloadOnTypingStart, preloadOnFirstMessage, preloadOnWorkbenchInteraction } from '~/lib/performance';
import { AnimatedPlaceholder } from './AnimatedPlaceholder';
import { Messages } from './Messages.client';
import { MultiAgentToggle } from './MultiAgentToggle';
import { SendButton } from './SendButton.client';
import { TemplatePills } from './TemplatePills';

import styles from './BaseChat.module.scss';

/**
 * Bouton toggle pour activer/désactiver le mode Chat
 * - Mode Chat actif: icône remplie + dot vert (analyse seule)
 * - Mode Agent actif: icône outline (BAVINI peut coder)
 */
const ChatModeToggle = memo(() => {
  const { mode } = useStore(chatStore);
  const isChatMode = mode === 'chat';

  const handleToggle = useCallback(() => {
    setChatMode(isChatMode ? 'agent' : 'chat');
  }, [isChatMode]);

  return (
    <IconButton
      title={
        isChatMode
          ? 'Mode Chat actif - Cliquez pour passer en mode Agent'
          : 'Mode Agent actif - Cliquez pour passer en mode Chat'
      }
      className={classNames(
        'relative transition-colors',
        isChatMode
          ? 'text-bolt-elements-item-contentAccent'
          : 'text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive',
      )}
      onClick={handleToggle}
    >
      <div className="relative">
        <div
          className={classNames('text-xl transition-all', isChatMode ? 'i-ph:chat-circle-fill' : 'i-ph:chat-circle')}
        />
        {isChatMode && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-bolt-elements-background-depth-1" />
        )}
      </div>
    </IconButton>
  );
});

interface FilePreview {
  file: File;
  preview: string;
}

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  fileInputRef?: React.RefObject<HTMLInputElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;

  /** Contenu du message en cours de streaming (séparé pour éviter les re-renders) */
  streamingContent?: string;

  /** Indique qu'une session existante est en cours de chargement */
  isLoadingSession?: boolean;
  messages?: Message[];
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  selectedFiles?: FilePreview[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  onFileSelect?: () => void;
  onFileRemove?: (index: number) => void;
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
  onRegenerateMessage?: (index: number) => void;
}

// Boutons principaux (toujours visibles)
const PRIMARY_PROMPTS = [
  {
    label: 'Landing Page',
    icon: 'i-ph:browser',
    prompt:
      'Utilise le template LandingModern pour créer une landing page SaaS moderne et responsive avec hero, features, pricing et footer.',
  },
  {
    label: 'E-commerce',
    icon: 'i-ph:shopping-cart',
    prompt:
      'Utilise le template EcommerceModern pour créer une boutique en ligne avec header, grille de produits, filtres et panier.',
  },
  {
    label: 'Dashboard',
    icon: 'i-ph:chart-line-up',
    prompt:
      'Utilise le template DashboardModern pour créer un dashboard analytics avec sidebar, stats, graphiques et tableaux.',
  },
];

// Boutons secondaires (visibles après clic sur "Plus...")
const SECONDARY_PROMPTS = [
  {
    label: 'Portfolio',
    icon: 'i-ph:images',
    prompt:
      'Utilise le template PortfolioModern pour créer un portfolio créatif avec projets, skills, témoignages et contact.',
  },
  {
    label: 'Blog',
    icon: 'i-ph:article',
    prompt:
      'Utilise le template BlogModern pour créer un blog moderne avec articles en grille, catégories et newsletter.',
  },
  {
    label: 'Pricing',
    icon: 'i-ph:credit-card',
    prompt:
      'Utilise le template PricingModern pour créer une page de tarification SaaS avec plans, comparaison et FAQ.',
  },
  {
    label: 'Agency',
    icon: 'i-ph:buildings',
    prompt:
      'Utilise le template AgencyModern pour créer un site agence avec services, projets, équipe et formulaire de contact.',
  },
];

const TEXTAREA_MIN_HEIGHT = 76;

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      fileInputRef: _fileInputRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      streamingContent,
      isLoadingSession = false,
      enhancingPrompt = false,
      promptEnhanced = false,
      messages,
      input = '',
      selectedFiles = [],
      sendMessage,
      handleInputChange,
      enhancePrompt,
      handleStop,
      onFileSelect,
      onFileRemove,
      onEditMessage,
      onDeleteMessage,
      onRegenerateMessage,
    },
    ref,
  ) => {
    /*
     * Si on charge une session existante, on considère le chat comme "démarré"
     * pour afficher le layout chat avec skeleton au lieu de la page d'accueil
     */
    const effectiveChatStarted = chatStarted || isLoadingSession;
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const hasPreloadedOnFirstMessage = useRef(false);
    const showWorkbench = useStore(workbenchStore.showWorkbench);

    // defer ColorBends loading by 500ms to prioritize UI
    const [showColorBends, setShowColorBends] = useState(false);

    // État pour afficher/masquer les templates secondaires
    const [showMoreTemplates, setShowMoreTemplates] = useState(false);
    const secondaryTemplatesRef = useRef<HTMLDivElement>(null);
    const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);

    // Redimensionner les panels quand le workbench s'ouvre/ferme
    useEffect(() => {
      if (panelGroupRef.current && chatStarted) {
        if (showWorkbench) {
          // Ouvrir le workbench: chat 40%, workbench 60%
          panelGroupRef.current.setLayout([40, 60]);
        } else {
          // Fermer le workbench: chat 100%
          panelGroupRef.current.setLayout([100, 0]);
        }
      }
    }, [showWorkbench, chatStarted]);

    // Auto-scroll vers les templates secondaires quand ils apparaissent
    useEffect(() => {
      if (showMoreTemplates && secondaryTemplatesRef.current) {
        setTimeout(() => {
          // Use 'nearest' to avoid excessive scrolling - only scroll if needed
          secondaryTemplatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    }, [showMoreTemplates]);

    useEffect(() => {
      if (effectiveChatStarted) {
        // don't show ColorBends if chat already started or loading session
        return undefined;
      }

      const timer = setTimeout(() => {
        setShowColorBends(true);
      }, 500);

      return () => clearTimeout(timer);
    }, [effectiveChatStarted]);

    // trigger preload when user focuses on textarea (about to type)
    const handleTextareaFocus = useCallback(() => {
      preloadOnTypingStart();
    }, []);

    // wrap sendMessage to trigger preload on first message
    const handleSendMessage = useCallback(
      (event: React.UIEvent, messageInput?: string) => {
        if (!hasPreloadedOnFirstMessage.current) {
          hasPreloadedOnFirstMessage.current = true;
          preloadOnFirstMessage();
        }

        sendMessage?.(event, messageInput);
      },
      [sendMessage],
    );

    return (
      <div
        ref={ref}
        className={classNames(
          styles.BaseChat,
          'relative flex h-full w-full overflow-hidden',
          effectiveChatStarted ? 'bg-bolt-elements-background-depth-1' : styles.welcomeGradient,
        )}
        data-chat-visible={showChat}
      >
        {/* ColorBends animated background - only on welcome screen, deferred by 500ms */}
        {!effectiveChatStarted && (
          <ClientOnly fallback={<div className={classNames('absolute inset-0', styles.welcomeGradient)} />}>
            {() =>
              showColorBends ? (
                <ColorBends
                  className="absolute inset-0 z-0"
                  speed={0.15}
                  noise={0.08}
                  mouseInfluence={0.5}
                  parallax={0.3}
                />
              ) : (
                <div className={classNames('absolute inset-0', styles.welcomeGradient)} />
              )
            }
          </ClientOnly>
        )}
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <PanelGroup ref={panelGroupRef} direction="horizontal" className="w-full h-full">
          <Panel
            id="chat-panel"
            defaultSize={chatStarted && showWorkbench ? 40 : 100}
            minSize={chatStarted && showWorkbench ? 30 : 100}
            maxSize={chatStarted && showWorkbench ? 70 : 100}
          >
            <div
              className={classNames(
                styles.Chat,
                'flex flex-col w-full h-full',
                { [styles.chatWithWorkbench]: showWorkbench },
              )}
            >
            {/* Zone scrollable des messages */}
            <div
              ref={scrollRef}
              className={classNames('overflow-y-auto', {
                'flex-1 pt-6 px-6': effectiveChatStarted,
              })}
            >
              {/* Messages area only when chat started */}
              <ClientOnly>
                {() => {
                  // Si pas de chat démarré et pas en chargement, ne rien afficher
                  if (!effectiveChatStarted) {
                    return null;
                  }

                  // Si en chargement de session, afficher le skeleton
                  if (isLoadingSession && !chatStarted) {
                    return (
                      <div className="flex flex-col w-full flex-1 px-4 pb-6 z-1 animate-pulse">
                        {/* Skeleton pour messages */}
                        <div className="space-y-6">
                          {/* Message utilisateur skeleton */}
                          <div className="flex gap-4 p-6 w-full rounded-lg bg-bolt-elements-messages-background">
                            <div className="w-[34px] h-[34px] rounded-full bg-gray-300 dark:bg-gray-700 shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4" />
                              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2" />
                            </div>
                          </div>
                          {/* Message assistant skeleton */}
                          <div className="flex gap-4 p-6 w-full rounded-lg bg-bolt-elements-messages-background mt-5">
                            <div className="flex-1 space-y-3">
                              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full" />
                              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6" />
                              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-4/5" />
                              <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-2/3" />
                            </div>
                          </div>
                        </div>
                        {/* Indicateur de chargement */}
                        <div className="flex items-center justify-center mt-4 text-bolt-elements-textSecondary">
                          <div className="i-svg-spinners:3-dots-fade text-2xl" />
                          <span className="ml-2 text-sm">Chargement de la conversation...</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <Messages
                      ref={messageRef}
                      className="flex flex-col w-full flex-1 px-4 pb-6 z-1"
                      messages={messages}
                      isStreaming={isStreaming}
                      streamingContent={streamingContent}
                      onEditMessage={onEditMessage}
                      onDeleteMessage={onDeleteMessage}
                      onRegenerateMessage={onRegenerateMessage}
                    />
                  );
                }}
              </ClientOnly>
            </div>
            {/* Input area - centered on welcome, fixed bottom on chat */}
            <div className={classNames('w-full px-6', {
              'flex-shrink-0 pb-4 pt-2': effectiveChatStarted,
              'flex-1 flex flex-col justify-end max-w-chat mx-auto pb-4 pt-[15vh]': !effectiveChatStarted,
            })}>
              {/* Intro content above input on welcome screen */}
              {!effectiveChatStarted && (
                <div id="intro" className="mb-4">
                  <h1 className="text-5xl text-center font-bold bg-gradient-to-r from-white via-white to-sky-300 dark:from-white dark:via-white dark:to-accent-400 bg-clip-text text-transparent mb-2">
                    Vous imaginez, on réalise
                  </h1>
                  <p className="mb-3 text-center text-white/80 dark:text-bolt-elements-textSecondary" suppressHydrationWarning>
                    Décrivez votre projet app, website et BAVINI le crée pour vous.
                  </p>
                  <TemplatePills
                    onSelectTemplate={(prompt) => {
                      handleSendMessage({} as React.UIEvent, prompt);
                    }}
                  />
                </div>
              )}
              <div
                className={classNames(
                  'border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-xl overflow-hidden',
                  { [styles.welcomeInput]: !chatStarted },
                )}
              >
                  {/* File Previews */}
                  {selectedFiles.length > 0 && (
                    <div className="flex gap-2 p-3 pb-0 flex-wrap">
                      {selectedFiles.map((filePreview, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={filePreview.preview}
                            alt={filePreview.file.name}
                            className="w-16 h-16 object-cover rounded-lg border border-bolt-elements-borderColor"
                          />
                          <button
                            onClick={() => onFileRemove?.(index)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer"
                          >
                            <div className="i-ph:x text-xs" />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 rounded-b-lg truncate">
                            {filePreview.file.name.length > 10
                              ? `${filePreview.file.name.slice(0, 10)}...`
                              : filePreview.file.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <AnimatedPlaceholder chatStarted={chatStarted} textareaRef={textareaRef} />
                    <textarea
                      ref={textareaRef}
                      className="w-full pl-4 pt-4 pr-4 pb-3 focus:outline-none resize-none text-md text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent"
                      onFocus={handleTextareaFocus}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          if (event.shiftKey) {
                            return;
                          }

                          event.preventDefault();

                          handleSendMessage(event);
                        }
                      }}
                      value={input}
                      onChange={(event) => {
                        handleInputChange?.(event);
                      }}
                      style={{
                        minHeight: TEXTAREA_MIN_HEIGHT,
                        maxHeight: TEXTAREA_MAX_HEIGHT,
                      }}
                      placeholder={chatStarted ? 'Comment BAVINI peut-il vous aider ?' : ''}
                      aria-label="Message à envoyer à BAVINI"
                      translate="no"
                    />
                  </div>
                  <div className="flex justify-between items-center text-sm px-3 py-2">
                    <div className="flex gap-1 items-center">
                      <IconButton
                        title={effectiveChatStarted ? "Joindre un fichier" : (showMoreTemplates ? "Moins de templates" : "Plus de templates")}
                        className="text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary"
                        onClick={() => {
                          if (effectiveChatStarted) {
                            onFileSelect?.();
                          } else {
                            setShowMoreTemplates(!showMoreTemplates);
                          }
                        }}
                      >
                        <div className={effectiveChatStarted ? "i-ph:paperclip text-lg" : "i-ph:plus text-lg"} />
                      </IconButton>
                      <IconButton
                        title="Améliorer le prompt"
                        disabled={input.length === 0 || enhancingPrompt}
                        className={classNames('text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary', {
                          'opacity-100!': enhancingPrompt,
                        })}
                        onClick={() => enhancePrompt?.()}
                      >
                        {enhancingPrompt ? (
                          <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-lg"></div>
                        ) : (
                          <div className="i-bolt:stars text-lg"></div>
                        )}
                      </IconButton>
                      <ChatModeToggle />
                      <MultiAgentToggle />
                    </div>
                    <ClientOnly>
                      {() => (
                        <SendButton
                          hasContent={input.length > 0 || selectedFiles.length > 0}
                          isStreaming={isStreaming}
                          onClick={(event) => {
                            if (isStreaming) {
                              handleStop?.();
                              return;
                            }

                            handleSendMessage(event);
                          }}
                        />
                      )}
                    </ClientOnly>
                  </div>
                </div>
              </div>
              {/* Templates catégories - en dessous du container input */}
              {!effectiveChatStarted && (
                <div className="flex flex-col items-center mt-3 pb-16 max-w-chat mx-auto">
                  {/* Primary templates row with relative positioning for secondary */}
                  <div className="relative flex flex-nowrap gap-2 justify-center">
                    {PRIMARY_PROMPTS.map((category, index) => (
                      <button
                        key={index}
                        onClick={(event) => {
                          handleSendMessage(event, category.prompt);
                        }}
                        className="group flex items-center justify-center gap-2 px-4 py-2 min-w-[120px] shrink-0 rounded-full border border-white/40 dark:border-bolt-elements-borderColor bg-white/85 dark:bg-bolt-elements-background-depth-2 hover:bg-white dark:hover:bg-bolt-elements-background-depth-3 hover:border-white/60 dark:hover:border-bolt-elements-borderColorHover text-gray-700 dark:text-bolt-elements-textSecondary hover:text-gray-900 dark:hover:text-bolt-elements-textPrimary shadow-lg dark:shadow-none transition-all duration-200"
                      >
                        <div
                          className={classNames(category.icon, 'text-base group-hover:text-sky-500 dark:group-hover:text-accent-500 transition-colors')}
                        />
                        <span className="text-sm font-medium">{category.label}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setShowMoreTemplates(!showMoreTemplates)}
                      className={classNames(
                        'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
                        'bg-white/85 dark:bg-bolt-elements-background-depth-2 hover:bg-white dark:hover:bg-bolt-elements-background-depth-3',
                        'border border-white/40 dark:border-bolt-elements-borderColor hover:border-white/60 dark:hover:border-bolt-elements-borderColorHover',
                        'shadow-lg dark:shadow-none',
                        showMoreTemplates
                          ? 'text-gray-500 dark:text-bolt-elements-textTertiary hover:text-gray-700 dark:hover:text-bolt-elements-textSecondary'
                          : 'text-gray-700 dark:text-bolt-elements-textSecondary hover:text-gray-900 dark:hover:text-bolt-elements-textPrimary',
                      )}
                    >
                      {showMoreTemplates ? 'Moins' : '+ Plus'}
                    </button>
                    {/* Secondary templates - positioned absolutely below primary row */}
                    {showMoreTemplates && (
                      <div
                        ref={secondaryTemplatesRef}
                        className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex flex-nowrap gap-2 justify-center animate-in fade-in slide-in-from-top-2 duration-200"
                      >
                        {SECONDARY_PROMPTS.map((category, index) => (
                          <button
                            key={index}
                            onClick={(event) => {
                              handleSendMessage(event, category.prompt);
                            }}
                            className="group flex items-center justify-center gap-2 px-4 py-2 min-w-[120px] shrink-0 rounded-full border border-white/40 dark:border-bolt-elements-borderColor bg-white/85 dark:bg-bolt-elements-background-depth-2 hover:bg-white dark:hover:bg-bolt-elements-background-depth-3 hover:border-white/60 dark:hover:border-bolt-elements-borderColorHover text-gray-700 dark:text-bolt-elements-textSecondary hover:text-gray-900 dark:hover:text-bolt-elements-textPrimary shadow-lg dark:shadow-none transition-all duration-200"
                          >
                            <div
                              className={classNames(
                                category.icon,
                                'text-base group-hover:text-sky-500 dark:group-hover:text-accent-500 transition-colors',
                              )}
                            />
                            <span className="text-sm font-medium">{category.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Panel>
          {(chatStarted && showWorkbench) && (
            <PanelResizeHandle className="w-1 bg-bolt-elements-borderColor hover:bg-accent-500 transition-colors cursor-col-resize" />
          )}
          <Panel
            id="workbench-panel"
            defaultSize={chatStarted && showWorkbench ? 60 : 0}
            minSize={0}
            maxSize={chatStarted && showWorkbench ? 80 : 0}
            collapsible
            collapsedSize={0}
          >
            {chatStarted && showWorkbench && (
              <ClientOnly>
                {() => (
                  <div className="w-full h-full" onMouseEnter={preloadOnWorkbenchInteraction}>
                    <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />
                  </div>
                )}
              </ClientOnly>
            )}
          </Panel>
        </PanelGroup>
      </div>
    );
  },
);
