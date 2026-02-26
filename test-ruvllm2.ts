import ruvllm from '@ruvector/ruvllm';
const RuvLLM = ruvllm.RuvLLM;
console.log('RuvLLM methods:', Object.getOwnPropertyNames(RuvLLM.prototype));
try {
    const instance = new RuvLLM();
    console.log('Initialized default');
} catch(e) {
    console.error('Error init:', e);
}