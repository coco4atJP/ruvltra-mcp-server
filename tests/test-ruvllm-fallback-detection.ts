import assert from 'node:assert/strict';
import { InferenceEngine } from '../src/ruvllm/inference-engine.js';
import { loadServerConfig } from '../src/config/defaults.js';
import { Logger } from '../src/utils/logger.js';

async function run() {
  const config = loadServerConfig({
    RUVLTRA_LOG_LEVEL: 'error',
    RUVLTRA_MOCK_LATENCY_MS: '1',
    RUVLTRA_SONA_ENABLED: 'false',
  });
  const logger = new Logger('error', 'test-ruvllm-fallback-detection');
  const engine = new InferenceEngine(config, logger);

  // Bypass initialize() to inject a controlled fallback runtime.
  (engine as any).initialized = true;
  (engine as any).backendReady.ruvllm = true;
  (engine as any).ruvllmRuntime = {
    module: {},
    client: {
      generate: () =>
        `[RuvLLM JavaScript Fallback Mode]
No native SIMD module loaded. Running in JavaScript fallback mode.`,
    },
  };

  const result = await engine.generate({
    taskType: 'generate',
    instruction: 'Return hello world',
  });

  assert.equal(result.backend, 'mock');

  const status = engine.getStatus();
  assert.equal(status.readyBackends.includes('ruvllm'), false);
  assert.match(
    status.backendNotes.ruvllm ?? '',
    /native runtime unavailable|fallback mode/i
  );

  console.log('RuvLLM fallback detection test passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
