/**
 * =============================================================================
 * BAVINI Container - Node.js Globals
 * =============================================================================
 * Export all Node.js global implementations.
 * =============================================================================
 */

export { createProcess, ExitError, type ProcessConfig } from './process';
export { Buffer } from './buffer';
export { createConsole, type ConsoleConfig } from './console';
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
} from './timers';
