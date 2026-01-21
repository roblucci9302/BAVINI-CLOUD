'use client';

import { memo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import * as RadixDialog from '@radix-ui/react-dialog';
import { settingsModalOpen, activeSettingsTab, closeSettingsModal } from '~/lib/stores/connectors';
import { interfaceSettingsStore, buildSettingsStore, setBuildEngine, type BuildEngineType } from '~/lib/stores/settings';
import {
  designGuidelinesEnabledStore,
  guidelinesLevelStore,
  setDesignGuidelinesEnabled,
  setGuidelinesLevel,
  getGuidelinesLevelDescription,
  getEstimatedTokens,
  type GuidelinesLevel,
} from '~/lib/stores/design-guidelines';
import { classNames } from '~/utils/classNames';
import { dialogBackdropVariants, dialogVariants } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { ConnectorsPanel } from './ConnectorsPanel';
import { GitHubPanel } from './GitHubPanel';

type SettingsTab = 'account' | 'connectors' | 'github' | 'interface';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: string;
}

const tabs: TabConfig[] = [
  { id: 'interface', label: 'Interface', icon: 'i-ph:sliders' },
  { id: 'connectors', label: 'Connecteurs', icon: 'i-ph:plug' },
  { id: 'github', label: 'GitHub', icon: 'i-ph:github-logo' },
  { id: 'account', label: 'Compte', icon: 'i-ph:user' },
];

export const SettingsModal = memo(() => {
  const isOpen = useStore(settingsModalOpen);
  const currentTab = useStore(activeSettingsTab);

  const handleTabChange = (tab: SettingsTab) => {
    activeSettingsTab.set(tab);
  };

  // Keyboard navigation for settings tabs (WAI-ARIA Tabs Pattern)
  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
      let newIndex = currentIndex;

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        newIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        newIndex = tabs.length - 1;
      }

      if (newIndex !== currentIndex) {
        const newTab = tabs[newIndex];
        handleTabChange(newTab.id);

        // Focus the new tab
        const newTabElement = document.getElementById(`settings-tab-${newTab.id}`);
        newTabElement?.focus();
      }
    },
    [currentTab],
  );

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={(open) => !open && closeSettingsModal()}>
      <AnimatePresence>
        {isOpen && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild>
              <motion.div
                className="bg-black/50 fixed inset-0 z-max"
                initial="closed"
                animate="open"
                exit="closed"
                variants={dialogBackdropVariants}
                onClick={closeSettingsModal}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild>
              <motion.div
                className="fixed top-[50%] left-[50%] z-max h-[85vh] w-[90vw] max-w-[900px] translate-x-[-50%] translate-y-[-50%] border border-bolt-elements-borderColor rounded-lg bg-bolt-elements-background-depth-2 shadow-lg focus:outline-none overflow-hidden flex"
                initial="closed"
                animate="open"
                exit="closed"
                variants={dialogVariants}
              >
                {/* Sidebar */}
                <div className="w-56 flex-shrink-0 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 p-4">
                  <h2 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">Paramètres</h2>

                  <nav
                    className="space-y-1"
                    role="tablist"
                    aria-label="Onglets des paramètres"
                    onKeyDown={handleTabKeyDown}
                  >
                    {tabs.map((tab) => {
                      const isActive = currentTab === tab.id;
                      const tabId = `settings-tab-${tab.id}`;
                      const panelId = `settings-panel-${tab.id}`;

                      return (
                        <button
                          key={tab.id}
                          id={tabId}
                          role="tab"
                          aria-selected={isActive}
                          aria-controls={panelId}
                          tabIndex={isActive ? 0 : -1}
                          onClick={() => handleTabChange(tab.id)}
                          className={classNames(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-theme',
                            isActive
                              ? 'bg-bolt-elements-sidebar-buttonBackgroundDefault text-bolt-elements-sidebar-buttonText'
                              : 'bg-bolt-elements-sidebar-buttonBackgroundDefault/50 text-bolt-elements-sidebar-buttonText/70 hover:bg-bolt-elements-sidebar-buttonBackgroundHover hover:text-bolt-elements-sidebar-buttonText',
                          )}
                        >
                          <span className={classNames(tab.icon, 'text-lg')} aria-hidden="true" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {/* Content */}
                <div
                  id={`settings-panel-${currentTab}`}
                  role="tabpanel"
                  aria-labelledby={`settings-tab-${currentTab}`}
                  className="flex-1 overflow-y-auto p-6"
                >
                  {currentTab === 'interface' && <InterfacePanel />}
                  {currentTab === 'connectors' && <ConnectorsPanel />}
                  {currentTab === 'github' && <GitHubPanel />}
                  {currentTab === 'account' && <AccountPanel />}
                </div>

                {/* Close button */}
                <RadixDialog.Close asChild onClick={closeSettingsModal}>
                  <IconButton icon="i-ph:x" className="absolute top-4 right-4" title="Fermer les paramètres" />
                </RadixDialog.Close>
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
});

// Interface settings panel
const InterfacePanel = memo(() => {
  const interfaceSettings = useStore(interfaceSettingsStore);
  const buildSettings = useStore(buildSettingsStore);
  const designGuidelinesEnabled = useStore(designGuidelinesEnabledStore);
  const guidelinesLevel = useStore(guidelinesLevelStore);

  const handleToggleAgentBadge = useCallback(() => {
    interfaceSettingsStore.set({
      ...interfaceSettings,
      showAgentStatusBadge: !interfaceSettings.showAgentStatusBadge,
    });
  }, [interfaceSettings]);

  const handleToggleBuildEngine = useCallback(() => {
    const newEngine: BuildEngineType = buildSettings.engine === 'webcontainer' ? 'browser' : 'webcontainer';
    setBuildEngine(newEngine);
  }, [buildSettings.engine]);

  const handleToggleDesignGuidelines = useCallback(() => {
    setDesignGuidelinesEnabled(!designGuidelinesEnabled);
  }, [designGuidelinesEnabled]);

  const handleLevelChange = useCallback((level: GuidelinesLevel) => {
    setGuidelinesLevel(level);
  }, []);

  const isBrowserEngine = buildSettings.engine === 'browser';
  const estimatedTokens = getEstimatedTokens(guidelinesLevel);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Interface</h2>
        <p className="text-sm text-bolt-elements-textSecondary mt-1">Personnalisez l'apparence de l'application</p>
      </div>

      <div className="space-y-4">
        {/* Agent Status Badge Toggle */}
        <div className="flex items-center justify-between p-4 bg-bolt-elements-background-depth-3 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="i-ph:robot text-xl text-bolt-elements-textSecondary" />
            <div>
              <p className="text-sm font-medium text-bolt-elements-textPrimary">Badge de statut des agents</p>
              <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                Affiche un indicateur flottant pendant le travail des agents
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleAgentBadge}
            className={classNames(
              'relative w-11 h-6 rounded-full transition-colors',
              interfaceSettings.showAgentStatusBadge ? 'bg-accent-500' : 'bg-bolt-elements-background-depth-4',
            )}
            role="switch"
            aria-checked={interfaceSettings.showAgentStatusBadge}
            aria-label="Afficher le badge de statut des agents"
          >
            <span
              className={classNames(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                interfaceSettings.showAgentStatusBadge ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        {/* Build Engine Toggle */}
        <div className="flex items-center justify-between p-4 bg-bolt-elements-background-depth-3 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="i-ph:lightning text-xl text-bolt-elements-textSecondary" />
            <div>
              <p className="text-sm font-medium text-bolt-elements-textPrimary">Moteur de build propriétaire</p>
              <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                Utilise esbuild-wasm au lieu de WebContainer (StackBlitz)
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleBuildEngine}
            className={classNames(
              'relative w-11 h-6 rounded-full transition-colors',
              isBrowserEngine ? 'bg-accent-500' : 'bg-bolt-elements-background-depth-4',
            )}
            role="switch"
            aria-checked={isBrowserEngine}
            aria-label="Activer le moteur de build propriétaire"
          >
            <span
              className={classNames(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                isBrowserEngine ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        {/* Design Guidelines Section */}
        <div className="mt-6 pt-6 border-t border-bolt-elements-borderColor">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3 flex items-center gap-2">
            <span className="i-ph:paint-brush text-lg" />
            Design Guidelines (Plugin Anthropic)
          </h3>

          {/* Design Guidelines Toggle */}
          <div className="flex items-center justify-between p-4 bg-bolt-elements-background-depth-3 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="i-ph:palette text-xl text-bolt-elements-textSecondary" />
              <div>
                <p className="text-sm font-medium text-bolt-elements-textPrimary">Activer les guidelines</p>
                <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
                  Injecte des règles de design pour des interfaces distinctives
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleDesignGuidelines}
              className={classNames(
                'relative w-11 h-6 rounded-full transition-colors',
                designGuidelinesEnabled ? 'bg-accent-500' : 'bg-bolt-elements-background-depth-4',
              )}
              role="switch"
              aria-checked={designGuidelinesEnabled}
              aria-label="Activer les design guidelines"
            >
              <span
                className={classNames(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                  designGuidelinesEnabled ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          {/* Guidelines Level Selector */}
          {designGuidelinesEnabled && (
            <div className="mt-3 p-4 bg-bolt-elements-background-depth-3 rounded-lg">
              <p className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Niveau de détail</p>
              <div className="space-y-2">
                {(['minimal', 'standard', 'full'] as GuidelinesLevel[]).map((level) => {
                  const isSelected = guidelinesLevel === level;
                  const tokens = getEstimatedTokens(level);
                  const description = getGuidelinesLevelDescription(level);

                  return (
                    <button
                      key={level}
                      onClick={() => handleLevelChange(level)}
                      className={classNames(
                        'w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left',
                        isSelected
                          ? 'bg-accent-500/20 border border-accent-500'
                          : 'bg-bolt-elements-background-depth-4 border border-transparent hover:border-bolt-elements-borderColor',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={classNames(
                            'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                            isSelected ? 'border-accent-500' : 'border-bolt-elements-textTertiary',
                          )}
                        >
                          {isSelected && <span className="w-2 h-2 rounded-full bg-accent-500" />}
                        </span>
                        <div>
                          <p
                            className={classNames(
                              'text-sm font-medium',
                              isSelected ? 'text-accent-500' : 'text-bolt-elements-textPrimary',
                            )}
                          >
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </p>
                          <p className="text-xs text-bolt-elements-textSecondary">{description}</p>
                        </div>
                      </div>
                      {tokens > 0 && (
                        <span className="text-xs text-bolt-elements-textTertiary">~{tokens} tokens</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Token usage info */}
              <div className="mt-3 flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
                <span className="i-ph:info" />
                <span>
                  Les tokens sont ajoutés au prompt système pour chaque requête UI.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

InterfacePanel.displayName = 'InterfacePanel';

// Placeholder for account panel
const AccountPanel = memo(() => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Compte</h2>
        <p className="text-sm text-bolt-elements-textSecondary mt-1">Gérez les paramètres de votre compte</p>
      </div>

      <div className="p-8 text-center text-bolt-elements-textTertiary border border-dashed border-bolt-elements-borderColor rounded-lg">
        <span className="i-ph:user-circle text-4xl mb-2 block" />
        <p>Fonctionnalité bientôt disponible</p>
      </div>
    </div>
  );
});

AccountPanel.displayName = 'AccountPanel';
