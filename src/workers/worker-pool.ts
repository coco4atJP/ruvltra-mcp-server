import path from 'node:path';
import { InferenceEngine } from '../ruvllm/inference-engine.js';
import { SonaEngine } from '../ruvllm/sona-engine.js';
import {
  GenerateRequest,
  InferenceBackend,
  ServerConfig,
  SonaStats,
  WorkerPoolStatus,
  WorkerRuntimeStats,
  WorkerTask,
  WorkerTaskResult,
} from '../types.js';
import { Logger } from '../utils/logger.js';

interface QueueItem {
  task: WorkerTask;
  resolve: (result: WorkerTaskResult) => void;
  reject: (error: Error) => void;
  controller: AbortController;
  timeoutHandle?: NodeJS.Timeout;
  settled: boolean;
  timedOut: boolean;
  started: boolean;
}

interface WorkerNode {
  id: string;
  engine: InferenceEngine;
  sona: SonaEngine;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  lastUsedAt: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class QueueOverflowError extends Error {}
export class TaskCancelledError extends Error {}
export class TaskTimeoutError extends Error {}

export class WorkerPool {
  private readonly workers: WorkerNode[] = [];
  private readonly queue: QueueItem[] = [];
  private readonly scaleDownTimer: NodeJS.Timeout;
  private readonly pendingByTaskId = new Map<string, QueueItem>();
  private readonly runningByTaskId = new Map<string, QueueItem>();
  private readonly forceSingleLlamaWorker: boolean;
  private readonly effectiveMinWorkers: number;
  private readonly effectiveMaxWorkers: number;

  private createdWorkers = 0;
  private inFlight = 0;
  private submittedTasks = 0;
  private failedTasks = 0;
  private cancelledTasks = 0;
  private timedOutTasks = 0;
  private rejectedTasks = 0;
  private taskCounter = 0;

  private readonly scaleDownIdleMs = 20_000;

  constructor(
    private readonly config: ServerConfig,
    private readonly logger: Logger
  ) {
    this.forceSingleLlamaWorker =
      Boolean(this.config.modelPath) && !this.config.httpEndpoint;
    this.effectiveMinWorkers = this.forceSingleLlamaWorker
      ? 1
      : this.config.minWorkers;
    this.effectiveMaxWorkers = this.forceSingleLlamaWorker
      ? 1
      : this.config.maxWorkers;

    if (
      this.forceSingleLlamaWorker &&
      (this.config.minWorkers > 1 ||
        this.config.maxWorkers > 1 ||
        this.config.initialWorkers > 1)
    ) {
      this.logger.warn(
        'Forcing single-worker mode for local llama backend stability (modelPath configured without HTTP endpoint)'
      );
    }

    const initialWorkers = clamp(
      this.config.initialWorkers,
      this.effectiveMinWorkers,
      this.effectiveMaxWorkers
    );

    for (let index = 0; index < initialWorkers; index += 1) {
      this.createWorker();
    }

    this.scaleDownTimer = setInterval(() => {
      this.maybeScaleDown();
    }, 5_000);

    this.scaleDownTimer.unref?.();
  }

  executeTask(task: Omit<WorkerTask, 'taskId'> & { taskId?: string }): Promise<WorkerTaskResult> {
    if (this.queue.length >= this.config.queueMaxLength) {
      this.rejectedTasks += 1;
      const suggestedRetryMs = Math.max(50, Math.ceil(this.config.taskTimeoutMs / 4));
      return Promise.reject(
        new QueueOverflowError(
          `Queue limit reached (${this.config.queueMaxLength}). Retry after ~${suggestedRetryMs}ms.`
        )
      );
    }

    const taskId = task.taskId ?? this.nextTaskId();
    const fullTask: WorkerTask = { ...task, taskId };
    const timeoutMs = task.timeoutMs ?? this.config.taskTimeoutMs;

    this.submittedTasks += 1;

    return new Promise<WorkerTaskResult>((resolve, reject) => {
      const queueItem: QueueItem = {
        task: fullTask,
        resolve,
        reject,
        controller: new AbortController(),
        settled: false,
        timedOut: false,
        started: false,
      };

      if (timeoutMs > 0) {
        queueItem.timeoutHandle = setTimeout(() => {
          this.timedOutTasks += 1;
          queueItem.timedOut = true;
          this.cancelTask(
            taskId,
            new TaskTimeoutError(`Task ${taskId} timed out after ${timeoutMs}ms`)
          );
        }, timeoutMs);
        queueItem.timeoutHandle.unref?.();
      }

      this.pendingByTaskId.set(taskId, queueItem);
      this.queue.push(queueItem);

      this.maybeScaleUp();
      this.dispatch();
    });
  }

  getStatus(): WorkerPoolStatus {
    const workers = this.workers.map((worker) => this.toRuntimeStats(worker));
    const backendBreakdown: Record<InferenceBackend, number> = {
      http: 0,
      llama: 0,
      ruvllm: 0,
      mock: 0,
    };

    for (const worker of workers) {
      backendBreakdown[worker.inference.activeBackend] += 1;
    }

    return {
      minWorkers: this.effectiveMinWorkers,
      maxWorkers: this.effectiveMaxWorkers,
      currentWorkers: this.workers.length,
      queueMaxLength: this.config.queueMaxLength,
      queueLength: this.queue.length,
      inFlight: this.inFlight,
      submittedTasks: this.submittedTasks,
      failedTasks: this.failedTasks,
      cancelledTasks: this.cancelledTasks,
      timedOutTasks: this.timedOutTasks,
      rejectedTasks: this.rejectedTasks,
      workers,
      backendBreakdown,
    };
  }

  getSonaStats(workerId?: string): SonaStats[] {
    const nodes = workerId
      ? this.workers.filter((worker) => worker.id === workerId)
      : this.workers;
    return nodes.map((worker) => worker.sona.getStats());
  }

  scaleWorkers(target: number): WorkerPoolStatus {
    const desired = clamp(
      Math.round(target),
      this.effectiveMinWorkers,
      this.effectiveMaxWorkers
    );

    if (desired > this.workers.length) {
      while (this.workers.length < desired) {
        this.createWorker();
      }
      this.logger.info('Scaled worker pool up', { workers: this.workers.length });
      return this.getStatus();
    }

    if (desired < this.workers.length) {
      const removable = this.workers
        .filter((worker) => worker.activeTasks === 0)
        .sort((left, right) => left.lastUsedAt - right.lastUsedAt);

      while (this.workers.length > desired && removable.length > 0) {
        const node = removable.shift();
        if (!node) {
          break;
        }
        this.removeWorker(node);
      }
      this.logger.info('Scaled worker pool down', { workers: this.workers.length });
    }

    return this.getStatus();
  }

  async shutdown(): Promise<void> {
    clearInterval(this.scaleDownTimer);
    for (const item of [...this.pendingByTaskId.values(), ...this.runningByTaskId.values()]) {
      this.finishWithError(
        item,
        new TaskCancelledError(`Task ${item.task.taskId} cancelled during shutdown`)
      );
    }
    this.pendingByTaskId.clear();
    this.runningByTaskId.clear();
    this.queue.length = 0;
    for (const worker of this.workers) {
      worker.sona.flush();
    }
    await Promise.all(this.workers.map((worker) => worker.engine.shutdown()));
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      const worker = this.pickAvailableWorker();
      if (!worker) {
        return;
      }

      const nextItem = this.queue.shift();
      if (!nextItem) {
        return;
      }
      if (nextItem.settled) {
        continue;
      }
      this.runOnWorker(worker, nextItem);
    }
  }

  private runOnWorker(worker: WorkerNode, item: QueueItem): void {
    item.started = true;
    this.pendingByTaskId.delete(item.task.taskId);
    this.runningByTaskId.set(item.task.taskId, item);

    worker.activeTasks += 1;
    worker.lastUsedAt = Date.now();
    this.inFlight += 1;

    const originalInstruction = item.task.instruction;
    const enhancedInstruction = worker.sona.enhanceInstruction(
      originalInstruction,
      item.task.taskType,
      item.task.language
    );

    const request: GenerateRequest = {
      ...item.task,
      instruction: enhancedInstruction,
    };

    worker.engine
      .generate(request, item.controller.signal)
      .then((result) => {
        if (item.settled) {
          return;
        }
        worker.completedTasks += 1;
        worker.sona.recordInteraction({
          taskType: item.task.taskType,
          instruction: originalInstruction,
          response: result.text,
          success: true,
          latencyMs: result.latencyMs,
          language: item.task.language,
          filePath: item.task.filePath,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        });

        this.finishWithSuccess(item, {
          ...result,
          workerId: worker.id,
          taskId: item.task.taskId,
          promptUsed: enhancedInstruction,
        });
      })
      .catch((error) => {
        if (item.settled) {
          return;
        }
        const wrapped = error instanceof Error ? error : new Error(String(error));
        if (!(wrapped instanceof TaskCancelledError) && !(wrapped instanceof TaskTimeoutError)) {
          worker.failedTasks += 1;
          this.failedTasks += 1;
        } else {
          this.cancelledTasks += 1;
        }

        worker.sona.recordInteraction({
          taskType: item.task.taskType,
          instruction: originalInstruction,
          response: wrapped.message,
          success: false,
          latencyMs: 0,
          language: item.task.language,
          filePath: item.task.filePath,
        });
        this.finishWithError(item, wrapped);
      })
      .finally(() => {
        worker.activeTasks -= 1;
        worker.lastUsedAt = Date.now();
        this.inFlight -= 1;
        this.runningByTaskId.delete(item.task.taskId);
        this.maybeScaleDown();
        this.dispatch();
      });
  }

  private pickAvailableWorker(): WorkerNode | undefined {
    if (this.workers.length === 0) {
      return undefined;
    }

    return this.workers
      .slice()
      .filter((worker) => worker.activeTasks === 0)
      .sort((left, right) => {
        return left.lastUsedAt - right.lastUsedAt;
      })[0];
  }

  private maybeScaleUp(): void {
    const shouldScale =
      this.queue.length > this.workers.length &&
      this.workers.length < this.effectiveMaxWorkers;
    if (!shouldScale) {
      return;
    }
    this.createWorker();
    this.logger.debug('Auto-scaled worker pool up', {
      workers: this.workers.length,
      queueLength: this.queue.length,
    });
  }

  private maybeScaleDown(): void {
    if (this.workers.length <= this.effectiveMinWorkers) {
      return;
    }

    const now = Date.now();
    const idleWorkers = this.workers
      .filter(
        (worker) =>
          worker.activeTasks === 0 && now - worker.lastUsedAt > this.scaleDownIdleMs
      )
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);

    if (idleWorkers.length === 0) {
      return;
    }

    const removable = idleWorkers[0];
    if (!removable) {
      return;
    }

    if (this.workers.length > this.effectiveMinWorkers) {
      this.removeWorker(removable);
      this.logger.debug('Auto-scaled worker pool down', {
        workers: this.workers.length,
      });
    }
  }

  private createWorker(): WorkerNode {
    this.createdWorkers += 1;
    const id = `worker-${this.createdWorkers}`;
    const workerLogger = this.logger.child(id);
    const engine = new InferenceEngine(this.config, workerLogger.child('inference'));
    const sona = new SonaEngine({
      workerId: id,
      enabled: this.config.sonaEnabled,
      stateFilePath: this.resolveSonaStatePath(id),
      persistInterval: this.config.sonaPersistInterval,
      logger: workerLogger.child('sona'),
    });
    const node: WorkerNode = {
      id,
      engine,
      sona,
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      lastUsedAt: Date.now(),
    };
    this.workers.push(node);
    return node;
  }

  private removeWorker(worker: WorkerNode): void {
    const index = this.workers.findIndex((item) => item.id === worker.id);
    if (index === -1) {
      return;
    }
    this.workers.splice(index, 1);
    worker.sona.flush();
    void worker.engine.shutdown();
  }

  private toRuntimeStats(worker: WorkerNode): WorkerRuntimeStats {
    return {
      workerId: worker.id,
      activeTasks: worker.activeTasks,
      completedTasks: worker.completedTasks,
      failedTasks: worker.failedTasks,
      lastUsedAt: new Date(worker.lastUsedAt).toISOString(),
      inference: worker.engine.getStatus(),
    };
  }

  private nextTaskId(): string {
    this.taskCounter += 1;
    return `task-${Date.now()}-${this.taskCounter}`;
  }

  private resolveSonaStatePath(workerId: string): string | undefined {
    if (!this.config.sonaEnabled) {
      return undefined;
    }
    const baseDir =
      this.config.sonaStateDir ??
      path.join(process.cwd(), '.ruvltra-state', 'sona');
    return path.join(baseDir, `${workerId}.json`);
  }

  private cancelTask(taskId: string, reason: Error): void {
    const pending = this.pendingByTaskId.get(taskId);
    if (pending) {
      this.cancelledTasks += 1;
      this.pendingByTaskId.delete(taskId);
      this.removeFromQueue(taskId);
      pending.controller.abort(reason);
      this.finishWithError(pending, reason);
      return;
    }

    const running = this.runningByTaskId.get(taskId);
    if (running) {
      this.cancelledTasks += 1;
      running.controller.abort(reason);
      this.finishWithError(running, reason);
    }
  }

  private removeFromQueue(taskId: string): void {
    const index = this.queue.findIndex((item) => item.task.taskId === taskId);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  private finishWithSuccess(item: QueueItem, result: WorkerTaskResult): void {
    if (item.settled) {
      return;
    }
    item.settled = true;
    if (item.timeoutHandle) {
      clearTimeout(item.timeoutHandle);
    }
    item.resolve(result);
  }

  private finishWithError(item: QueueItem, error: Error): void {
    if (item.settled) {
      return;
    }
    item.settled = true;
    if (item.timeoutHandle) {
      clearTimeout(item.timeoutHandle);
    }
    item.reject(error);
  }
}
