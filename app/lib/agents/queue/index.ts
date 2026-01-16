/**
 * Queue Module - Exports
 *
 * Module de gestion des files d'attente pour le système d'agents BAVINI.
 * Fournit une queue avec priorités, stratégies de retry et dead-letter queue.
 *
 * @module agents/queue
 */

// Priority Queue
export { PriorityQueue, TaskPriority, createPriorityQueue, getPriorityName, parsePriority } from './priority-queue';

export type { PriorityItem, PriorityQueueConfig, PriorityQueueStats } from './priority-queue';

// Priority Task Queue
export { PriorityTaskQueue, createPriorityTaskQueue } from './priority-task-queue';

export type { PriorityTaskQueueConfig, PriorityTaskQueueStats } from './priority-task-queue';

// Retry Strategies
export {
  ExponentialBackoffStrategy,
  LinearBackoffStrategy,
  FixedDelayStrategy,
  ImmediateRetryStrategy,
  ErrorAwareStrategy,
  CompositeRetryStrategy,
  createDefaultRetryStrategy,
  createRateLimitRetryStrategy,
  createNetworkRetryStrategy,
  createAgentRetryStrategy,
  executeWithRetry,
} from './retry-strategies';

export type {
  RetryStrategy,
  RetryContext,
  RetryDecision,
  BaseRetryConfig,
  ExponentialBackoffConfig,
  LinearBackoffConfig,
  FixedDelayConfig,
  ErrorTypeConfig,
} from './retry-strategies';

// Dead-Letter Queue
export { DeadLetterQueue, createDeadLetterQueue, createPersistentDeadLetterQueue } from './dead-letter-queue';

export type {
  DeadLetterEntry,
  DeadLetterQueueConfig,
  DeadLetterQueueStats,
  AddToDLQOptions,
} from './dead-letter-queue';
