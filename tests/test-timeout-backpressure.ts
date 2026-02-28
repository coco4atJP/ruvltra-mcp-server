import assert from 'node:assert/strict';
import {
  QueueOverflowError,
  TaskTimeoutError,
  WorkerPool,
} from '../src/workers/worker-pool.js';
import { loadServerConfig } from '../src/config/defaults.js';
import { Logger } from '../src/utils/logger.js';

async function run() {
  const logger = new Logger('error', 'test-timeout-backpressure');

  const timeoutConfig = loadServerConfig({
    RUVLTRA_MIN_WORKERS: '1',
    RUVLTRA_MAX_WORKERS: '1',
    RUVLTRA_INITIAL_WORKERS: '1',
    RUVLTRA_LOG_LEVEL: 'error',
    RUVLTRA_MOCK_LATENCY_MS: '80',
    RUVLTRA_TASK_TIMEOUT_MS: '20',
    RUVLTRA_QUEUE_MAX_LENGTH: '4',
  });

  const timeoutPool = new WorkerPool(timeoutConfig, logger);
  try {
    await assert.rejects(
      timeoutPool.executeTask({
        taskType: 'generate',
        instruction: 'This should timeout',
      }),
      (error: unknown) => error instanceof TaskTimeoutError
    );

    const timeoutStatus = timeoutPool.getStatus();
    assert.ok(timeoutStatus.timedOutTasks >= 1);
    assert.ok(timeoutStatus.cancelledTasks >= 1);
  } finally {
    await timeoutPool.shutdown();
  }

  const backpressureConfig = loadServerConfig({
    RUVLTRA_MIN_WORKERS: '1',
    RUVLTRA_MAX_WORKERS: '1',
    RUVLTRA_INITIAL_WORKERS: '1',
    RUVLTRA_LOG_LEVEL: 'error',
    RUVLTRA_MOCK_LATENCY_MS: '100',
    RUVLTRA_TASK_TIMEOUT_MS: '500',
    RUVLTRA_QUEUE_MAX_LENGTH: '1',
  });

  const backpressurePool = new WorkerPool(backpressureConfig, logger);
  try {
    const task1 = backpressurePool.executeTask({
      taskType: 'generate',
      instruction: 'task-1',
    });
    const task2 = backpressurePool.executeTask({
      taskType: 'generate',
      instruction: 'task-2',
    });
    const task3 = backpressurePool.executeTask({
      taskType: 'generate',
      instruction: 'task-3',
    });

    await assert.rejects(
      task3,
      (error: unknown) => error instanceof QueueOverflowError
    );

    await Promise.all([task1, task2]);
    const backpressureStatus = backpressurePool.getStatus();
    assert.ok(backpressureStatus.rejectedTasks >= 1);
  } finally {
    await backpressurePool.shutdown();
  }

  console.log('Timeout and backpressure test passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
