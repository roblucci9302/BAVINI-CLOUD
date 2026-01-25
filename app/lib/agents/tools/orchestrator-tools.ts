/**
 * =============================================================================
 * BAVINI CLOUD - Orchestrator Tool Definitions
 * =============================================================================
 * Tool definitions for the orchestrator agent.
 *
 * @module agents/tools/orchestrator-tools
 * @see {@link Orchestrator} for the main orchestrator implementation
 * =============================================================================
 */

import type { ToolDefinition } from '../types';

/**
 * Tool to delegate a task to a specialized agent
 */
export const DelegateToAgentTool: ToolDefinition = {
  name: 'delegate_to_agent',
  description:
    'Déléguer une tâche à un agent spécialisé. ' +
    "Utilise cet outil quand une tâche correspond aux capacités d'un agent.",
  inputSchema: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        description: "Nom de l'agent cible (explore, coder, builder, tester, deployer, reviewer, fixer, architect)",
        enum: ['explore', 'coder', 'builder', 'tester', 'deployer', 'reviewer', 'fixer', 'architect'],
      },
      task: {
        type: 'string',
        description: "Description précise de la tâche pour l'agent",
      },
      context: {
        type: 'object',
        description: "Contexte additionnel pour l'agent (fichiers, infos, etc.)",
      },
    },
    required: ['agent', 'task'],
  },
};

/**
 * Tool to create subtasks for complex task decomposition
 */
export const CreateSubtasksTool: ToolDefinition = {
  name: 'create_subtasks',
  description:
    'Décomposer une tâche complexe en sous-tâches. ' + 'Utilise quand la tâche nécessite plusieurs agents ou étapes.',
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Liste des sous-tâches à créer',
        items: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Agent assigné' },
            description: { type: 'string', description: 'Description de la tâche' },
            dependsOn: {
              type: 'array',
              description: 'Indices des tâches dont celle-ci dépend',
              items: { type: 'number' },
            },
          },
        },
      },
      reasoning: {
        type: 'string',
        description: 'Explication de la décomposition',
      },
    },
    required: ['tasks', 'reasoning'],
  },
};

/**
 * Tool to get agent status and capabilities
 */
export const GetAgentStatusTool: ToolDefinition = {
  name: 'get_agent_status',
  description: 'Obtenir le statut et les capacités des agents disponibles.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        description: "Nom de l'agent (optionnel, tous si omis)",
      },
    },
    required: [],
  },
};

/**
 * Tool to signal task completion
 *
 * CRITICAL: This tool allows the orchestrator to explicitly stop
 * instead of looping indefinitely.
 */
export const CompleteTaskTool: ToolDefinition = {
  name: 'complete_task',
  description:
    "Signaler que la tâche demandée par l'utilisateur est TERMINÉE. " +
    'Utilise cet outil quand: (1) la demande est satisfaite, (2) le résultat est prêt à être présenté, ' +
    "(3) aucune action supplémentaire n'est nécessaire. " +
    'NE PAS utiliser si des étapes restent à faire.',
  inputSchema: {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description: "Résultat final à présenter à l'utilisateur (résumé clair et concis)",
      },
      summary: {
        type: 'string',
        description: 'Résumé des actions effectuées',
      },
      artifacts: {
        type: 'array',
        description: 'Liste des fichiers créés/modifiés (optionnel)',
        items: { type: 'string' },
      },
    },
    required: ['result'],
  },
};

/**
 * All orchestrator tools as an array
 */
export const ORCHESTRATOR_TOOLS: ToolDefinition[] = [
  DelegateToAgentTool,
  CreateSubtasksTool,
  GetAgentStatusTool,
  CompleteTaskTool,
];
