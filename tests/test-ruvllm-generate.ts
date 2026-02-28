import { InferenceEngine } from '../src/ruvllm/inference-engine.js';
import { loadServerConfig } from '../src/config/defaults.js';
import { Logger } from '../src/utils/logger.js';

async function main() {
    const config = loadServerConfig({
        RUVLTRA_LOG_LEVEL: 'debug',
        RUVLTRA_SONA_ENABLED: 'true'
    });
    const logger = new Logger('debug', 'test-ruvllm');
    const engine = new InferenceEngine(config, logger);

    await engine.initialize();

    const result = await engine.generate({
        taskType: 'generate',
        instruction: 'say hello'
    });
    console.log('Result:', result);
}

main().catch(console.error);
