import { getLlama, LlamaChatSession } from "node-llama-cpp";
import path from "path";
import os from "os";

async function testLlama() {
    const llama = await getLlama();
    const modelPath = path.join(os.homedir(), '.ruvllm', 'models', 'ruvltra-claude-code-0.5b-q4_k_m.gguf');
    
    console.log(`Loading model from: ${modelPath}`);
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext();
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });

    console.log("Generating response...");
    const response = await session.prompt("Write a short Javascript function that adds two numbers.");
    console.log("Response: ", response);
}

testLlama().catch(console.error);