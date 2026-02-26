import { InferenceEngine } from './src/ruvllm/inference-engine.js';
async function run() {
    const engine = new InferenceEngine({ sonaEnabled: true });
    await engine.initialize('ruvltra-claude-code');
    console.log('Engine initialized');
    const result = await engine.generate('Write a quick greeting in python');
    console.log('Output: ', result);
}
run();