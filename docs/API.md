# BAVINI API Reference

Documentation complète des APIs REST, du système d'agents et des hooks React.

---

## Table des Matières

1. [REST API](#rest-api)
   - [POST /api/chat](#post-apichat)
   - [POST /api/agent](#post-apiagent)
   - [POST /api/enhancer](#post-apienhancer)
   - [GET /api/templates/:id](#get-apitemplatesid)
   - [Authentication APIs](#authentication-apis)
2. [Agent System API](#agent-system-api)
   - [AgentSystem Class](#agentsystem-class)
   - [BaseAgent Class](#baseagent-class)
   - [Specialized Agents](#specialized-agents)
3. [Stores API](#stores-api)
   - [chatStore](#chatstore)
   - [workbenchStore](#workbenchstore)
   - [agentLogsStore](#agentlogsstore)
4. [React Hooks](#react-hooks)
   - [useAgentChat](#useagentchat)
   - [useCheckpoints](#usecheckpoints)
   - [usePromptEnhancer](#usepromptenhancer)
   - [useMessageParser](#usemessageparser)

---

## REST API

### POST /api/chat

Endpoint principal pour les conversations avec l'IA.

#### Request

```typescript
interface ChatRequestBody {
  messages: Message[];
  mode?: 'chat' | 'agent';  // default: 'agent'
  context?: AgentContext;
  continuationContext?: ContinuationContext | null;
  multiAgent?: boolean;     // default: false
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AgentContext {
  files?: Record<string, string>;
  workdir?: string;
}
```

#### Response

Stream au format AI SDK (`text/plain; charset=utf-8`).

```
0:"Texte de la réponse"\n
0:"Suite du texte..."\n
```

#### Modes

| Mode | Description |
|------|-------------|
| `agent` | Mode complet avec génération de code et artifacts |
| `chat` | Mode analyse seule, sans modification de fichiers |

#### Exemple

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Crée une landing page' }],
    mode: 'agent',
    multiAgent: true
  })
});

const reader = response.body.getReader();
// Traiter le stream...
```

---

### POST /api/agent

Endpoint pour le système multi-agents.

#### Request

```typescript
interface AgentRequestBody {
  message: string;
  context?: Record<string, unknown>;
  controlMode?: 'strict' | 'moderate' | 'permissive';
  multiAgent?: boolean;
}
```

#### Response

Stream au format JSON Lines (`text/event-stream`).

```typescript
interface StreamChunk {
  type: 'text' | 'artifact' | 'agent_status' | 'error' | 'done';
  content?: string;
  artifact?: {
    type: 'file' | 'command' | 'analysis';
    path?: string;
    content: string;
    action?: 'created' | 'modified' | 'deleted' | 'executed';
  };
  agent?: string;
  status?: string;
  error?: string;
}
```

#### Control Modes

| Mode | Description |
|------|-------------|
| `strict` | Approbation requise pour toutes les actions |
| `moderate` | Approbation pour les actions sensibles uniquement |
| `permissive` | Auto-approbation des actions sûres |

#### Exemple

```typescript
const response = await fetch('/api/agent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Ajoute un composant Button',
    controlMode: 'moderate'
  })
});

const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = new TextDecoder().decode(value).split('\n');
  for (const line of lines) {
    if (line) {
      const chunk = JSON.parse(line);
      switch (chunk.type) {
        case 'text':
          console.log(chunk.content);
          break;
        case 'agent_status':
          console.log(`Agent ${chunk.agent}: ${chunk.status}`);
          break;
      }
    }
  }
}
```

---

### POST /api/enhancer

Améliore un prompt utilisateur.

#### Request

```typescript
interface EnhancerRequest {
  message: string;
}
```

#### Response

Stream du prompt amélioré (`text/plain`).

#### Exemple

```typescript
const response = await fetch('/api/enhancer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'faire un site' })
});

const enhancedPrompt = await response.text();
// "Créer un site web moderne et responsive avec..."
```

---

### GET /api/templates/:id

Récupère un template de projet.

#### Parameters

| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Identifiant du template |

#### Response

```typescript
interface Template {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
  commands?: string[];
}
```

---

### Authentication APIs

#### POST /api/auth/:provider

Initie l'authentification OAuth.

| Provider | Description |
|----------|-------------|
| `github` | GitHub OAuth |
| `google` | Google OAuth |

#### GET /api/auth/callback

Callback OAuth après authentification.

#### POST /api/auth/refresh

Rafraîchit le token d'accès.

---

## Agent System API

### AgentSystem Class

Point d'entrée principal du système multi-agents.

```typescript
class AgentSystem {
  constructor(config?: AgentSystemConfig);

  // Initialisation
  async initialize(): Promise<void>;

  // Exécution
  async process(
    message: string,
    options?: ProcessOptions
  ): Promise<AgentResponse>;

  // Gestion des agents
  getActiveAgents(): AgentType[];
  getAgentStatus(agent: AgentType): AgentStatus;

  // Arrêt
  async stop(): Promise<void>;
  async abortAll(): Promise<void>;
}

interface AgentSystemConfig {
  controlMode?: 'strict' | 'moderate' | 'permissive';
  maxConcurrentAgents?: number;
  timeout?: number;
}

type AgentType =
  | 'orchestrator'
  | 'explore'
  | 'coder'
  | 'builder'
  | 'tester'
  | 'deployer'
  | 'reviewer'
  | 'fixer';

type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'waiting_for_tool'
  | 'completed'
  | 'failed'
  | 'aborted';
```

### BaseAgent Class

Classe de base pour tous les agents.

```typescript
abstract class BaseAgent {
  readonly type: AgentType;
  readonly capabilities: string[];

  // Méthodes abstraites
  abstract process(input: AgentInput): Promise<AgentOutput>;
  abstract canHandle(task: Task): boolean;

  // Méthodes de contexte
  setContext(context: AgentContext): void;
  getContext(): AgentContext;

  // Logging
  protected log(level: LogLevel, message: string): void;

  // Lifecycle
  protected onStart(): void;
  protected onComplete(): void;
  protected onError(error: Error): void;
}
```

### Specialized Agents

| Agent | Description | Capabilities |
|-------|-------------|--------------|
| `OrchestratorAgent` | Coordonne les autres agents | Planification, délégation |
| `ExploreAgent` | Analyse le codebase | Lecture fichiers, recherche |
| `CoderAgent` | Écrit du code | Création/modification fichiers |
| `BuilderAgent` | Compile et bundle | npm, webpack, vite |
| `TesterAgent` | Exécute les tests | Jest, Vitest, Playwright |
| `DeployerAgent` | Déploie l'application | Build, preview |
| `ReviewerAgent` | Revue de code | Analyse qualité |
| `FixerAgent` | Corrige les bugs | Debug, hotfix |

---

## Stores API

### chatStore

État global du chat.

```typescript
import { chatStore, setChatMode, setControlMode } from '~/lib/stores/chat';

// Type
interface ChatState {
  mode: 'chat' | 'agent';
  controlMode: 'strict' | 'moderate' | 'permissive';
}

// Actions
setChatMode(mode: 'chat' | 'agent'): void;
setControlMode(mode: 'strict' | 'moderate' | 'permissive'): void;
approveAllActions(): void;
approveSelectedActions(actionIds: string[]): void;
rejectAllActions(): void;

// Usage avec React
import { useStore } from '@nanostores/react';

function ChatComponent() {
  const { mode, controlMode } = useStore(chatStore);
  // ...
}
```

### workbenchStore

État du workbench (IDE intégré).

```typescript
import { workbenchStore } from '~/lib/stores/workbench';

// Stores exposés
workbenchStore.showWorkbench   // atom<boolean>
workbenchStore.currentView     // atom<'code' | 'preview'>
workbenchStore.selectedFile    // atom<string | null>
workbenchStore.modifiedFiles   // map<string, string>
workbenchStore.unsavedChanges  // computed<boolean>

// Actions
workbenchStore.toggleWorkbench(): void;
workbenchStore.setCurrentView(view: 'code' | 'preview'): void;
workbenchStore.selectFile(path: string): void;
workbenchStore.updateFile(path: string, content: string): void;
workbenchStore.saveFile(path: string): Promise<void>;
```

### agentLogsStore

Logs du système d'agents.

```typescript
import {
  systemLogsStore,
  agentStatsStore,
  activeAgentsStore,
  activeAgentCountStore,
  addAgentLog,
  resetAgentStores
} from '~/lib/stores/agents';

// Types
interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  agentName?: AgentType;
  taskId?: string;
}

interface AgentStats {
  totalAgents: number;
  busyAgents: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
}

// Actions
addAgentLog(entry: LogEntry): void;
setAgentStatus(agent: AgentType, status: AgentStatus): void;
resetAgentStores(): void;
```

---

## React Hooks

### useAgentChat

Hook principal pour les conversations avec agents.

```typescript
import { useAgentChat } from '~/lib/hooks/useAgentChat';

function ChatComponent() {
  const {
    messages,
    input,
    setInput,
    isLoading,
    error,
    sendMessage,
    stop,
    reload,
    append,
  } = useAgentChat({
    mode: 'agent',
    multiAgent: true,
    onFinish: (message) => console.log('Done:', message),
    onError: (error) => console.error('Error:', error),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="submit" disabled={isLoading}>Envoyer</button>
      {isLoading && <button onClick={stop}>Stop</button>}
    </form>
  );
}
```

#### Options

```typescript
interface UseAgentChatOptions {
  mode?: 'chat' | 'agent';
  multiAgent?: boolean;
  controlMode?: 'strict' | 'moderate' | 'permissive';
  initialMessages?: Message[];
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
}
```

### useCheckpoints

Gestion des checkpoints pour la persistance.

```typescript
import { useCheckpoints } from '~/lib/hooks/useCheckpoints';

function HistoryComponent() {
  const {
    checkpoints,
    isLoading,
    error,
    createCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint,
  } = useCheckpoints();

  const handleSave = async () => {
    await createCheckpoint({
      chatId: 'current-chat',
      messages: currentMessages,
      metadata: { title: 'Mon checkpoint' }
    });
  };

  return (
    <ul>
      {checkpoints.map(cp => (
        <li key={cp.id}>
          {cp.metadata.title}
          <button onClick={() => restoreCheckpoint(cp.id)}>
            Restaurer
          </button>
        </li>
      ))}
    </ul>
  );
}
```

### usePromptEnhancer

Amélioration automatique des prompts.

```typescript
import { usePromptEnhancer } from '~/lib/hooks/usePromptEnhancer';

function PromptInput() {
  const [prompt, setPrompt] = useState('');
  const {
    enhance,
    isEnhancing,
    enhancedPrompt,
    error
  } = usePromptEnhancer();

  const handleEnhance = async () => {
    const result = await enhance(prompt);
    if (result) {
      setPrompt(result);
    }
  };

  return (
    <div>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} />
      <button onClick={handleEnhance} disabled={isEnhancing}>
        {isEnhancing ? 'Amélioration...' : 'Améliorer'}
      </button>
    </div>
  );
}
```

### useMessageParser

Parse les messages pour extraire les artifacts.

```typescript
import { useMessageParser } from '~/lib/hooks/useMessageParser';

function MessageDisplay({ content }: { content: string }) {
  const {
    parsedContent,
    artifacts,
    codeBlocks
  } = useMessageParser(content);

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: parsedContent }} />
      {artifacts.map(artifact => (
        <ArtifactPreview key={artifact.id} artifact={artifact} />
      ))}
    </div>
  );
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Succès |
| `400` | Requête invalide |
| `401` | Non authentifié |
| `403` | Non autorisé |
| `429` | Rate limit dépassé |
| `500` | Erreur serveur |

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}
```

---

## Rate Limiting

| Endpoint | Limite |
|----------|--------|
| `/api/chat` | 60 req/min |
| `/api/agent` | 30 req/min |
| `/api/enhancer` | 20 req/min |

---

## WebSocket Events (Future)

```typescript
// Événements prévus pour la v2
interface WebSocketEvents {
  'agent:status': { agent: AgentType; status: AgentStatus };
  'file:created': { path: string; content: string };
  'file:modified': { path: string; diff: string };
  'preview:ready': { url: string; port: number };
  'error': { message: string; code: string };
}
```
