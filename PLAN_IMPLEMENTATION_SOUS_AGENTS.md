# Plan d'Implémentation des Sous-Agents BAVINI

> **Document de planification** - Version 1.0
> Date : Décembre 2025
> Statut : EN ATTENTE DE VALIDATION

---

## Table des Matières

1. [Vue d'Ensemble](#1-vue-densemble)
2. [Architecture Cible](#2-architecture-cible)
3. [Roadmap par Phases](#3-roadmap-par-phases)
4. [Phase 1 : Fondations](#4-phase-1--fondations)
5. [Phase 2 : Agents Core](#5-phase-2--agents-core)
6. [Phase 3 : Orchestration Complète](#6-phase-3--orchestration-complète)
7. [Phase 4 : Fonctionnalités Avancées](#7-phase-4--fonctionnalités-avancées)
8. [Spécifications Techniques](#8-spécifications-techniques)
9. [Tests et Validation](#9-tests-et-validation)
10. [Risques et Mitigations](#10-risques-et-mitigations)

---

## 1. Vue d'Ensemble

### 1.1 Objectif

Implémenter un système de sous-agents pour BAVINI permettant :
- **Parallélisation** des tâches indépendantes
- **Spécialisation** des agents par domaine
- **Isolation de contexte** pour éviter la pollution
- **Meilleure qualité** des résultats (+90% selon benchmarks)
- **Rapidité** accrue (3-4x plus rapide)

### 1.2 Sous-Agents à Implémenter

| Priorité | Agent | Rôle | Phase |
|----------|-------|------|-------|
| P0 | **Orchestrator** | Coordonne tous les agents | Phase 1 |
| P0 | **Explore** | Recherche dans le code (read-only) | Phase 1 |
| P1 | **Coder** | Écrit et modifie le code | Phase 2 |
| P1 | **Builder** | Exécute les commandes shell/npm | Phase 2 |
| P2 | **Tester** | Lance les tests, valide le code | Phase 3 |
| P2 | **Deployer** | Git, GitHub, déploiement | Phase 3 |
| P3 | **Reviewer** | Review automatique du code | Phase 4 |
| P3 | **Fixer** | Récupération intelligente d'erreurs | Phase 4 |

### 1.3 Métriques de Succès

| Métrique | Objectif | Mesure |
|----------|----------|--------|
| Temps de réponse | -40% | Benchmark avant/après |
| Qualité code généré | +30% | Tests passants |
| Taux d'erreurs | -50% | Logs d'erreurs |
| Parallélisation | 3+ agents simultanés | Monitoring |

---

## 2. Architecture Cible

### 2.1 Diagramme d'Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              BAVINI UI                                   │
│                     (React + Nanostores existant)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API LAYER                                      │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  /api/chat       │    │  /api/agents     │    │  /api/tasks      │  │
│  │  (existant)      │    │  (nouveau)       │    │  (nouveau)       │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR LAYER                               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Orchestrator Agent                           │ │
│  │                         (Claude Sonnet)                             │ │
│  │                                                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │ │
│  │  │ Task        │  │ Agent       │  │ Result      │                │ │
│  │  │ Decomposer  │  │ Router      │  │ Aggregator  │                │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SUB-AGENTS LAYER                                │
│                                                                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ │
│  │  Explore  │ │   Coder   │ │  Builder  │ │  Tester   │ │ Deployer  │ │
│  │   Agent   │ │   Agent   │ │   Agent   │ │   Agent   │ │   Agent   │ │
│  │           │ │           │ │           │ │           │ │           │ │
│  │  Haiku    │ │  Sonnet   │ │  Sonnet   │ │  Haiku    │ │  Sonnet   │ │
│  │           │ │           │ │           │ │           │ │           │ │
│  │ Read-Only │ │ Read/Write│ │  Execute  │ │  Execute  │ │ Git/Deploy│ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           TOOLS LAYER                                    │
│                                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │   Read   │ │  Write   │ │  Shell   │ │   Git    │ │  GitHub  │      │
│  │  Tools   │ │  Tools   │ │  Tools   │ │  Tools   │ │   API    │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                                          │
│                    (Réutilise WebContainer existant)                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Structure des Fichiers

```
app/
├── lib/
│   ├── agents/                          # NOUVEAU - Système d'agents
│   │   ├── index.ts                     # Export principal
│   │   ├── types.ts                     # Types & interfaces
│   │   │
│   │   ├── core/                        # Noyau du système
│   │   │   ├── orchestrator.ts          # Agent orchestrateur
│   │   │   ├── base-agent.ts            # Classe abstraite des agents
│   │   │   ├── agent-registry.ts        # Registre des agents
│   │   │   ├── task-queue.ts            # Queue de tâches
│   │   │   ├── task-decomposer.ts       # Décomposition des tâches
│   │   │   ├── result-aggregator.ts     # Agrégation des résultats
│   │   │   └── context-manager.ts       # Gestion des contextes isolés
│   │   │
│   │   ├── agents/                      # Sous-agents spécialisés
│   │   │   ├── explore-agent.ts         # Agent d'exploration
│   │   │   ├── coder-agent.ts           # Agent de code
│   │   │   ├── builder-agent.ts         # Agent de build
│   │   │   ├── tester-agent.ts          # Agent de test
│   │   │   ├── deployer-agent.ts        # Agent de déploiement
│   │   │   ├── reviewer-agent.ts        # Agent de review (Phase 4)
│   │   │   └── fixer-agent.ts           # Agent de correction (Phase 4)
│   │   │
│   │   ├── tools/                       # Outils des agents
│   │   │   ├── index.ts                 # Export des outils
│   │   │   ├── read-tools.ts            # Lecture fichiers
│   │   │   ├── write-tools.ts           # Écriture fichiers
│   │   │   ├── shell-tools.ts           # Commandes shell
│   │   │   ├── git-tools.ts             # Opérations Git
│   │   │   ├── github-tools.ts          # API GitHub
│   │   │   └── test-tools.ts            # Exécution de tests
│   │   │
│   │   ├── prompts/                     # System prompts des agents
│   │   │   ├── orchestrator-prompt.ts   # Prompt orchestrateur
│   │   │   ├── explore-prompt.ts        # Prompt exploration
│   │   │   ├── coder-prompt.ts          # Prompt codeur
│   │   │   ├── builder-prompt.ts        # Prompt builder
│   │   │   ├── tester-prompt.ts         # Prompt testeur
│   │   │   └── deployer-prompt.ts       # Prompt déploiement
│   │   │
│   │   └── utils/                       # Utilitaires
│   │       ├── parallel-executor.ts     # Exécution parallèle
│   │       ├── dependency-resolver.ts   # Résolution dépendances
│   │       ├── checkpoint-manager.ts    # Sauvegarde progression
│   │       └── agent-logger.ts          # Logging centralisé
│   │
│   ├── stores/
│   │   ├── agents.ts                    # NOUVEAU - Store des agents
│   │   └── tasks.ts                     # NOUVEAU - Store des tâches
│   │
│   └── runtime/
│       └── action-runner.ts             # MODIFIER - Intégrer les agents
│
├── routes/
│   ├── api.agents.ts                    # NOUVEAU - API agents
│   └── api.tasks.ts                     # NOUVEAU - API tâches
│
└── components/
    └── agents/                          # NOUVEAU - UI agents
        ├── AgentPanel.tsx               # Panel de visualisation
        ├── AgentStatus.tsx              # Statut d'un agent
        ├── TaskProgress.tsx             # Progression des tâches
        └── AgentLogs.tsx                # Logs des agents
```

---

## 3. Roadmap par Phases

### 3.1 Vue Globale

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           ROADMAP BAVINI SUB-AGENTS                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: Fondations          PHASE 2: Core           PHASE 3: Complet     │
│  ─────────────────────        ────────────────        ─────────────────    │
│                                                                             │
│  ┌─────────────────┐         ┌─────────────────┐     ┌─────────────────┐   │
│  │ • Types/Interfaces│       │ • Coder Agent   │     │ • Tester Agent  │   │
│  │ • Base Agent     │        │ • Builder Agent │     │ • Deployer Agent│   │
│  │ • Orchestrator   │        │ • Write Tools   │     │ • Full UI       │   │
│  │ • Explore Agent  │        │ • Shell Tools   │     │ • Monitoring    │   │
│  │ • Read Tools     │        │ • Task Queue    │     │ • Checkpoints   │   │
│  │ • Agent Registry │        │ • Parallel Exec │     │ • Error Recovery│   │
│  │ • Basic UI       │        │ • Dependencies  │     │ • Git Tools     │   │
│  └─────────────────┘         └─────────────────┘     └─────────────────┘   │
│           │                           │                       │            │
│           ▼                           ▼                       ▼            │
│      MVP Fonctionnel           Core Complet            Production Ready    │
│                                                                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 4: Avancé (Optionnel)                                               │
│  ────────────────────────────                                               │
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │ • Reviewer Agent│                                                       │
│  │ • Fixer Agent   │                                                       │
│  │ • Swarm Pattern │                                                       │
│  │ • Auto-scaling  │                                                       │
│  │ • Analytics     │                                                       │
│  └─────────────────┘                                                       │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Dépendances entre Phases

```
Phase 1 (Fondations)
    │
    ├── Types & Interfaces ──────────────────────────────────┐
    │                                                         │
    ├── Base Agent ──────────────────┬───────────────────────┤
    │                                │                        │
    ├── Agent Registry ──────────────┤                        │
    │                                │                        │
    ├── Orchestrator ────────────────┤                        │
    │                                │                        │
    └── Explore Agent ───────────────┘                        │
                                     │                        │
                                     ▼                        │
                              Phase 2 (Core)                  │
                                     │                        │
                                     ├── Coder Agent ─────────┤
                                     │                        │
                                     ├── Builder Agent ───────┤
                                     │                        │
                                     ├── Task Queue ──────────┤
                                     │                        │
                                     └── Parallel Executor ───┤
                                                              │
                                                              ▼
                                                       Phase 3 (Complet)
                                                              │
                                                              ├── Tester Agent
                                                              │
                                                              ├── Deployer Agent
                                                              │
                                                              └── Error Recovery
                                                                     │
                                                                     ▼
                                                              Phase 4 (Avancé)
```

---

## 4. Phase 1 : Fondations

### 4.1 Objectifs

- Établir l'architecture de base des agents
- Implémenter l'Explore Agent (premier sous-agent)
- Créer l'Orchestrator minimal
- Permettre la délégation de tâches simples

### 4.2 Tâches Détaillées

#### 4.2.1 Types et Interfaces

**Fichier : `app/lib/agents/types.ts`**

```typescript
// Types principaux à implémenter

export type AgentModel = 'haiku' | 'sonnet' | 'opus';

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'waiting'
  | 'completed'
  | 'failed';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentConfig {
  name: string;
  description: string;
  model: AgentModel;
  tools: ToolDefinition[];
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface Task {
  id: string;
  type: string;
  prompt: string;
  context?: TaskContext;
  dependencies?: string[];
  priority?: number;
  timeout?: number;
  assignedAgent?: string;
  status: TaskStatus;
  result?: TaskResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TaskContext {
  files?: string[];           // Fichiers pertinents
  codeSnippets?: string[];    // Extraits de code
  previousResults?: any[];    // Résultats précédents
  userPreferences?: object;   // Préférences utilisateur
}

export interface TaskResult {
  success: boolean;
  output: string;
  artifacts?: Artifact[];
  errors?: AgentError[];
  metrics?: TaskMetrics;
}

export interface Artifact {
  type: 'file' | 'code' | 'command' | 'message';
  path?: string;
  content: string;
  language?: string;
}

export interface AgentError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

export interface TaskMetrics {
  tokensUsed: number;
  executionTime: number;
  toolCalls: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  handler: (input: any) => Promise<any>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: object;
}

export interface ToolResult {
  toolCallId: string;
  output: any;
  error?: string;
}
```

**Checklist :**
- [ ] Définir tous les types d'agents
- [ ] Définir les interfaces de tâches
- [ ] Définir les interfaces de résultats
- [ ] Définir les interfaces d'outils
- [ ] Ajouter les types d'erreurs
- [ ] Exporter depuis index.ts

---

#### 4.2.2 Classe Base Agent

**Fichier : `app/lib/agents/core/base-agent.ts`**

```typescript
// Structure de la classe abstraite

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected status: AgentStatus = 'idle';
  protected currentTask: Task | null = null;
  protected messageHistory: AgentMessage[] = [];
  protected abortController: AbortController | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  // Méthodes abstraites à implémenter par chaque agent
  abstract execute(task: Task): Promise<TaskResult>;
  abstract getSystemPrompt(): string;

  // Méthodes communes
  async run(task: Task): Promise<TaskResult> {
    // 1. Initialiser le contexte
    // 2. Appeler execute()
    // 3. Gérer les erreurs
    // 4. Retourner le résultat
  }

  abort(): void {
    // Annuler l'exécution en cours
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  protected async callLLM(messages: AgentMessage[]): Promise<string> {
    // Appel à Claude avec le modèle configuré
  }

  protected async executeTool(tool: string, input: object): Promise<any> {
    // Exécuter un outil
  }

  protected log(level: string, message: string, data?: object): void {
    // Logging centralisé
  }
}
```

**Checklist :**
- [ ] Implémenter le constructeur
- [ ] Implémenter run() avec gestion d'erreurs
- [ ] Implémenter abort()
- [ ] Implémenter callLLM() avec streaming
- [ ] Implémenter executeTool()
- [ ] Ajouter le logging
- [ ] Ajouter les métriques
- [ ] Tests unitaires

---

#### 4.2.3 Agent Registry

**Fichier : `app/lib/agents/core/agent-registry.ts`**

```typescript
// Registre des agents disponibles

export class AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();
  private static instance: AgentRegistry;

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  register(name: string, agent: BaseAgent): void {
    // Enregistrer un agent
  }

  unregister(name: string): void {
    // Supprimer un agent
  }

  get(name: string): BaseAgent | undefined {
    // Récupérer un agent
  }

  getAll(): Map<string, BaseAgent> {
    // Récupérer tous les agents
  }

  getByCapability(capability: string): BaseAgent[] {
    // Trouver les agents avec une capacité
  }

  getAvailable(): BaseAgent[] {
    // Agents disponibles (status = idle)
  }
}
```

**Checklist :**
- [ ] Implémenter le singleton
- [ ] Implémenter register/unregister
- [ ] Implémenter get/getAll
- [ ] Implémenter getByCapability
- [ ] Implémenter getAvailable
- [ ] Tests unitaires

---

#### 4.2.4 Explore Agent

**Fichier : `app/lib/agents/agents/explore-agent.ts`**

```typescript
// Premier sous-agent : exploration read-only

export class ExploreAgent extends BaseAgent {
  constructor() {
    super({
      name: 'explore',
      description: 'Agent spécialisé dans l\'exploration du codebase. ' +
                   'Recherche de fichiers, patterns, et analyse de code. ' +
                   'Accès en lecture seule.',
      model: 'haiku',  // Rapide et économique
      tools: [
        ReadFileTool,
        GrepTool,
        GlobTool,
        ListDirectoryTool,
      ],
      systemPrompt: EXPLORE_SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.1,  // Déterministe
    });
  }

  async execute(task: Task): Promise<TaskResult> {
    // 1. Analyser la demande d'exploration
    // 2. Planifier les recherches nécessaires
    // 3. Exécuter les outils de lecture
    // 4. Synthétiser les résultats
    // 5. Retourner un rapport structuré
  }

  getSystemPrompt(): string {
    return EXPLORE_SYSTEM_PROMPT;
  }
}
```

**Fichier : `app/lib/agents/prompts/explore-prompt.ts`**

```typescript
export const EXPLORE_SYSTEM_PROMPT = `
Tu es un agent d'exploration spécialisé dans l'analyse de code.

## Ton Rôle
- Explorer et analyser le codebase
- Trouver des fichiers, patterns, et structures
- Répondre aux questions sur le code existant
- Identifier les dépendances et relations

## Tes Capacités
- Lire des fichiers (Read)
- Rechercher avec des patterns (Grep)
- Lister des fichiers (Glob)
- Naviguer dans les dossiers (List)

## Contraintes
- Tu es en LECTURE SEULE
- Tu ne peux PAS modifier de fichiers
- Tu ne peux PAS exécuter de commandes
- Retourne des résultats structurés et concis

## Format de Réponse
Retourne toujours un JSON structuré :
{
  "summary": "Résumé de ce que tu as trouvé",
  "findings": [
    {
      "file": "chemin/fichier.ts",
      "line": 42,
      "description": "Ce que tu as trouvé"
    }
  ],
  "recommendations": ["Suggestions si pertinent"]
}
`;
```

**Checklist :**
- [ ] Implémenter ExploreAgent
- [ ] Créer le system prompt
- [ ] Implémenter les 4 outils (Read, Grep, Glob, List)
- [ ] Gérer le format de réponse JSON
- [ ] Tests unitaires
- [ ] Tests d'intégration

---

#### 4.2.5 Read Tools

**Fichier : `app/lib/agents/tools/read-tools.ts`**

```typescript
// Outils de lecture pour l'Explore Agent

export const ReadFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Lire le contenu d\'un fichier',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Chemin du fichier' },
      startLine: { type: 'number', description: 'Ligne de début (optionnel)' },
      endLine: { type: 'number', description: 'Ligne de fin (optionnel)' },
    },
    required: ['path'],
  },
  handler: async ({ path, startLine, endLine }) => {
    // Implémenter avec WebContainer fs
  },
};

export const GrepTool: ToolDefinition = {
  name: 'grep',
  description: 'Rechercher un pattern dans les fichiers',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Pattern regex à rechercher' },
      path: { type: 'string', description: 'Dossier de recherche' },
      filePattern: { type: 'string', description: 'Pattern de fichiers (ex: *.ts)' },
      maxResults: { type: 'number', description: 'Nombre max de résultats' },
    },
    required: ['pattern'],
  },
  handler: async ({ pattern, path, filePattern, maxResults }) => {
    // Implémenter la recherche
  },
};

export const GlobTool: ToolDefinition = {
  name: 'glob',
  description: 'Trouver des fichiers par pattern',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Pattern glob (ex: **/*.ts)' },
      cwd: { type: 'string', description: 'Dossier de base' },
    },
    required: ['pattern'],
  },
  handler: async ({ pattern, cwd }) => {
    // Implémenter avec glob
  },
};

export const ListDirectoryTool: ToolDefinition = {
  name: 'list_directory',
  description: 'Lister le contenu d\'un dossier',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Chemin du dossier' },
      recursive: { type: 'boolean', description: 'Récursif ou non' },
    },
    required: ['path'],
  },
  handler: async ({ path, recursive }) => {
    // Implémenter avec WebContainer fs
  },
};
```

**Checklist :**
- [ ] Implémenter ReadFileTool
- [ ] Implémenter GrepTool
- [ ] Implémenter GlobTool
- [ ] Implémenter ListDirectoryTool
- [ ] Intégrer avec WebContainer
- [ ] Gérer les erreurs (fichier non trouvé, etc.)
- [ ] Tests unitaires

---

#### 4.2.6 Orchestrator (Minimal)

**Fichier : `app/lib/agents/core/orchestrator.ts`**

```typescript
// Orchestrateur minimal pour Phase 1

export class Orchestrator extends BaseAgent {
  private registry: AgentRegistry;

  constructor() {
    super({
      name: 'orchestrator',
      description: 'Agent principal qui coordonne les sous-agents',
      model: 'sonnet',
      tools: [
        DelegateToAgentTool,
        GetAgentStatusTool,
      ],
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    });
    this.registry = AgentRegistry.getInstance();
  }

  async execute(task: Task): Promise<TaskResult> {
    // Phase 1 : Logique simple
    // 1. Analyser la tâche
    // 2. Déterminer quel agent utiliser
    // 3. Déléguer à l'agent approprié
    // 4. Retourner le résultat
  }

  async delegateToAgent(agentName: string, task: Task): Promise<TaskResult> {
    const agent = this.registry.get(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }
    return agent.run(task);
  }

  getSystemPrompt(): string {
    return ORCHESTRATOR_SYSTEM_PROMPT;
  }
}
```

**Checklist :**
- [ ] Implémenter Orchestrator de base
- [ ] Créer le system prompt
- [ ] Implémenter delegateToAgent
- [ ] Intégrer avec AgentRegistry
- [ ] Tests unitaires

---

#### 4.2.7 Store des Agents

**Fichier : `app/lib/stores/agents.ts`**

```typescript
import { atom, map } from 'nanostores';

// État global des agents
export const agentsStatus = map<Record<string, AgentStatus>>({});
export const activeAgents = atom<string[]>([]);
export const agentLogs = map<Record<string, LogEntry[]>>({});

// Actions
export function updateAgentStatus(name: string, status: AgentStatus) {
  agentsStatus.setKey(name, status);
}

export function addAgentLog(name: string, log: LogEntry) {
  const current = agentLogs.get()[name] || [];
  agentLogs.setKey(name, [...current.slice(-99), log]);  // Keep last 100
}

export function setActiveAgents(agents: string[]) {
  activeAgents.set(agents);
}
```

**Checklist :**
- [ ] Créer agentsStatus store
- [ ] Créer activeAgents store
- [ ] Créer agentLogs store
- [ ] Implémenter les actions
- [ ] Intégrer avec le workbench existant

---

#### 4.2.8 UI Basique

**Fichier : `app/components/agents/AgentStatus.tsx`**

```tsx
// Composant simple pour afficher le statut d'un agent

export function AgentStatus({ agentName }: { agentName: string }) {
  const status = useStore(agentsStatus)[agentName];

  return (
    <div className="flex items-center gap-2">
      <StatusIndicator status={status} />
      <span>{agentName}</span>
      <span className="text-gray-500">{status}</span>
    </div>
  );
}

function StatusIndicator({ status }: { status: AgentStatus }) {
  const colors = {
    idle: 'bg-gray-400',
    thinking: 'bg-yellow-400 animate-pulse',
    executing: 'bg-blue-400 animate-pulse',
    completed: 'bg-green-400',
    failed: 'bg-red-400',
  };

  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />;
}
```

**Checklist :**
- [ ] Créer AgentStatus.tsx
- [ ] Créer AgentPanel.tsx (liste des agents)
- [ ] Intégrer dans le workbench
- [ ] Ajouter les animations
- [ ] Tests de composants

---

### 4.3 Livrables Phase 1

| Livrable | Description | Critère de validation |
|----------|-------------|----------------------|
| Types complets | Toutes les interfaces | Compile sans erreur |
| BaseAgent | Classe abstraite fonctionnelle | Tests passent |
| AgentRegistry | Singleton fonctionnel | Tests passent |
| ExploreAgent | Agent d'exploration | Peut explorer le code |
| Read Tools | 4 outils de lecture | Intégrés avec WebContainer |
| Orchestrator minimal | Délégation simple | Peut déléguer à Explore |
| Store agents | État Nanostores | Réactif dans l'UI |
| UI basique | Affichage statut | Visible dans workbench |

---

## 5. Phase 2 : Agents Core

### 5.1 Objectifs

- Implémenter Coder Agent (lecture/écriture)
- Implémenter Builder Agent (shell/npm)
- Créer la Task Queue pour la parallélisation
- Implémenter l'exécution parallèle
- Gérer les dépendances entre tâches

### 5.2 Tâches Détaillées

#### 5.2.1 Coder Agent

**Fichier : `app/lib/agents/agents/coder-agent.ts`**

```typescript
export class CoderAgent extends BaseAgent {
  constructor() {
    super({
      name: 'coder',
      description: 'Agent spécialisé dans l\'écriture et modification de code. ' +
                   'Peut créer, modifier, et refactorer des fichiers.',
      model: 'sonnet',
      tools: [
        ReadFileTool,
        WriteFileTool,
        EditFileTool,
        CreateFileTool,
        DeleteFileTool,
      ],
      systemPrompt: CODER_SYSTEM_PROMPT,
      maxTokens: 8192,
      temperature: 0.2,
    });
  }

  async execute(task: Task): Promise<TaskResult> {
    // 1. Comprendre les modifications demandées
    // 2. Lire les fichiers concernés
    // 3. Planifier les modifications
    // 4. Exécuter les modifications
    // 5. Valider les changements
    // 6. Retourner les artifacts créés
  }
}
```

**Checklist :**
- [ ] Implémenter CoderAgent
- [ ] Créer le system prompt
- [ ] Implémenter WriteFileTool
- [ ] Implémenter EditFileTool
- [ ] Implémenter CreateFileTool
- [ ] Implémenter DeleteFileTool
- [ ] Tests unitaires
- [ ] Tests d'intégration

---

#### 5.2.2 Builder Agent

**Fichier : `app/lib/agents/agents/builder-agent.ts`**

```typescript
export class BuilderAgent extends BaseAgent {
  constructor() {
    super({
      name: 'builder',
      description: 'Agent spécialisé dans l\'exécution de commandes. ' +
                   'npm, build, scripts, démarrage de serveurs.',
      model: 'sonnet',
      tools: [
        ShellCommandTool,
        NpmTool,
        ProcessManagerTool,
      ],
      systemPrompt: BUILDER_SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.1,
    });
  }

  async execute(task: Task): Promise<TaskResult> {
    // 1. Analyser la commande demandée
    // 2. Vérifier la sécurité
    // 3. Exécuter la commande
    // 4. Capturer stdout/stderr
    // 5. Retourner le résultat
  }
}
```

**Checklist :**
- [ ] Implémenter BuilderAgent
- [ ] Créer le system prompt
- [ ] Implémenter ShellCommandTool
- [ ] Implémenter NpmTool
- [ ] Implémenter ProcessManagerTool
- [ ] Sécuriser les commandes dangereuses
- [ ] Tests unitaires

---

#### 5.2.3 Task Queue

**Fichier : `app/lib/agents/core/task-queue.ts`**

```typescript
export class TaskQueue {
  private queue: Task[] = [];
  private running: Map<string, Task> = new Map();
  private maxConcurrent: number = 3;
  private subscribers: Set<(event: QueueEvent) => void> = new Set();

  async add(task: Task): Promise<void> {
    // Ajouter à la queue avec priorité
  }

  async process(): Promise<void> {
    // Traiter les tâches de la queue
    // Respecter maxConcurrent
    // Gérer les dépendances
  }

  async cancel(taskId: string): Promise<void> {
    // Annuler une tâche
  }

  getStatus(): QueueStatus {
    // Retourner l'état de la queue
  }

  subscribe(callback: (event: QueueEvent) => void): () => void {
    // S'abonner aux événements
  }
}
```

**Checklist :**
- [ ] Implémenter TaskQueue
- [ ] Gestion des priorités
- [ ] Limite de concurrence
- [ ] Événements de progression
- [ ] Tests unitaires

---

#### 5.2.4 Parallel Executor

**Fichier : `app/lib/agents/utils/parallel-executor.ts`**

```typescript
export class ParallelExecutor {
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  async executeAll(tasks: Task[], agents: Map<string, BaseAgent>): Promise<TaskResult[]> {
    // 1. Identifier les tâches parallélisables
    // 2. Grouper par dépendances
    // 3. Exécuter en parallèle (max concurrent)
    // 4. Attendre et collecter les résultats
  }

  async executeWithDependencies(
    tasks: Task[],
    agents: Map<string, BaseAgent>
  ): Promise<TaskResult[]> {
    // Exécuter en respectant les dépendances
  }
}
```

**Checklist :**
- [ ] Implémenter ParallelExecutor
- [ ] Implémenter executeAll
- [ ] Implémenter executeWithDependencies
- [ ] Gestion des erreurs partielles
- [ ] Tests unitaires

---

#### 5.2.5 Dependency Resolver

**Fichier : `app/lib/agents/utils/dependency-resolver.ts`**

```typescript
export class DependencyResolver {
  resolve(tasks: Task[]): Task[][] {
    // Retourne les tâches groupées par niveau d'exécution
    // Niveau 0 : tâches sans dépendances
    // Niveau 1 : tâches dépendant du niveau 0
    // etc.
  }

  validate(tasks: Task[]): ValidationResult {
    // Vérifier qu'il n'y a pas de cycles
    // Vérifier que toutes les dépendances existent
  }

  private topologicalSort(tasks: Task[]): Task[] {
    // Tri topologique
  }
}
```

**Checklist :**
- [ ] Implémenter DependencyResolver
- [ ] Implémenter resolve
- [ ] Implémenter validate
- [ ] Détecter les cycles
- [ ] Tests unitaires

---

### 5.3 Livrables Phase 2

| Livrable | Description | Critère de validation |
|----------|-------------|----------------------|
| CoderAgent | Agent de code complet | Peut créer/modifier des fichiers |
| BuilderAgent | Agent de build | Peut exécuter npm et shell |
| Write Tools | Outils d'écriture | Intégrés avec WebContainer |
| Shell Tools | Outils shell | Sécurisés et fonctionnels |
| TaskQueue | Queue de tâches | Gère la concurrence |
| ParallelExecutor | Exécution parallèle | 3+ agents simultanés |
| DependencyResolver | Résolution dépendances | Détecte les cycles |

---

## 6. Phase 3 : Orchestration Complète

### 6.1 Objectifs

- Implémenter Tester Agent
- Implémenter Deployer Agent
- Compléter l'UI de monitoring
- Ajouter les checkpoints
- Implémenter la récupération d'erreurs

### 6.2 Tâches Détaillées

#### 6.2.1 Tester Agent

**Fichier : `app/lib/agents/agents/tester-agent.ts`**

```typescript
export class TesterAgent extends BaseAgent {
  constructor() {
    super({
      name: 'tester',
      description: 'Agent spécialisé dans l\'exécution de tests. ' +
                   'Lance les tests, analyse les résultats, suggère des corrections.',
      model: 'haiku',
      tools: [
        RunTestsTool,
        AnalyzeTestResultsTool,
        CoverageReportTool,
      ],
      systemPrompt: TESTER_SYSTEM_PROMPT,
    });
  }
}
```

**Checklist :**
- [ ] Implémenter TesterAgent
- [ ] Implémenter RunTestsTool (jest, vitest)
- [ ] Implémenter AnalyzeTestResultsTool
- [ ] Implémenter CoverageReportTool
- [ ] Tests unitaires

---

#### 6.2.2 Deployer Agent

**Fichier : `app/lib/agents/agents/deployer-agent.ts`**

```typescript
export class DeployerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'deployer',
      description: 'Agent spécialisé dans le déploiement. ' +
                   'Git, GitHub, Netlify, Vercel.',
      model: 'sonnet',
      tools: [
        GitCloneTool,
        GitCommitTool,
        GitPushTool,
        GitPullTool,
        GitBranchTool,
        GitHubCreateRepoTool,
        GitHubCreatePRTool,
      ],
      systemPrompt: DEPLOYER_SYSTEM_PROMPT,
    });
  }
}
```

**Checklist :**
- [ ] Implémenter DeployerAgent
- [ ] Implémenter tous les Git Tools
- [ ] Implémenter les GitHub Tools
- [ ] Intégrer avec isomorphic-git existant
- [ ] Tests unitaires

---

#### 6.2.3 Checkpoint Manager

**Fichier : `app/lib/agents/utils/checkpoint-manager.ts`**

```typescript
export class CheckpointManager {
  private storage: PersistentStorage;

  async saveCheckpoint(taskId: string, state: CheckpointState): Promise<void> {
    // Sauvegarder l'état courant
  }

  async loadCheckpoint(taskId: string): Promise<CheckpointState | null> {
    // Charger un checkpoint
  }

  async resumeFromCheckpoint(taskId: string): Promise<Task> {
    // Reprendre une tâche depuis un checkpoint
  }

  async deleteCheckpoint(taskId: string): Promise<void> {
    // Supprimer un checkpoint
  }
}
```

**Checklist :**
- [ ] Implémenter CheckpointManager
- [ ] Intégrer avec PGlite existant
- [ ] Sauvegardes automatiques
- [ ] Tests unitaires

---

#### 6.2.4 Error Recovery

**Fichier : `app/lib/agents/utils/error-recovery.ts`**

```typescript
export class ErrorRecovery {
  async handleError(error: AgentError, task: Task): Promise<RecoveryAction> {
    // Analyser l'erreur
    // Déterminer si récupérable
    // Proposer une action de récupération
  }

  async retry(task: Task, maxRetries: number = 3): Promise<TaskResult> {
    // Réessayer une tâche
  }

  async fallback(task: Task, fallbackAgent: string): Promise<TaskResult> {
    // Déléguer à un agent de fallback
  }
}
```

**Checklist :**
- [ ] Implémenter ErrorRecovery
- [ ] Classification des erreurs
- [ ] Stratégies de retry
- [ ] Agents de fallback
- [ ] Tests unitaires

---

#### 6.2.5 UI Complète

**Fichiers à créer :**

```
app/components/agents/
├── AgentPanel.tsx         # Panel principal avec tous les agents
├── TaskProgress.tsx       # Barre de progression des tâches
├── AgentLogs.tsx          # Logs en temps réel
├── AgentDetails.tsx       # Détails d'un agent
├── TaskQueue.tsx          # Visualisation de la queue
└── ParallelView.tsx       # Vue des agents en parallèle
```

**Checklist :**
- [ ] Créer AgentPanel.tsx
- [ ] Créer TaskProgress.tsx
- [ ] Créer AgentLogs.tsx
- [ ] Créer AgentDetails.tsx
- [ ] Créer TaskQueue.tsx
- [ ] Créer ParallelView.tsx
- [ ] Intégrer dans le workbench
- [ ] Tests de composants

---

### 6.3 Livrables Phase 3

| Livrable | Description | Critère de validation |
|----------|-------------|----------------------|
| TesterAgent | Agent de test | Peut lancer et analyser les tests |
| DeployerAgent | Agent de déploiement | Git et GitHub fonctionnels |
| CheckpointManager | Sauvegarde/reprise | Peut reprendre une tâche |
| ErrorRecovery | Récupération d'erreurs | Retry et fallback fonctionnels |
| UI complète | Monitoring complet | Tous les composants visibles |
| API agents | Endpoints REST | Fonctionnels et documentés |

---

## 7. Phase 4 : Fonctionnalités Avancées

### 7.1 Objectifs (Optionnel)

- Implémenter Reviewer Agent
- Implémenter Fixer Agent
- Pattern Swarm (handoffs directs)
- Auto-scaling des agents
- Analytics et métriques

### 7.2 Tâches Détaillées

#### 7.2.1 Reviewer Agent

```typescript
export class ReviewerAgent extends BaseAgent {
  // Review automatique du code généré
  // Suggestions d'améliorations
  // Détection de problèmes de sécurité
}
```

#### 7.2.2 Fixer Agent

```typescript
export class FixerAgent extends BaseAgent {
  // Correction automatique des erreurs
  // Basé sur les retours du Tester
  // Refactoring intelligent
}
```

#### 7.2.3 Swarm Pattern

```typescript
export class SwarmCoordinator {
  // Handoffs directs entre agents
  // Sans passer par l'orchestrateur
  // Plus rapide (-40% latence)
}
```

---

## 8. Spécifications Techniques

### 8.1 Configuration des Modèles

| Agent | Modèle | Max Tokens | Temperature | Justification |
|-------|--------|------------|-------------|---------------|
| Orchestrator | sonnet | 8192 | 0.3 | Équilibre qualité/coût |
| Explore | haiku | 4096 | 0.1 | Rapide, déterministe |
| Coder | sonnet | 8192 | 0.2 | Besoin de créativité contrôlée |
| Builder | sonnet | 4096 | 0.1 | Commandes précises |
| Tester | haiku | 4096 | 0.1 | Rapide, déterministe |
| Deployer | sonnet | 4096 | 0.1 | Opérations critiques |

### 8.2 Limites et Contraintes

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| Max agents parallèles | 5 | Éviter la surcharge |
| Max tâches en queue | 50 | Limite mémoire |
| Timeout par tâche | 5 min | Éviter les blocages |
| Max retries | 3 | Limite les boucles |
| Max tokens total/minute | 100k | Rate limiting API |

### 8.3 Format des Communications

**Requête à un agent :**
```json
{
  "taskId": "uuid",
  "type": "explore",
  "prompt": "Trouve tous les fichiers de configuration",
  "context": {
    "files": ["package.json", "tsconfig.json"],
    "codeSnippets": []
  },
  "dependencies": [],
  "priority": 1
}
```

**Réponse d'un agent :**
```json
{
  "taskId": "uuid",
  "success": true,
  "output": "Trouvé 5 fichiers de configuration",
  "artifacts": [
    {
      "type": "file",
      "path": "package.json",
      "content": "..."
    }
  ],
  "metrics": {
    "tokensUsed": 1234,
    "executionTime": 2500,
    "toolCalls": 3
  }
}
```

---

## 9. Tests et Validation

### 9.1 Stratégie de Tests

| Type | Couverture cible | Outils |
|------|------------------|--------|
| Unitaires | 80% | Vitest |
| Intégration | 60% | Vitest + MSW |
| E2E | Parcours critiques | Playwright |

### 9.2 Tests par Composant

**Phase 1 :**
```
tests/
├── agents/
│   ├── base-agent.test.ts
│   ├── explore-agent.test.ts
│   └── orchestrator.test.ts
├── core/
│   └── agent-registry.test.ts
└── tools/
    └── read-tools.test.ts
```

**Phase 2 :**
```
tests/
├── agents/
│   ├── coder-agent.test.ts
│   └── builder-agent.test.ts
├── core/
│   ├── task-queue.test.ts
│   └── parallel-executor.test.ts
└── tools/
    ├── write-tools.test.ts
    └── shell-tools.test.ts
```

### 9.3 Scénarios de Test E2E

1. **Exploration simple** : "Trouve le fichier package.json"
2. **Création de fichier** : "Crée un fichier hello.ts"
3. **Modification** : "Ajoute une fonction au fichier"
4. **Build** : "Lance npm install"
5. **Test** : "Lance les tests"
6. **Parallélisation** : "Explore + Code en parallèle"

---

## 10. Risques et Mitigations

### 10.1 Risques Identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Complexité excessive | Moyen | Haut | Approche incrémentale par phases |
| Performance dégradée | Moyen | Moyen | Benchmarks à chaque phase |
| Coûts API élevés | Haut | Moyen | Utiliser Haiku quand possible |
| Conflits de contexte | Faible | Haut | Isolation stricte des contextes |
| Boucles infinies | Faible | Haut | Timeouts et max retries |
| Erreurs non récupérables | Moyen | Moyen | Error recovery robuste |

### 10.2 Plan de Rollback

1. Chaque phase est indépendante
2. L'ancien système reste fonctionnel
3. Feature flags pour activer/désactiver
4. Possibilité de revenir à la version précédente

---

## 11. Prochaines Étapes

### Validation Requise

Avant de commencer l'implémentation, confirme :

- [ ] **Phase 1** : OK pour commencer ?
- [ ] **Architecture** : Structure des fichiers validée ?
- [ ] **Modèles** : Sonnet pour orchestrateur, Haiku pour explore ?
- [ ] **Limites** : 5 agents parallèles max OK ?
- [ ] **UI** : Intégration dans le workbench existant ?

### Questions Ouvertes

1. Veux-tu une API REST pour contrôler les agents externalement ?
2. Les logs des agents doivent-ils être persistés en base ?
3. Faut-il un mode "debug" avec logs verbeux ?
4. Veux-tu pouvoir créer des agents custom via fichiers markdown ?

---

> **Ce document est en attente de ta validation.**
> Une fois approuvé, l'implémentation commencera par la Phase 1.
