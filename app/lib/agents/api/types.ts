/**
 * Types pour l'API Agent
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface FileContext {
  path: string;
  content?: string;
  type?: 'file' | 'folder';
}

export interface AgentRequestBody {
  message?: string;
  messages?: ChatMessage[];
  files?: FileContext[];
  context?: Record<string, unknown>;
  controlMode?: 'strict' | 'moderate' | 'permissive';
  multiAgent?: boolean;
}

export interface StreamChunk {
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

export type APIAgentType =
  | 'orchestrator'
  | 'explore'
  | 'coder'
  | 'builder'
  | 'tester'
  | 'deployer'
  | 'reviewer'
  | 'fixer';

export interface OrchestrationDecision {
  action: 'delegate' | 'decompose' | 'direct';
  targetAgent?: APIAgentType;
  subtasks?: Array<{
    agent: APIAgentType;
    task: string;
    dependsOn?: number[];
  }>;
  directResponse?: string;
  reasoning: string;
}

export interface DetectedError {
  type: 'typescript' | 'syntax' | 'runtime' | 'import' | 'build' | 'test';
  message: string;
  severity: 'high' | 'medium' | 'low';
}
