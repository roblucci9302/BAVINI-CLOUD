/**
 * =============================================================================
 * BAVINI Performance - Startup Optimizer
 * =============================================================================
 * Optimizes application startup through lazy loading and parallel init.
 * =============================================================================
 */

import type { StartupTiming } from './types';
import { getPerformanceMonitor } from './performance-monitor';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('StartupOptimizer');

/**
 * Resource type for lazy loading
 */
type ResourceType = 'wasm' | 'worker' | 'script' | 'style' | 'data';

/**
 * Resource definition
 */
interface ResourceDefinition {
  id: string;
  type: ResourceType;
  url: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  preload?: boolean;
  dependencies?: string[];
}

/**
 * Loaded resource
 */
interface LoadedResource {
  id: string;
  type: ResourceType;
  data: unknown;
  loadTime: number;
}

/**
 * Startup phase
 */
interface StartupPhase {
  name: string;
  dependencies: string[];
  execute: () => Promise<void>;
}

/**
 * Startup Optimizer
 * Manages lazy loading and parallel initialization
 */
export class StartupOptimizer {
  private resources: Map<string, ResourceDefinition> = new Map();
  private loadedResources: Map<string, LoadedResource> = new Map();
  private loadingPromises: Map<string, Promise<unknown>> = new Map();
  private phases: StartupPhase[] = [];
  private timing: Partial<StartupTiming> = {};
  private startTime: number = 0;
  private monitor = getPerformanceMonitor();

  /**
   * Register a resource for lazy loading
   */
  registerResource(resource: ResourceDefinition): void {
    this.resources.set(resource.id, resource);

    // Preload if marked
    if (resource.preload) {
      this.preloadResource(resource.id);
    }
  }

  /**
   * Register multiple resources
   */
  registerResources(resources: ResourceDefinition[]): void {
    resources.forEach(r => this.registerResource(r));
  }

  /**
   * Register a startup phase
   */
  registerPhase(phase: StartupPhase): void {
    this.phases.push(phase);
  }

  /**
   * Preload a resource (non-blocking)
   */
  preloadResource(id: string): void {
    const resource = this.resources.get(id);
    if (!resource || this.loadedResources.has(id) || this.loadingPromises.has(id)) {
      return;
    }

    // Start loading in background
    this.loadResourceInternal(resource).catch(error => {
      logger.warn(`Preload failed for ${id}:`, error);
    });
  }

  /**
   * Load a resource (blocking)
   */
  async loadResource<T>(id: string): Promise<T> {
    // Check if already loaded
    const loaded = this.loadedResources.get(id);
    if (loaded) {
      return loaded.data as T;
    }

    // Check if currently loading
    const loadingPromise = this.loadingPromises.get(id);
    if (loadingPromise) {
      return loadingPromise as Promise<T>;
    }

    // Get resource definition
    const resource = this.resources.get(id);
    if (!resource) {
      throw new Error(`Unknown resource: ${id}`);
    }

    // Load dependencies first
    if (resource.dependencies) {
      await Promise.all(resource.dependencies.map(dep => this.loadResource(dep)));
    }

    return this.loadResourceInternal(resource) as Promise<T>;
  }

  /**
   * Internal resource loading
   */
  private async loadResourceInternal(resource: ResourceDefinition): Promise<unknown> {
    const promise = this.doLoadResource(resource);
    this.loadingPromises.set(resource.id, promise);

    try {
      const data = await promise;

      this.loadedResources.set(resource.id, {
        id: resource.id,
        type: resource.type,
        data,
        loadTime: Date.now(),
      });

      return data;
    } finally {
      this.loadingPromises.delete(resource.id);
    }
  }

  /**
   * Perform actual resource loading
   */
  private async doLoadResource(resource: ResourceDefinition): Promise<unknown> {
    const startTime = performance.now();

    try {
      let data: unknown;

      switch (resource.type) {
        case 'wasm':
          data = await this.loadWasm(resource.url);
          break;
        case 'worker':
          data = await this.loadWorker(resource.url);
          break;
        case 'script':
          data = await this.loadScript(resource.url);
          break;
        case 'style':
          data = await this.loadStyle(resource.url);
          break;
        case 'data':
          data = await this.loadData(resource.url);
          break;
        default:
          throw new Error(`Unknown resource type: ${resource.type}`);
      }

      const duration = performance.now() - startTime;
      this.monitor.record(`resource:${resource.id}`, duration, { type: resource.type });

      logger.debug(`Loaded ${resource.type} resource: ${resource.id} (${duration.toFixed(0)}ms)`);

      return data;
    } catch (error) {
      logger.error(`Failed to load resource ${resource.id}:`, error);
      throw error;
    }
  }

  /**
   * Load WASM module
   */
  private async loadWasm(url: string): Promise<WebAssembly.Module> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return WebAssembly.compile(buffer);
  }

  /**
   * Load worker (returns URL for later instantiation)
   */
  private async loadWorker(url: string): Promise<string> {
    // Prefetch worker script
    const response = await fetch(url);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  /**
   * Load script dynamically
   */
  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Load stylesheet dynamically
   */
  private loadStyle(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load style: ${url}`));
      document.head.appendChild(link);
    });
  }

  /**
   * Load JSON data
   */
  private async loadData(url: string): Promise<unknown> {
    const response = await fetch(url);
    return response.json();
  }

  /**
   * Run startup sequence
   */
  async runStartup(): Promise<StartupTiming> {
    this.startTime = performance.now();
    this.monitor.mark('startup');

    logger.info('Starting optimized startup sequence...');

    // Sort phases by dependencies
    const sortedPhases = this.topologicalSort(this.phases);

    // Execute phases
    for (const phase of sortedPhases) {
      const phaseStart = performance.now();

      try {
        await phase.execute();
        const phaseDuration = performance.now() - phaseStart;
        logger.debug(`Phase "${phase.name}" completed in ${phaseDuration.toFixed(0)}ms`);
      } catch (error) {
        logger.error(`Phase "${phase.name}" failed:`, error);
        throw error;
      }
    }

    const totalTime = performance.now() - this.startTime;
    this.timing.total = totalTime;

    this.monitor.measure('startup');
    this.monitor.recordStartupPhase('total', totalTime);

    logger.info(`Startup completed in ${totalTime.toFixed(0)}ms`);

    return this.timing as StartupTiming;
  }

  /**
   * Run critical resources in parallel
   */
  async loadCriticalResources(): Promise<void> {
    const criticalResources = [...this.resources.values()]
      .filter(r => r.priority === 'critical');

    const startTime = performance.now();

    await Promise.all(criticalResources.map(r => this.loadResource(r.id)));

    const duration = performance.now() - startTime;
    logger.info(`Critical resources loaded in ${duration.toFixed(0)}ms`);
  }

  /**
   * Topological sort for phases
   */
  private topologicalSort(phases: StartupPhase[]): StartupPhase[] {
    const sorted: StartupPhase[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const phaseMap = new Map(phases.map(p => [p.name, p]));

    const visit = (phase: StartupPhase) => {
      if (visited.has(phase.name)) return;
      if (visiting.has(phase.name)) {
        throw new Error(`Circular dependency detected: ${phase.name}`);
      }

      visiting.add(phase.name);

      for (const depName of phase.dependencies) {
        const dep = phaseMap.get(depName);
        if (dep) {
          visit(dep);
        }
      }

      visiting.delete(phase.name);
      visited.add(phase.name);
      sorted.push(phase);
    };

    for (const phase of phases) {
      visit(phase);
    }

    return sorted;
  }

  /**
   * Record timing for a phase
   */
  recordTiming(phase: keyof StartupTiming, duration: number): void {
    this.timing[phase] = duration;
    this.monitor.recordStartupPhase(phase, duration);
  }

  /**
   * Get current timing
   */
  getTiming(): Partial<StartupTiming> {
    return { ...this.timing };
  }

  /**
   * Check if resource is loaded
   */
  isResourceLoaded(id: string): boolean {
    return this.loadedResources.has(id);
  }

  /**
   * Get loaded resource
   */
  getLoadedResource<T>(id: string): T | undefined {
    return this.loadedResources.get(id)?.data as T | undefined;
  }

  /**
   * Clear loaded resources
   */
  clearResources(): void {
    // Revoke blob URLs for workers
    for (const [, resource] of this.loadedResources) {
      if (resource.type === 'worker' && typeof resource.data === 'string') {
        URL.revokeObjectURL(resource.data);
      }
    }

    this.loadedResources.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get load statistics
   */
  getLoadStats(): { total: number; byType: Record<ResourceType, number> } {
    const byType: Record<ResourceType, number> = {
      wasm: 0,
      worker: 0,
      script: 0,
      style: 0,
      data: 0,
    };

    for (const [, resource] of this.loadedResources) {
      byType[resource.type]++;
    }

    return {
      total: this.loadedResources.size,
      byType,
    };
  }
}

/**
 * Global startup optimizer instance
 */
let globalOptimizer: StartupOptimizer | null = null;

/**
 * Get or create global startup optimizer
 */
export function getStartupOptimizer(): StartupOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new StartupOptimizer();
  }
  return globalOptimizer;
}

/**
 * Create a new startup optimizer
 */
export function createStartupOptimizer(): StartupOptimizer {
  return new StartupOptimizer();
}

export default StartupOptimizer;
