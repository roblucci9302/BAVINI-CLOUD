/**
 * =============================================================================
 * BAVINI Dev Server - HMR Server
 * =============================================================================
 * Server-side HMR that broadcasts updates to connected clients.
 * Uses BroadcastChannel API for browser-to-browser communication.
 * =============================================================================
 */

import type { HMRPayload, HMRUpdate, HMRError, ModuleNode, WatchEvent } from './types';
import type { ModuleGraph } from './module-graph';

/**
 * HMR Server configuration
 */
export interface HMRServerConfig {
  /** Channel name for broadcast */
  channelName: string;
  /** Enable logging */
  debug: boolean;
}

/**
 * Connected client
 */
interface HMRClient {
  id: string;
  port: MessagePort;
  lastSeen: number;
}

/**
 * HMR Server class
 * Manages HMR connections using BroadcastChannel API
 */
export class HMRServer {
  private config: HMRServerConfig;
  private channel: BroadcastChannel;
  private clients = new Map<string, HMRClient>();
  private moduleGraph: ModuleGraph;
  private pendingUpdates: HMRUpdate[] = [];
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly UPDATE_DEBOUNCE = 50;

  constructor(moduleGraph: ModuleGraph, config: Partial<HMRServerConfig> = {}) {
    this.moduleGraph = moduleGraph;
    this.config = {
      channelName: config.channelName || 'bavini-hmr',
      debug: config.debug || false,
    };

    // Create broadcast channel
    this.channel = new BroadcastChannel(this.config.channelName);
    this.channel.onmessage = this.handleMessage.bind(this);

    this.log('HMR Server initialized');
  }

  /**
   * Handle incoming messages from clients
   */
  private handleMessage(event: MessageEvent): void {
    const message = event.data;

    switch (message.type) {
      case 'connect':
        this.handleClientConnect(message.clientId);
        break;

      case 'disconnect':
        this.handleClientDisconnect(message.clientId);
        break;

      case 'invalidate':
        this.handleInvalidate(message.path);
        break;

      default:
        this.log('Unknown message type:', message.type);
    }
  }

  /**
   * Handle client connection
   */
  private handleClientConnect(clientId: string): void {
    this.log('Client connected:', clientId);

    // Send connected confirmation
    this.sendToClient(clientId, { type: 'connected' });
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnect(clientId: string): void {
    this.log('Client disconnected:', clientId);
    this.clients.delete(clientId);
  }

  /**
   * Handle invalidate request from client
   */
  private handleInvalidate(path: string): void {
    this.log('Invalidate requested for:', path);

    const mod = this.moduleGraph.getModuleById(path);
    if (mod) {
      this.moduleGraph.invalidateModule(mod);

      // Trigger update for importers
      for (const importer of mod.importers) {
        this.queueUpdate({
          type: 'js-update',
          path: importer.url,
          acceptedPath: importer.url,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Handle file change event
   */
  handleFileChange(event: WatchEvent): void {
    this.log('File changed:', event.path);

    // Get affected modules
    const modules = this.moduleGraph.getModulesByFile(event.path);

    if (modules.size === 0) {
      // Unknown file - might be new, do full reload
      if (event.type === 'add') {
        this.log('New file added, checking if rebuild needed');
        return;
      }
      return;
    }

    // Invalidate affected modules
    for (const mod of modules) {
      this.moduleGraph.invalidateModule(mod);
    }

    // Check if full reload is needed
    if (this.moduleGraph.needsFullReload(event.path)) {
      this.log('Full reload required for:', event.path);
      this.sendFullReload();
      return;
    }

    // Get HMR propagation path
    const boundaries = this.moduleGraph.getHMRPropagationPath(event.path);

    if (!boundaries) {
      this.log('No HMR boundary found, full reload');
      this.sendFullReload();
      return;
    }

    // Queue updates for all affected modules
    for (const mod of modules) {
      const updateType = mod.type === 'css' ? 'css-update' : 'js-update';

      this.queueUpdate({
        type: updateType,
        path: mod.url,
        acceptedPath: boundaries[0]?.url || mod.url,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * Queue an update (debounced)
   */
  private queueUpdate(update: HMRUpdate): void {
    this.pendingUpdates.push(update);

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(() => {
      this.flushUpdates();
    }, this.UPDATE_DEBOUNCE);
  }

  /**
   * Flush pending updates
   */
  private flushUpdates(): void {
    if (this.pendingUpdates.length === 0) {
      return;
    }

    // Deduplicate updates by path
    const uniqueUpdates = new Map<string, HMRUpdate>();
    for (const update of this.pendingUpdates) {
      uniqueUpdates.set(update.path, update);
    }

    const updates = Array.from(uniqueUpdates.values());
    this.pendingUpdates = [];

    this.log('Sending updates:', updates.map(u => u.path));

    this.broadcast({
      type: 'update',
      updates,
    });
  }

  /**
   * Send full reload signal
   */
  sendFullReload(): void {
    this.log('Sending full reload');
    this.broadcast({ type: 'full-reload' });
  }

  /**
   * Send error to clients
   */
  sendError(error: HMRError): void {
    this.log('Sending error:', error.message);
    this.broadcast({
      type: 'error',
      error,
    });
  }

  /**
   * Send prune signal for removed modules
   */
  sendPrune(paths: string[]): void {
    this.log('Sending prune:', paths);
    this.broadcast({
      type: 'prune',
      data: paths,
    });
  }

  /**
   * Send custom event
   */
  sendCustom(event: string, data: unknown): void {
    this.broadcast({
      type: 'custom',
      event,
      data,
    });
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(payload: HMRPayload): void {
    this.channel.postMessage(payload);
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, payload: HMRPayload): void {
    // Use broadcast since we can't target specific clients with BroadcastChannel
    // The client will filter by its ID
    this.channel.postMessage({
      ...payload,
      targetClient: clientId,
    });
  }

  /**
   * Close the HMR server
   */
  close(): void {
    this.log('Closing HMR server');
    this.channel.close();
    this.clients.clear();

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }

  /**
   * Log message if debug enabled
   */
  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[HMR Server]', ...args);
    }
  }
}

/**
 * Create HMR update for a module
 */
export function createHMRUpdate(
  mod: ModuleNode,
  boundary: ModuleNode,
  timestamp: number,
): HMRUpdate {
  return {
    type: mod.type === 'css' ? 'css-update' : 'js-update',
    path: mod.url,
    acceptedPath: boundary.url,
    timestamp,
  };
}

/**
 * Create HMR error from build error
 */
export function createHMRError(error: Error & {
  id?: string;
  loc?: { file: string; line: number; column: number };
  frame?: string;
  plugin?: string;
}): HMRError {
  return {
    message: error.message,
    stack: error.stack,
    id: error.id,
    frame: error.frame,
    plugin: error.plugin,
    loc: error.loc,
  };
}

/**
 * Create a new HMR server
 */
export function createHMRServer(
  moduleGraph: ModuleGraph,
  config?: Partial<HMRServerConfig>,
): HMRServer {
  return new HMRServer(moduleGraph, config);
}

export default HMRServer;
