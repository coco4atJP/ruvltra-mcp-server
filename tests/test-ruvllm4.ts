import ruvllm from '@ruvector/ruvllm';
console.log('Available models:', ruvllm.RUVLTRA_MODELS);
async function test() {
    try {
        console.log('Downloading model...');
        // const modelPath = await ruvllm.downloadModel('ruvltra-claude-code');
        // Let's just create an instance for now
        const instance = new ruvllm.RuvLLM();
        console.log('Native loaded?', instance.isNativeLoaded());
    } catch(e) {
        console.error(e);
    }
}
test();