import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadServerConfig } from '../src/config/defaults.js';
import { Logger } from '../src/utils/logger.js';
import { WorkerPool } from '../src/workers/worker-pool.js';

async function run() {
  const stateDir = path.join(process.cwd(), 'tests', '.tmp-sona-state');
  fs.rmSync(stateDir, { recursive: true, force: true });

  const config = loadServerConfig({
    RUVLTRA_MIN_WORKERS: '1',
    RUVLTRA_MAX_WORKERS: '1',
    RUVLTRA_INITIAL_WORKERS: '1',
    RUVLTRA_LOG_LEVEL: 'error',
    RUVLTRA_SONA_ENABLED: 'true',
    RUVLTRA_SONA_STATE_DIR: stateDir,
    RUVLTRA_SONA_PERSIST_INTERVAL: '1',
    RUVLTRA_MOCK_LATENCY_MS: '1',
  });

  const logger = new Logger('error', 'test-sona-persist');

  const poolA = new WorkerPool(config, logger);
  try {
    await poolA.executeTask({
      taskType: 'generate',
      instruction: 'first interaction',
      language: 'typescript',
      filePath: 'src/a.ts',
    });
    await poolA.executeTask({
      taskType: 'generate',
      instruction: 'second interaction',
      language: 'typescript',
      filePath: 'src/b.ts',
    });
  } finally {
    await poolA.shutdown();
  }

  const stateFile = path.join(stateDir, 'worker-1.json');
  assert.ok(fs.existsSync(stateFile));
  const persistedRaw = fs.readFileSync(stateFile, 'utf8');
  const persisted = JSON.parse(persistedRaw) as {
    interactions: number;
    patterns: unknown[];
  };
  assert.ok(persisted.interactions >= 2);
  assert.ok(Array.isArray(persisted.patterns));

  const poolB = new WorkerPool(config, logger);
  try {
    const stats = poolB.getSonaStats('worker-1');
    assert.equal(stats.length, 1);
    assert.ok(stats[0].interactions >= 2);
  } finally {
    await poolB.shutdown();
  }

  fs.rmSync(stateDir, { recursive: true, force: true });
  console.log('SONA persistence test passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
