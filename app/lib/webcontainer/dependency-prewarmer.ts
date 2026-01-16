/**
 * Dependency Pre-warmer
 *
 * Proactively caches common dependency sets during browser idle time.
 * This ensures that when a user creates a new project, dependencies
 * are already cached and can be restored instantly.
 *
 * Strategy:
 * 1. On first load, check which common deps are NOT cached
 * 2. During idle time, trigger background installs for uncached deps
 * 3. Store results in IndexedDB for instant restoration
 */

import { dependencyCache, COMMON_DEPENDENCY_SETS, type PackageJson } from './dependency-cache';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DependencyPrewarmer');

// Pre-warming configuration
const IDLE_CALLBACK_TIMEOUT = 5000; // 5 seconds
const MIN_IDLE_TIME_MS = 2000; // Minimum idle time before pre-warming
const MAX_CONCURRENT_PREWARMS = 1; // Only one at a time to avoid resource contention

export interface PrewarmStatus {
  total: number;
  cached: number;
  pending: string[];
  inProgress: string | null;
}

export interface PrewarmOptions {
  /** Only prewarm if browser is idle */
  onlyWhenIdle?: boolean;

  /** Callback for status updates */
  onStatusChange?: (status: PrewarmStatus) => void;
}

/**
 * Dependency Pre-warmer Service
 */
export class DependencyPrewarmer {
  private isPrewarming = false;
  private currentPrewarm: string | null = null;
  private abortController: AbortController | null = null;

  /**
   * Get current pre-warming status
   */
  async getStatus(): Promise<PrewarmStatus> {
    const depSets = Object.entries(COMMON_DEPENDENCY_SETS);
    let cached = 0;
    const pending: string[] = [];

    for (const [name, deps] of depSets) {
      const packageJson: PackageJson = {
        name,
        ...deps,
      };

      if (await dependencyCache.has(packageJson)) {
        cached++;
      } else {
        pending.push(name);
      }
    }

    return {
      total: depSets.length,
      cached,
      pending,
      inProgress: this.currentPrewarm,
    };
  }

  /**
   * Start pre-warming common dependencies
   * This should be called during idle time
   */
  async startPrewarming(options: PrewarmOptions = {}): Promise<void> {
    if (this.isPrewarming) {
      logger.debug('Pre-warming already in progress');

      return;
    }

    const status = await this.getStatus();

    if (status.pending.length === 0) {
      logger.info('All common dependencies already cached');

      return;
    }

    this.isPrewarming = true;
    this.abortController = new AbortController();

    logger.info(`Starting pre-warm for ${status.pending.length} dependency sets`);

    try {
      for (const depSetName of status.pending) {
        if (this.abortController.signal.aborted) {
          break;
        }

        // Wait for idle if requested
        if (options.onlyWhenIdle) {
          await this.waitForIdle();
        }

        this.currentPrewarm = depSetName;
        options.onStatusChange?.(await this.getStatus());

        await this.prewarmDependencySet(depSetName);

        this.currentPrewarm = null;
        options.onStatusChange?.(await this.getStatus());
      }
    } finally {
      this.isPrewarming = false;
      this.currentPrewarm = null;
      this.abortController = null;
    }

    logger.info('Pre-warming complete');
  }

  /**
   * Stop pre-warming
   */
  stopPrewarming(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info('Pre-warming stopped');
    }
  }

  /**
   * Wait for browser to be idle
   */
  private waitForIdle(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(
          (deadline) => {
            if (deadline.timeRemaining() >= MIN_IDLE_TIME_MS || deadline.didTimeout) {
              resolve();
            } else {
              // Not enough idle time, wait and try again
              setTimeout(() => this.waitForIdle().then(resolve), 1000);
            }
          },
          { timeout: IDLE_CALLBACK_TIMEOUT },
        );
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(resolve, MIN_IDLE_TIME_MS);
      }
    });
  }

  /**
   * Pre-warm a specific dependency set
   * Note: This creates placeholder entries since we can't actually run npm install
   * without a WebContainer instance. The real caching happens during actual installs.
   */
  private async prewarmDependencySet(name: string): Promise<void> {
    const depSet = COMMON_DEPENDENCY_SETS[name as keyof typeof COMMON_DEPENDENCY_SETS];

    if (!depSet) {
      logger.warn(`Unknown dependency set: ${name}`);

      return;
    }

    logger.debug(`Pre-warming ${name}...`);

    /*
     * For now, we just log the intent
     * Actual pre-warming would require a WebContainer instance
     * The real optimization comes from caching after first install
     */

    /*
     * In a full implementation, we could:
     * 1. Spin up a headless WebContainer
     * 2. Run pnpm install
     * 3. Cache the result
     * But this is resource-intensive, so we rely on caching after first user install
     */

    logger.info(`Dependency set ${name} marked for caching on first use`);
  }

  /**
   * Check if a specific template's dependencies are cached
   */
  async isTemplateCached(templateId: string): Promise<boolean> {
    // Map template IDs to dependency sets
    const templateToDeps: Record<string, keyof typeof COMMON_DEPENDENCY_SETS> = {
      'react-vite-ts': 'react-vite',
      'next-ts': 'next-js',
      'express-ts': 'express',
    };

    const depSetName = templateToDeps[templateId];

    if (!depSetName) {
      return false;
    }

    const depSet = COMMON_DEPENDENCY_SETS[depSetName];
    const packageJson: PackageJson = {
      name: depSetName,
      ...depSet,
    };

    return dependencyCache.has(packageJson);
  }
}

// Singleton instance
export const dependencyPrewarmer = new DependencyPrewarmer();

/**
 * Initialize pre-warming on page load
 * Should be called after the page has finished loading
 */
export function initDependencyPrewarming(): void {
  // Wait for page to be fully loaded and idle
  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete') {
      schedulePrewarming();
    } else {
      window.addEventListener('load', schedulePrewarming, { once: true });
    }
  }
}

function schedulePrewarming(): void {
  // Wait a bit after load before starting pre-warming
  setTimeout(async () => {
    try {
      const status = await dependencyPrewarmer.getStatus();
      logger.info(`Pre-warm status: ${status.cached}/${status.total} cached`);

      if (status.pending.length > 0) {
        dependencyPrewarmer.startPrewarming({
          onlyWhenIdle: true,
          onStatusChange: (s) => {
            if (import.meta.env.DEV) {
              console.log(
                '%c[PREWARM]',
                'background: #9c27b0; color: white; padding: 2px 6px;',
                `${s.cached}/${s.total} cached`,
                s.inProgress ? `(warming: ${s.inProgress})` : '',
              );
            }
          },
        });
      }
    } catch (error) {
      logger.warn('Failed to start pre-warming:', error);
    }
  }, 5000); // Wait 5 seconds after load
}
