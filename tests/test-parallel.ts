import { loadServerConfig } from '../src/config/defaults.js';
import { Logger } from '../src/utils/logger.js';
import { WorkerPool } from '../src/workers/worker-pool.js';

async function run() {
  const config = loadServerConfig({
    RUVLTRA_MIN_WORKERS: '2',
    RUVLTRA_MAX_WORKERS: '8',
    RUVLTRA_INITIAL_WORKERS: '2',
    RUVLTRA_LOG_LEVEL: 'error',
    RUVLTRA_MOCK_LATENCY_MS: '1',
  });

  const pool = new WorkerPool(config, new Logger('error', 'parallel-test'));
  try {
    const tasks = [
      { taskType: 'generate' as const, instruction: 'Write python hello world' },
      { taskType: 'generate' as const, instruction: 'Write js hello world' },
      { taskType: 'generate' as const, instruction: 'Write rust hello world' },
    ];

    const results = await Promise.all(tasks.map((task) => pool.executeTask(task)));
    results.forEach((result, index) => {
      console.log(
        `Result ${index + 1}: worker=${result.workerId} backend=${result.backend}\n${result.text}\n`
      );
    });
  } finally {
    await pool.shutdown();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
