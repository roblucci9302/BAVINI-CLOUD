/**
 * Stream utilities pour l'API Agent
 */

import type { StreamChunk } from './types';

/**
 * Crée un chunk JSON pour le streaming
 */
export function createStreamChunk(chunk: StreamChunk): string {
  return JSON.stringify(chunk) + '\n';
}

/**
 * Encode et envoie un chunk dans le controller
 */
export function enqueueChunk(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  chunk: StreamChunk,
): void {
  controller.enqueue(encoder.encode(createStreamChunk(chunk)));
}

/**
 * Envoie un status d'agent
 */
export function sendAgentStatus(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  agent: string,
  status: string,
): void {
  enqueueChunk(controller, encoder, {
    type: 'agent_status',
    agent,
    status,
  });
}

/**
 * Envoie un chunk de texte
 */
export function sendText(controller: ReadableStreamDefaultController, encoder: TextEncoder, content: string): void {
  enqueueChunk(controller, encoder, {
    type: 'text',
    content,
  });
}

/**
 * Envoie une erreur
 */
export function sendError(controller: ReadableStreamDefaultController, encoder: TextEncoder, error: string): void {
  enqueueChunk(controller, encoder, {
    type: 'error',
    error,
  });
}

/**
 * Envoie le signal de fin
 */
export function sendDone(controller: ReadableStreamDefaultController, encoder: TextEncoder): void {
  enqueueChunk(controller, encoder, { type: 'done' });
}
