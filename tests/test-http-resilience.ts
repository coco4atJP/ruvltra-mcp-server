import assert from 'node:assert/strict';
import http from 'node:http';
import { InferenceEngine } from '../src/ruvllm/inference-engine.js';
import { loadServerConfig } from '../src/config/defaults.js';
import { Logger } from '../src/utils/logger.js';

type Mode = 'flaky-once' | 'always-fail' | 'healthy';

async function run() {
  let mode: Mode = 'flaky-once';
  let hitCount = 0;

  const server = http.createServer((_, res) => {
    hitCount += 1;

    if (mode === 'always-fail') {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'temporary failure' }));
      return;
    }

    if (mode === 'flaky-once' && hitCount === 1) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'fail once' }));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: 'ok-from-http' } }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test HTTP server');
  }
  const endpoint = `http://127.0.0.1:${address.port}/v1/chat/completions`;
  const logger = new Logger('error', 'test-http-resilience');

  const retryConfig = loadServerConfig({
    RUVLTRA_HTTP_ENDPOINT: endpoint,
    RUVLTRA_HTTP_FORMAT: 'openai',
    RUVLTRA_HTTP_MAX_RETRIES: '1',
    RUVLTRA_HTTP_TIMEOUT_MS: '2000',
    RUVLTRA_HTTP_CIRCUIT_FAILURE_THRESHOLD: '5',
    RUVLTRA_HTTP_CIRCUIT_COOLDOWN_MS: '300',
    RUVLTRA_MOCK_LATENCY_MS: '1',
    RUVLTRA_LOG_LEVEL: 'error',
  });
  const retryEngine = new InferenceEngine(retryConfig, logger);

  try {
    const retryResult = await retryEngine.generate({
      taskType: 'generate',
      instruction: 'retry check',
    });
    assert.equal(retryResult.backend, 'http');
    assert.equal(retryResult.text, 'ok-from-http');
    assert.equal(hitCount, 2);
  } finally {
    await retryEngine.shutdown();
  }

  mode = 'always-fail';
  hitCount = 0;
  const cooldownMs = 1000;

  const circuitConfig = loadServerConfig({
    RUVLTRA_HTTP_ENDPOINT: endpoint,
    RUVLTRA_HTTP_FORMAT: 'openai',
    RUVLTRA_HTTP_MAX_RETRIES: '0',
    RUVLTRA_HTTP_TIMEOUT_MS: '2000',
    RUVLTRA_HTTP_CIRCUIT_FAILURE_THRESHOLD: '2',
    RUVLTRA_HTTP_CIRCUIT_COOLDOWN_MS: String(cooldownMs),
    RUVLTRA_MOCK_LATENCY_MS: '1',
    RUVLTRA_LOG_LEVEL: 'error',
  });
  const circuitEngine = new InferenceEngine(circuitConfig, logger);

  try {
    const first = await circuitEngine.generate({
      taskType: 'generate',
      instruction: 'circuit first failure',
    });
    const second = await circuitEngine.generate({
      taskType: 'generate',
      instruction: 'circuit second failure',
    });
    assert.equal(first.backend, 'mock');
    assert.equal(second.backend, 'mock');

    const beforeThirdHit = hitCount;
    const third = await circuitEngine.generate({
      taskType: 'generate',
      instruction: 'should short-circuit',
    });
    assert.equal(third.backend, 'mock');
    assert.equal(hitCount, beforeThirdHit);

    mode = 'healthy';
    await new Promise((resolve) => setTimeout(resolve, cooldownMs + 150));

    const recovered = await circuitEngine.generate({
      taskType: 'generate',
      instruction: 'recover after cooldown',
    });
    assert.equal(recovered.backend, 'http');
    assert.equal(recovered.text, 'ok-from-http');
  } finally {
    await circuitEngine.shutdown();
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  console.log('HTTP resilience test passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
