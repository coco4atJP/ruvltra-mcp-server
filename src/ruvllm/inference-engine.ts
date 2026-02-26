import ruvllm from '@ruvector/ruvllm';
const { TrajectoryBuilder, SonaCoordinator } = ruvllm as any;
import { getLlama, LlamaChatSession, LlamaContext, LlamaModel } from "node-llama-cpp";
import path from 'path';
import os from 'os';
import * as fs from 'fs';

export class InferenceEngine {
  private sonaEnabled: boolean;
  private endpoint?: string;
  private llamaModel: LlamaModel | null = null;
  private llamaContext: LlamaContext | null = null;
  private isInitialized = false;
  private sona: any | null = null;

  constructor(options: { sonaEnabled: boolean; endpoint?: string }) {
    this.sonaEnabled = options.sonaEnabled;
    this.endpoint = options.endpoint;
    if (this.sonaEnabled) {
      this.sona = new SonaCoordinator();
    }
  }

  async initialize(modelIdOrPath: string = 'ruvltra-claude-code') {
    if (this.endpoint) {
      console.log(`[RuvLLM Engine] Using HTTP endpoint: ${this.endpoint}`);
      this.isInitialized = true;
      return;
    }

    try {
      console.log(`[RuvLLM Engine] Initializing hybrid engine for model: ${modelIdOrPath}`);
      let modelPath = modelIdOrPath;
      
      if (modelIdOrPath === 'ruvltra-claude-code' || modelIdOrPath === 'qwen-base') {
         const defaultPath = path.join(os.homedir(), '.ruvllm', 'models', 'ruvltra-claude-code-0.5b-q4_k_m.gguf');
         if (fs.existsSync(defaultPath)) {
            modelPath = defaultPath;
         } else {
            modelPath = await ruvllm.downloadModel(modelIdOrPath);
         }
      }

      console.log(`[RuvLLM Engine] Loading model with node-llama-cpp: ${modelPath}`);
      const llama = await getLlama();
      this.llamaModel = await llama.loadModel({ modelPath });
      this.llamaContext = await this.llamaModel.createContext();

      console.log(`[RuvLLM Engine] Engine loaded successfully. SONA Enabled: ${this.sonaEnabled}`);
      this.isInitialized = true;
    } catch (e: any) {
      console.error(`[RuvLLM Engine] Failed to initialize engine: ${e.message}`);
      console.warn(`[RuvLLM Engine] Will fall back to mock generation.`);
      this.isInitialized = true;
    }
  }

  async generate(instruction: string, context?: string): Promise<string> {
    if (!this.isInitialized) {
        await this.initialize();
    }

    // SONA: Start tracking trajectory if enabled
    let builder: any = null;
    if (this.sonaEnabled && this.sona) {
        builder = new TrajectoryBuilder();
        builder.startStep('query', instruction);
    }

    const prompt = context 
        ? `Context:\n${context}\n\nInstruction:\n${instruction}\n\nResponse:`
        : `Instruction:\n${instruction}\n\nResponse:`;

    let resultText = '';

    if (this.endpoint) {
        try {
            const res = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.RUVLTRA_HTTP_API_KEY && { 'Authorization': `Bearer ${process.env.RUVLTRA_HTTP_API_KEY}` })
                },
                body: JSON.stringify({
                    model: process.env.RUVLTRA_HTTP_MODEL || 'ruvltra-claude-code',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 512,
                    temperature: 0.7
                })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const data: any = await res.json();
            resultText = data.choices?.[0]?.message?.content || data.content || '';
        } catch (e: any) {
            console.error(`[RuvLLM Engine] HTTP Endpoint error: ${e.message}`);
            resultText = `// Error calling HTTP endpoint: ${e.message}`;
        }
    } else if (this.llamaContext) {
        // Create an isolated session for parallel execution
        const session = new LlamaChatSession({ 
           contextSequence: this.llamaContext.getSequence() 
        });
        console.error(`[RuvLLM Engine] Generating with node-llama-cpp (session isolated)...`);
        resultText = await session.prompt(prompt);
    } else {
        // Mock fallback
        const delay = Math.random() * 500 + 500;
        await new Promise(resolve => setTimeout(resolve, delay));
        resultText = `// Mock Generated code based on: ${instruction}\n// Context size: ${context ? context.length : 0} bytes\n\nfunction generatedTask() {\n  console.log("Implementation pending");\n}\n`;
    }

    // SONA: End tracking and record successful execution
    if (builder && this.sona) {
        builder.endStep(resultText, 0.9); // Assume high confidence for now
        const trajectory = builder.complete('success');
        this.sona.recordTrajectory(trajectory);
        
        // Trigger background learning periodically
        if (Math.random() < 0.2) {
            const stats = this.sona.runBackgroundLoop();
            console.error(`[SONA] Background learning run. Patterns learned: ${stats.patternsLearned}`);
        }
    }

    return resultText;
  }

  async refactor(code: string, instruction?: string): Promise<string> {
    return this.generate(`Refactor the following code: ${instruction || ''}\n\nCode:\n${code}`);
  }
}
