/**
 * useAgentChat - Hook for multi-agent chat integration
 *
 * This hook provides an interface for sending messages to the multi-agent system
 * and receiving responses. It integrates with:
 * - AgentSystemProvider for execution
 * - Approval flow for strict mode
 * - Chat stores for state management
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import type { Message } from '~/types/message';
import { chatStore, pendingBatchStore, approvalModalOpenStore } from '~/lib/stores/chat';
import {
  agentStatusStore,
  activeAgentsStore,
  systemLogsStore,
  addAgentLog,
  updateAgentStatus,
} from '~/lib/stores/agents';
import { workbenchStore } from '~/lib/stores/workbench';
import { StreamingMessageParser, type ActionCallback, type ArtifactCallback } from '~/lib/runtime/message-parser';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useAgentChat');

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Patterns à filtrer du contenu visible (messages de l'orchestrateur)
 */
const ORCHESTRATOR_PATTERNS = [
  /^\[Orchestrator\].*$/gim,
  /^\[orchestrator\].*$/gim,
  /^\[Orchestrator\].*\n*/gim,
  /^\[orchestrator\].*\n*/gim,
];

/**
 * Filtre les messages de l'orchestrateur du contenu
 */
function filterOrchestratorMessages(content: string): string {
  let filtered = content;

  for (const pattern of ORCHESTRATOR_PATTERNS) {
    filtered = filtered.replace(pattern, '');
  }

  // Nettoyer les lignes vides multiples
  return filtered.replace(/\n{3,}/g, '\n\n').trim();
}

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface FileContext {
  path: string;
  content?: string;
  type?: 'file' | 'folder';
}

export interface AgentChatOptions {
  /** Callback when agent starts processing */
  onStart?: () => void;

  /** Callback when agent finishes */
  onFinish?: (result: AgentChatResult) => void;

  /** Callback on error */
  onError?: (error: Error) => void;

  /** Callback for streaming text updates */
  onStream?: (text: string) => void;
}

export interface AgentChatResult {
  success: boolean;
  content: string;
  artifacts?: AgentArtifact[];
  error?: string;
}

export interface AgentArtifact {
  type: 'file' | 'command' | 'analysis';
  path?: string;
  content: string;
  action?: 'created' | 'modified' | 'deleted' | 'executed';
}

export interface SendMessageOptions {
  /** Full conversation history (recommended for context) */
  messages?: ChatMessage[];

  /** Additional context */
  context?: Record<string, unknown>;

  /** Existing files in the project (auto-fetched from workbench if not provided) */
  files?: FileContext[];
}

export interface UseAgentChatReturn {
  /** Send a message to the agent system with full context */
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<AgentChatResult>;

  /** Current response being streamed */
  streamingContent: string;

  /** Is the agent processing? */
  isProcessing: boolean;

  /** Current agent status */
  currentAgent: string | null;

  /** Abort the current operation */
  abort: () => void;

  /** Is multi-agent mode enabled? */
  isMultiAgentMode: boolean;

  /** Toggle multi-agent mode */
  setMultiAgentMode: (enabled: boolean) => void;
}

/*
 * ============================================================================
 * HOOK
 * ============================================================================
 */

/**
 * Hook React pour intégrer le système multi-agents dans l'interface chat.
 *
 * Fournit une interface complète pour:
 * - Envoyer des messages au système d'agents
 * - Suivre le streaming des réponses en temps réel
 * - Gérer l'état de traitement et les erreurs
 * - Contrôler le mode multi-agents
 *
 * @param options - Options de configuration du hook
 * @param options.onStart - Callback appelé au début du traitement
 * @param options.onFinish - Callback appelé à la fin avec le résultat
 * @param options.onError - Callback appelé en cas d'erreur
 * @param options.onStream - Callback pour chaque mise à jour du streaming
 *
 * @returns Interface UseAgentChatReturn avec sendMessage, abort, etc.
 *
 * @example
 * ```tsx
 * const { sendMessage, streamingContent, isProcessing } = useAgentChat({
 *   onFinish: (result) => console.log('Terminé:', result),
 * });
 *
 * const handleSend = async () => {
 *   const result = await sendMessage('Crée un composant Button');
 * };
 * ```
 */
export function useAgentChat(options: AgentChatOptions = {}): UseAgentChatReturn {
  const { onStart, onFinish, onError, onStream } = options;

  // State
  const [streamingContent, setStreamingContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [isMultiAgentMode, setIsMultiAgentMode] = useState(false);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef<string>(`agent-${Date.now()}`);

  // Store subscriptions
  const chatState = useStore(chatStore);
  const activeAgents = useStore(activeAgentsStore);
  const agentStatuses = useStore(agentStatusStore);

  // Create streaming message parser with workbench callbacks
  const messageParser = useMemo(() => {
    const onArtifactOpen: ArtifactCallback = (data) => {
      logger.info('Artifact opened:', data.id, data.title);
      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    };

    const onArtifactClose: ArtifactCallback = (data) => {
      logger.info('Artifact closed:', data.id);
      workbenchStore.updateArtifact(data, { closed: true });
    };

    const onActionOpen: ActionCallback = (data) => {
      logger.info('Action opened:', data.action.type);

      // Only add non-shell actions immediately (shell actions need full content)
      if (data.action.type !== 'shell') {
        workbenchStore.addAction(data);
      }
    };

    const onActionClose: ActionCallback = (data) => {
      logger.info('Action closed:', data.action.type);

      // Add shell actions when closed (now we have full content)
      if (data.action.type === 'shell') {
        workbenchStore.addAction(data);
      }

      workbenchStore.runAction(data);
    };

    return new StreamingMessageParser({
      callbacks: {
        onArtifactOpen,
        onArtifactClose,
        onActionOpen,
        onActionClose,
      },
    });
  }, []);

  // Track current active agent
  useEffect(() => {
    if (activeAgents.length > 0) {
      // Find the agent that's currently executing
      const executingAgent = activeAgents.find(
        (agent) => agentStatuses[agent] === 'executing' || agentStatuses[agent] === 'thinking',
      );
      setCurrentAgent(executingAgent || activeAgents[0]);
    } else {
      setCurrentAgent(null);
    }
  }, [activeAgents, agentStatuses]);

  /**
   * Get files from workbench store
   */
  const getProjectFiles = useCallback((): FileContext[] => {
    const files: FileContext[] = [];

    try {
      // Get files from workbench store
      const workbenchFiles = workbenchStore.files.get();

      if (workbenchFiles && typeof workbenchFiles === 'object') {
        for (const [path, fileData] of Object.entries(workbenchFiles)) {
          if (fileData && typeof fileData === 'object' && 'content' in fileData) {
            files.push({
              path,
              content: (fileData as { content: string }).content,
              type: 'file',
            });
          }
        }
      }

      logger.debug(`Retrieved ${files.length} files from workbench`);
    } catch (error) {
      logger.warn('Could not get files from workbench:', error);
    }

    return files;
  }, []);

  /**
   * Send a message to the multi-agent system with full context
   */
  const sendMessage = useCallback(
    async (content: string, options?: SendMessageOptions): Promise<AgentChatResult> => {
      if (isProcessing) {
        return {
          success: false,
          content: '',
          error: 'Agent is already processing a request',
        };
      }

      const { messages: providedMessages, context, files: providedFiles } = options || {};

      // Create abort controller
      abortControllerRef.current = new AbortController();

      // Generate new message ID for this request
      messageIdRef.current = `agent-${Date.now()}`;

      setIsProcessing(true);
      setStreamingContent('');
      onStart?.();

      // Build messages array - use provided or create from current message
      const messages: ChatMessage[] = providedMessages
        ? [...providedMessages, { role: 'user' as const, content }]
        : [{ role: 'user' as const, content }];

      // Get project files - use provided or fetch from workbench
      const files = providedFiles || getProjectFiles();

      logger.info(`Sending message to multi-agent system with ${messages.length} messages and ${files.length} files`);
      logger.debug('Message preview:', content.substring(0, 100));
      updateAgentStatus('orchestrator', 'thinking');

      try {
        // Send to agent API with full context
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
            files,
            context,
            controlMode: chatState.controlMode,
            multiAgent: true,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Agent API error: ${response.statusText}`);
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let parsedContent = ''; // Accumulated parsed output for display
        const artifacts: AgentArtifact[] = [];

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });

            // Parse the chunk - could be text or artifact
            const lines = chunk.split('\n').filter(Boolean);

            for (const line of lines) {
              logger.debug('Received line:', line.substring(0, 100));

              try {
                const parsed = JSON.parse(line);
                logger.debug('Parsed JSON:', parsed.type);

                if (parsed.type === 'text') {
                  fullContent += parsed.content;
                  logger.debug('Full content length:', fullContent.length);
                  logger.debug('Content preview:', fullContent.substring(0, 200));

                  /*
                   * Parse through StreamingMessageParser with FULL accumulated content
                   * The parser tracks position internally and returns ONLY the newly parsed portion
                   * We accumulate these portions to get the full parsed output
                   */
                  const newParsedPortion = messageParser.parse(messageIdRef.current, fullContent);
                  parsedContent += newParsedPortion;
                  logger.debug('Parsed content length:', parsedContent.length);

                  // Filter orchestrator messages for display
                  const filteredContent = filterOrchestratorMessages(parsedContent);
                  setStreamingContent(filteredContent);
                  onStream?.(filteredContent);
                } else if (parsed.type === 'artifact') {
                  artifacts.push(parsed.artifact);
                } else if (parsed.type === 'agent_status') {
                  setCurrentAgent(parsed.agent);
                  updateAgentStatus(parsed.agent, parsed.status);
                }
              } catch {
                // Plain text chunk - also parse for artifacts
                fullContent += line;

                // Parse through StreamingMessageParser with FULL accumulated content
                const newParsedPortion = messageParser.parse(messageIdRef.current, fullContent);
                parsedContent += newParsedPortion;

                // Filter orchestrator messages for display
                const filteredContent = filterOrchestratorMessages(parsedContent);
                setStreamingContent(filteredContent);
                onStream?.(filteredContent);
              }
            }
          }
        }

        // Filter orchestrator messages from final parsed content
        const finalContent = filterOrchestratorMessages(parsedContent);

        const result: AgentChatResult = {
          success: true,
          content: finalContent,
          artifacts: artifacts.length > 0 ? artifacts : undefined,
        };

        updateAgentStatus('orchestrator', 'completed');
        setTimeout(() => updateAgentStatus('orchestrator', 'idle'), 1000);

        onFinish?.(result);

        return result;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.info('Agent request aborted');
          return {
            success: false,
            content: '',
            error: 'Request aborted',
          };
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Agent chat error:', errorMessage);

        updateAgentStatus('orchestrator', 'failed');
        setTimeout(() => updateAgentStatus('orchestrator', 'idle'), 2000);

        const result: AgentChatResult = {
          success: false,
          content: '',
          error: errorMessage,
        };

        onError?.(error instanceof Error ? error : new Error(errorMessage));
        onFinish?.(result);

        return result;
      } finally {
        setIsProcessing(false);
        abortControllerRef.current = null;
      }
    },
    [isProcessing, chatState.controlMode, messageParser, getProjectFiles, onStart, onFinish, onError, onStream],
  );

  /**
   * Abort the current operation
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      logger.info('Aborting agent request');
    }

    // Also abort all workbench actions
    workbenchStore.abortAllActions();

    setIsProcessing(false);
    setStreamingContent('');
    updateAgentStatus('orchestrator', 'aborted');
    setTimeout(() => updateAgentStatus('orchestrator', 'idle'), 1000);
  }, []);

  /**
   * Toggle multi-agent mode
   */
  const setMultiAgentModeHandler = useCallback((enabled: boolean) => {
    setIsMultiAgentMode(enabled);
    logger.info(`Multi-agent mode ${enabled ? 'enabled' : 'disabled'}`);

    addAgentLog('orchestrator', {
      level: 'info',
      message: `Multi-agent mode ${enabled ? 'enabled' : 'disabled'}`,
    });
  }, []);

  return {
    sendMessage,
    streamingContent,
    isProcessing,
    currentAgent,
    abort,
    isMultiAgentMode,
    setMultiAgentMode: setMultiAgentModeHandler,
  };
}

/**
 * Hook simple pour vérifier si le mode agent est actif.
 *
 * @returns true si chatStore.mode === 'agent'
 *
 * @example
 * ```tsx
 * const isAgentMode = useIsAgentMode();
 * if (isAgentMode) {
 *   // Afficher les contrôles d'approbation
 * }
 * ```
 */
export function useIsAgentMode(): boolean {
  const chatState = useStore(chatStore);
  return chatState.mode === 'agent';
}

/**
 * Hook pour gérer le mode de contrôle des agents.
 *
 * @returns Objet avec:
 *   - controlMode: Mode actuel ('strict', 'moderate', 'permissive')
 *   - setControlMode: Fonction pour changer le mode
 *   - isStrict: Raccourci pour controlMode === 'strict'
 *
 * @example
 * ```tsx
 * const { controlMode, setControlMode, isStrict } = useControlMode();
 *
 * return (
 *   <select value={controlMode} onChange={(e) => setControlMode(e.target.value)}>
 *     <option value="strict">Strict</option>
 *     <option value="moderate">Modéré</option>
 *     <option value="permissive">Permissif</option>
 *   </select>
 * );
 * ```
 */
export function useControlMode() {
  const chatState = useStore(chatStore);

  const setControlMode = useCallback((mode: 'strict' | 'moderate' | 'permissive') => {
    chatStore.setKey('controlMode', mode);
  }, []);

  return {
    controlMode: chatState.controlMode,
    setControlMode,
    isStrict: chatState.controlMode === 'strict',
  };
}
