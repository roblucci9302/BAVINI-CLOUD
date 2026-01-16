import type {
  ActionType,
  BoltAction,
  BoltActionData,
  FileAction,
  GitAction,
  GitHubAction,
  GitHubOperation,
  GitOperation,
  PythonAction,
  RestartAction,
  ShellAction,
} from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<boltAction';
const ARTIFACT_ACTION_TAG_CLOSE = '</boltAction>';

// Pré-compiler les regex pour les attributs connus (évite recompilation à chaque parsing)
const KNOWN_ATTRIBUTES = [
  'title',
  'id',
  'type',
  'filePath',
  'operation',
  'url',
  'message',
  'remote',
  'branch',
  'filepath',
  'token',
  'packages',
  'owner',
  'repo',
  'body',
  'head',
  'base',
  'labels',
  'state',
] as const;

const ATTRIBUTE_REGEX_CACHE = new Map<string, RegExp>(
  KNOWN_ATTRIBUTES.map((attr) => [attr, new RegExp(`${attr}="([^"]*)"`, 'i')]),
);

const logger = createScopedLogger('MessageParser');

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
}

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  currentArtifact?: BoltArtifactData;
  currentAction: BoltActionData;
  actionId: number;
}

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  #maxCachedMessages = 50; // Limite de messages en cache pour éviter fuite mémoire
  #messageOrder: string[] = []; // Ordre d'insertion pour nettoyage LRU

  constructor(private _options: StreamingMessageParserOptions = {}) {}

  parse(messageId: string, input: string) {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideAction: false,
        insideArtifact: false,
        currentAction: { content: '' },
        actionId: 0,
      };

      this.#messages.set(messageId, state);
      this.#messageOrder.push(messageId);

      // Nettoyage LRU: supprimer les messages les plus anciens si limite dépassée
      while (this.#messageOrder.length > this.#maxCachedMessages) {
        const oldestId = this.#messageOrder.shift();

        if (oldestId && oldestId !== messageId) {
          this.#messages.delete(oldestId);
        }
      }
    }

    let output = '';
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        if (currentArtifact === undefined) {
          unreachable('Artifact not initialized');
        }

        if (state.insideAction) {
          const closeIndex = input.indexOf(ARTIFACT_ACTION_TAG_CLOSE, i);

          const currentAction = state.currentAction;

          if (closeIndex !== -1) {
            currentAction.content += input.slice(i, closeIndex);

            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              content += '\n';
            }

            currentAction.content = content;

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,

              /**
               * We decrement the id because it's been incremented already
               * when `onActionOpen` was emitted to make sure the ids are
               * the same.
               */
              actionId: String(state.actionId - 1),

              action: currentAction as BoltAction,
            });

            state.insideAction = false;
            state.currentAction = { content: '' };

            i = closeIndex + ARTIFACT_ACTION_TAG_CLOSE.length;
          } else {
            break;
          }
        } else {
          const actionOpenIndex = input.indexOf(ARTIFACT_ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (actionOpenIndex !== -1 && (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)) {
            const actionEndIndex = input.indexOf('>', actionOpenIndex);

            if (actionEndIndex !== -1) {
              state.insideAction = true;

              state.currentAction = this.#parseActionTag(input, actionOpenIndex, actionEndIndex);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as BoltAction,
              });

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseIndex !== -1) {
            this._options.callbacks?.onArtifactClose?.({ messageId, ...currentArtifact });

            state.insideArtifact = false;
            state.currentArtifact = undefined;

            i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          } else {
            break;
          }
        }
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        let j = i;
        let potentialTag = '';

        while (j < input.length && potentialTag.length < ARTIFACT_TAG_OPEN.length) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            if (nextChar && nextChar !== '>' && nextChar !== ' ') {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf('>', j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);

              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const artifactId = this.#extractAttribute(artifactTag, 'id') as string;

              if (!artifactTitle) {
                logger.warn('Artifact title missing');
              }

              if (!artifactId) {
                logger.warn('Artifact id missing');
              }

              state.insideArtifact = true;

              const currentArtifact = {
                id: artifactId,
                title: artifactTitle,
              } satisfies BoltArtifactData;

              state.currentArtifact = currentArtifact;

              this._options.callbacks?.onArtifactOpen?.({ messageId, ...currentArtifact });

              const artifactFactory = this._options.artifactElement ?? createArtifactElement;

              output += artifactFactory({ messageId });

              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }

            break;
          } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            output += input.slice(i, j + 1);
            i = j + 1;
            break;
          }

          j++;
        }

        if (j === input.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
          break;
        }
      } else {
        output += input[i];
        i++;
      }

      if (earlyBreak) {
        break;
      }
    }

    state.position = i;

    return output;
  }

  reset() {
    this.#messages.clear();
    this.#messageOrder = [];
  }

  /**
   * Nettoie l'état d'un message spécifique après parsing complet.
   * Appeler cette méthode après la fin du streaming pour libérer la mémoire.
   */
  clearMessage(messageId: string) {
    this.#messages.delete(messageId);

    const index = this.#messageOrder.indexOf(messageId);

    if (index > -1) {
      this.#messageOrder.splice(index, 1);
    }
  }

  /**
   * Retourne le nombre de messages actuellement en cache (pour debug/monitoring)
   */
  getCacheSize(): number {
    return this.#messages.size;
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);

    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'file') {
      const filePath = this.#extractAttribute(actionTag, 'filePath') as string;

      if (!filePath) {
        logger.debug('File path not specified');
      }

      (actionAttributes as FileAction).filePath = filePath;
    } else if (actionType === 'git') {
      const operation = this.#extractAttribute(actionTag, 'operation') as GitOperation;

      if (!operation) {
        logger.warn('Git operation not specified');
      }

      const gitAction = actionAttributes as GitAction;
      gitAction.operation = operation;

      // extract optional git attributes
      const url = this.#extractAttribute(actionTag, 'url');
      const message = this.#extractAttribute(actionTag, 'message');
      const remote = this.#extractAttribute(actionTag, 'remote');
      const branch = this.#extractAttribute(actionTag, 'branch');
      const filepath = this.#extractAttribute(actionTag, 'filepath');
      const token = this.#extractAttribute(actionTag, 'token');

      if (url) {
        gitAction.url = url;
      }

      if (message) {
        gitAction.message = message;
      }

      if (remote) {
        gitAction.remote = remote;
      }

      if (branch) {
        gitAction.branch = branch;
      }

      if (filepath) {
        gitAction.filepath = filepath;
      }

      if (token) {
        gitAction.token = token;
      }
    } else if (actionType === 'python') {
      const packagesAttr = this.#extractAttribute(actionTag, 'packages');
      const pythonAction = actionAttributes as PythonAction;

      if (packagesAttr) {
        pythonAction.packages = packagesAttr.split(',').map((p) => p.trim());
      }
    } else if (actionType === 'github') {
      const operation = this.#extractAttribute(actionTag, 'operation') as GitHubOperation;

      if (!operation) {
        logger.warn('GitHub operation not specified');
      }

      const githubAction = actionAttributes as GitHubAction;
      githubAction.operation = operation;

      // extract github attributes
      const owner = this.#extractAttribute(actionTag, 'owner');
      const repo = this.#extractAttribute(actionTag, 'repo');
      const title = this.#extractAttribute(actionTag, 'title');
      const body = this.#extractAttribute(actionTag, 'body');
      const head = this.#extractAttribute(actionTag, 'head');
      const base = this.#extractAttribute(actionTag, 'base');
      const labels = this.#extractAttribute(actionTag, 'labels');
      const state = this.#extractAttribute(actionTag, 'state') as 'open' | 'closed' | 'all' | undefined;

      if (owner) {
        githubAction.owner = owner;
      }

      if (repo) {
        githubAction.repo = repo;
      }

      if (title) {
        githubAction.title = title;
      }

      if (body) {
        githubAction.body = body;
      }

      if (head) {
        githubAction.head = head;
      }

      if (base) {
        githubAction.base = base;
      }

      if (labels) {
        githubAction.labels = labels.split(',').map((l) => l.trim());
      }

      if (state) {
        githubAction.state = state;
      }
    } else if (actionType !== 'shell') {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as FileAction | ShellAction | GitAction | PythonAction | GitHubAction;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    // Utiliser le cache de regex pré-compilées si disponible
    let regex = ATTRIBUTE_REGEX_CACHE.get(attributeName);

    if (!regex) {
      // Fallback pour attributs inconnus (rare)
      regex = new RegExp(`${attributeName}="([^"]*)"`, 'i');
    }

    const match = tag.match(regex);

    return match ? match[1] : undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__boltArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
