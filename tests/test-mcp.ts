import assert from 'node:assert/strict';
import { loadServerConfig } from '../src/config/defaults.js';
import { ToolHandlers } from '../src/tools/handlers.js';
import { Logger } from '../src/utils/logger.js';
import { WorkerPool } from '../src/workers/worker-pool.js';

async function run() {
  const config = loadServerConfig({
    RUVLTRA_MIN_WORKERS: '2',
    RUVLTRA_MAX_WORKERS: '4',
    RUVLTRA_INITIAL_WORKERS: '2',
    RUVLTRA_LOG_LEVEL: 'error',
    RUVLTRA_SONA_ENABLED: 'true',
    RUVLTRA_MOCK_LATENCY_MS: '1',
  });

  const pool = new WorkerPool(config, new Logger('error', 'test-pool'));
  const handlers = new ToolHandlers(pool, new Logger('error', 'test-tools'));

  try {
    const statusRaw = await handlers.execute('ruvltra_status', {});
    assert.ok(statusRaw.structuredContent);
    const statusPayload = statusRaw.structuredContent as {
      status: { currentWorkers: number; maxWorkers: number };
    };
    assert.ok(statusPayload.status.currentWorkers >= 2);
    assert.equal(statusPayload.status.maxWorkers, 4);

    const generationRaw = await handlers.execute('ruvltra_code_generate', {
      instruction: 'Create a hello world function',
      language: 'typescript',
    });
    assert.ok(generationRaw.structuredContent);
    const generationPayload = generationRaw.structuredContent as {
      output: string;
      backend: string;
    };
    assert.equal(typeof generationPayload.output, 'string');
    assert.ok(generationPayload.output.length > 0);
    assert.equal(typeof generationPayload.backend, 'string');

    const parallelRaw = await handlers.execute('ruvltra_parallel_generate', {
      tasks: [
        { filePath: 'a.ts', instruction: 'make module a' },
        { filePath: 'b.ts', instruction: 'make module b' },
        { filePath: 'c.ts', instruction: 'make module c' },
        { filePath: 'd.ts', instruction: 'make module d' },
      ],
    });
    assert.ok(parallelRaw.structuredContent);
    const parallelPayload = parallelRaw.structuredContent as {
      totalTasks: number;
      results: Array<{ filePath: string; content: string }>;
    };
    assert.equal(parallelPayload.totalTasks, 4);
    assert.equal(parallelPayload.results.length, 4);
    assert.ok(parallelPayload.results.every((item) => item.content.length > 0));

    console.log('MCP smoke test passed');
  } finally {
    await pool.shutdown();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
