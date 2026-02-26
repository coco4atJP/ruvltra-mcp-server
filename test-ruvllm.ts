import * as ruvllm from '@ruvector/ruvllm';
console.log('Exports:', Object.keys(ruvllm));
try {
    const defaultExport = (ruvllm as any).default;
    if (defaultExport) console.log('Default export keys:', Object.keys(defaultExport));
} catch (e) {}