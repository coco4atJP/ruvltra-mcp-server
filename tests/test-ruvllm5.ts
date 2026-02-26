import ruvllm from '@ruvector/ruvllm';
async function test() {
    console.log('Downloading model...');
    const modelPath = await ruvllm.downloadModel('ruvltra-claude-code');
    console.log('Model path:', modelPath);
    const instance = new ruvllm.RuvLLM({ modelPath, maxContext: 4096 });
    console.log('Generating test...');
    const result = await instance.generate('Write a JS function that says hello world.');
    console.log('Result:', result);
}
test();