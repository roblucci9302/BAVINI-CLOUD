/**
 * =============================================================================
 * BAVINI Container - Node.js Runtime
 * =============================================================================
 * Complete Node.js runtime implementation for browser environment.
 * =============================================================================
 */

// Types
export type {
  ProcessObject,
  TimerHandle,
  Stats,
  Dirent,
  EventEmitterInterface,
  EventListener,
} from './types';

// Globals
export {
  createProcess,
  ExitError,
  type ProcessConfig,
} from './globals/process';

export { Buffer } from './globals/buffer';

export {
  createConsole,
  type ConsoleConfig,
} from './globals/console';

export {
  nodeSetTimeout,
  nodeClearTimeout,
  nodeSetInterval,
  nodeClearInterval,
  nodeSetImmediate,
  nodeClearImmediate,
  timers,
  timersPromises,
  getActiveTimers,
  clearAllTimers,
} from './globals/timers';

// Core Modules
export * as path from './core-modules/path';
export * as events from './core-modules/events';
export * as util from './core-modules/util';
export * as fs from './core-modules/fs';
export * as stream from './core-modules/stream';
export * as http from './core-modules/http';
export * as crypto from './core-modules/crypto';
export * as child_process from './core-modules/child_process';

// Export classes
export { EventEmitter } from './core-modules/events';
export { Readable, Writable, Duplex, Transform, PassThrough } from './core-modules/stream';
export { Server, IncomingMessage, ServerResponse, ClientRequest } from './core-modules/http';
export { Hash, Hmac } from './core-modules/crypto';
export { ChildProcess } from './core-modules/child_process';

// Module System
export {
  ModuleResolver,
  createResolver,
  ModuleLoader,
  createModuleLoader,
  createRequire,
  ESMLoader,
  createESMLoader,
} from './module';

export type {
  NodeModule,
  RequireFunction,
  ModuleFS,
  ModuleLoaderOptions,
  ModuleNamespace,
} from './module';

// Re-export fs filesystem setter
export { setFilesystem } from './core-modules/fs';
