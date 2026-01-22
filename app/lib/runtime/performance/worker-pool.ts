/**
 * =============================================================================
 * BAVINI Performance - Worker Pool
 * =============================================================================
 * Manages a pool of reusable workers for efficient task execution.
 * =============================================================================
 */

import type { WorkerPoolConfig, PooledWorker } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WorkerPool');

/**
 * Default worker pool configuration
 */
const DEFAULT_CONFIG: WorkerPoolConfig = {
  minWorkers: 1,
  maxWorkers: 4,
  idleTimeout: 30000,  // 30 seconds
  maxTasksPerWorker: 100,
};

/**
 * Task queued for execution
 */
interface QueuedTask {
  id: string;
  message: unknown;
  transfer?: Transferable[];
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Worker Pool
 * Manages a pool of web workers for parallel task execution
 */
export class WorkerPool {
  private config: WorkerPoolConfig;
  private workerScript: string | URL;
  private workers: Map<string, PooledWorker> = new Map();
  private taskQueue: QueuedTask[] = [];
  private workerTasks: Map<string, QueuedTask> = new Map();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private workerIdCounter = 0;
  private isDestroyed = false;

  constructor(workerScript: string | URL, config: Partial<WorkerPoolConfig> = {}) {
    this.workerScript = workerScript;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the pool with minimum workers
   */
  async init(): Promise<void> {
    logger.info(`Initializing worker pool (min: ${this.config.minWorkers}, max: ${this.config.maxWorkers})`);

    // Create minimum workers
    const initPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.minWorkers; i++) {
      initPromises.push(this.createWorker());
    }
    await Promise.all(initPromises);

    // Start idle check
    this.startIdleCheck();

    logger.info(`Worker pool initialized with ${this.workers.size} workers`);
  }

  /**
   * Execute a task on an available worker
   */
  async exec<T>(message: unknown, transfer?: Transferable[]): Promise<T> {
    if (this.isDestroyed) {
      throw new Error('Worker pool is destroyed');
    }

    return new Promise((resolve, reject) => {
      const task: QueuedTask = {
        id: this.generateTaskId(),
        message,
        transfer,
        resolve: resolve as (result: unknown) => void,
        reject,
      };

      // Try to find an available worker
      const worker = this.getIdleWorker();

      if (worker) {
        this.assignTask(worker, task);
      } else if (this.workers.size < this.config.maxWorkers) {
        // Create a new worker
        this.createWorker().then(newWorker => {
          if (newWorker) {
            this.assignTask(newWorker, task);
          } else {
            // Queue the task
            this.taskQueue.push(task);
          }
        });
      } else {
        // Queue the task
        this.taskQueue.push(task);
      }
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  async execBatch<T>(tasks: Array<{ message: unknown; transfer?: Transferable[] }>): Promise<T[]> {
    return Promise.all(tasks.map(t => this.exec<T>(t.message, t.transfer)));
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    idleWorkers: number;
    busyWorkers: number;
    queuedTasks: number;
    totalTasksExecuted: number;
  } {
    let idleCount = 0;
    let busyCount = 0;
    let totalTasks = 0;

    for (const worker of this.workers.values()) {
      if (worker.status === 'idle') idleCount++;
      else if (worker.status === 'busy') busyCount++;
      totalTasks += worker.taskCount;
    }

    return {
      totalWorkers: this.workers.size,
      idleWorkers: idleCount,
      busyWorkers: busyCount,
      queuedTasks: this.taskQueue.length,
      totalTasksExecuted: totalTasks,
    };
  }

  /**
   * Create a new worker
   */
  private async createWorker(): Promise<PooledWorker | null> {
    if (this.isDestroyed) return null;

    const id = `worker-${++this.workerIdCounter}`;

    try {
      const worker = new Worker(this.workerScript, { type: 'module' });

      const pooledWorker: PooledWorker = {
        id,
        worker,
        status: 'idle',
        taskCount: 0,
        lastActivity: Date.now(),
        createdAt: Date.now(),
      };

      // Set up message handler
      worker.onmessage = (event) => this.handleWorkerMessage(id, event);
      worker.onerror = (error) => this.handleWorkerError(id, error);

      this.workers.set(id, pooledWorker);
      logger.debug(`Created worker: ${id}`);

      return pooledWorker;
    } catch (error) {
      logger.error(`Failed to create worker: ${error}`);
      return null;
    }
  }

  /**
   * Terminate a worker
   */
  private terminateWorker(id: string): void {
    const pooledWorker = this.workers.get(id);
    if (!pooledWorker) return;

    pooledWorker.status = 'terminating';
    pooledWorker.worker.terminate();
    this.workers.delete(id);

    // Reject any pending task
    const pendingTask = this.workerTasks.get(id);
    if (pendingTask) {
      pendingTask.reject(new Error('Worker terminated'));
      this.workerTasks.delete(id);
    }

    logger.debug(`Terminated worker: ${id}`);
  }

  /**
   * Get an idle worker
   */
  private getIdleWorker(): PooledWorker | null {
    for (const worker of this.workers.values()) {
      if (worker.status === 'idle') {
        return worker;
      }
    }
    return null;
  }

  /**
   * Assign a task to a worker
   */
  private assignTask(worker: PooledWorker, task: QueuedTask): void {
    worker.status = 'busy';
    worker.lastActivity = Date.now();
    this.workerTasks.set(worker.id, task);

    if (task.transfer && task.transfer.length > 0) {
      worker.worker.postMessage(task.message, task.transfer);
    } else {
      worker.worker.postMessage(task.message);
    }
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(workerId: string, event: MessageEvent): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    const task = this.workerTasks.get(workerId);
    if (task) {
      task.resolve(event.data);
      this.workerTasks.delete(workerId);
    }

    worker.taskCount++;
    worker.lastActivity = Date.now();

    // Check if worker should be recycled
    if (worker.taskCount >= this.config.maxTasksPerWorker) {
      logger.debug(`Recycling worker ${workerId} after ${worker.taskCount} tasks`);
      this.recycleWorker(workerId);
      return;
    }

    // Process next queued task
    worker.status = 'idle';
    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(workerId: string, error: ErrorEvent): void {
    logger.error(`Worker ${workerId} error:`, error.message);

    const task = this.workerTasks.get(workerId);
    if (task) {
      task.reject(new Error(error.message));
      this.workerTasks.delete(workerId);
    }

    // Recycle the errored worker
    this.recycleWorker(workerId);
  }

  /**
   * Recycle a worker (terminate and create new one)
   */
  private async recycleWorker(workerId: string): Promise<void> {
    this.terminateWorker(workerId);

    // Create replacement if below minimum
    if (this.workers.size < this.config.minWorkers) {
      await this.createWorker();
    }

    this.processQueue();
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0) {
      const worker = this.getIdleWorker();
      if (!worker) {
        // Try to create a new worker if under max
        if (this.workers.size < this.config.maxWorkers) {
          this.createWorker().then(() => this.processQueue());
        }
        break;
      }

      const task = this.taskQueue.shift();
      if (task) {
        this.assignTask(worker, task);
      }
    }
  }

  /**
   * Start idle worker check interval
   */
  private startIdleCheck(): void {
    if (this.idleCheckInterval) return;

    this.idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const toTerminate: string[] = [];

      for (const [id, worker] of this.workers.entries()) {
        if (
          worker.status === 'idle' &&
          this.workers.size > this.config.minWorkers &&
          now - worker.lastActivity > this.config.idleTimeout
        ) {
          toTerminate.push(id);
        }
      }

      for (const id of toTerminate) {
        logger.debug(`Terminating idle worker: ${id}`);
        this.terminateWorker(id);
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Stop idle check
   */
  private stopIdleCheck(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Resize the pool
   */
  async resize(minWorkers: number, maxWorkers: number): Promise<void> {
    this.config.minWorkers = minWorkers;
    this.config.maxWorkers = maxWorkers;

    // Terminate excess workers
    while (this.workers.size > maxWorkers) {
      const idleWorker = this.getIdleWorker();
      if (idleWorker) {
        this.terminateWorker(idleWorker.id);
      } else {
        break; // Wait for busy workers to finish
      }
    }

    // Create workers if below minimum
    while (this.workers.size < minWorkers) {
      await this.createWorker();
    }
  }

  /**
   * Wait for all tasks to complete
   */
  async drain(): Promise<void> {
    // Wait for queue to empty
    while (this.taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for all workers to become idle
    while (this.workerTasks.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Destroy the pool
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.stopIdleCheck();

    // Reject all queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool destroyed'));
    }
    this.taskQueue = [];

    // Terminate all workers
    for (const id of this.workers.keys()) {
      this.terminateWorker(id);
    }

    logger.info('Worker pool destroyed');
  }
}

/**
 * Create a worker pool
 */
export function createWorkerPool(
  workerScript: string | URL,
  config?: Partial<WorkerPoolConfig>,
): WorkerPool {
  return new WorkerPool(workerScript, config);
}

export default WorkerPool;
