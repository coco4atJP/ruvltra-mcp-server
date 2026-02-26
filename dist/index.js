#!/usr/bin/env node

// src/core/mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

// src/tools/definitions.ts
var TOOL_DEFINITIONS = [
  {
    name: "ruvltra_code_generate",
    description: "Generate code from natural language description and context using RuvLTRA.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "The natural language instruction for the code generation."
        },
        context: {
          type: "string",
          description: "The surrounding code or necessary context."
        }
      },
      required: ["instruction", "context"]
    }
  },
  {
    name: "ruvltra_code_refactor",
    description: "Refactor existing code according to SONA-learned project style.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The code snippet to refactor."
        },
        instruction: {
          type: "string",
          description: 'Optional specific refactoring instructions (e.g., "extract into class").'
        }
      },
      required: ["code"]
    }
  },
  {
    name: "ruvltra_parallel_generate",
    description: "Generate multiple files concurrently using the worker pool.",
    inputSchema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              filePath: { type: "string" },
              instruction: { type: "string" },
              context: { type: "string" }
            },
            required: ["filePath", "instruction"]
          },
          description: "List of generation tasks to execute in parallel."
        }
      },
      required: ["tasks"]
    }
  }
];

// src/ruvllm/inference-engine.ts
import ruvllm from "@ruvector/ruvllm";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import path from "path";
import os from "os";
import * as fs from "fs";
var { TrajectoryBuilder, SonaCoordinator } = ruvllm;
var InferenceEngine = class {
  sonaEnabled;
  endpoint;
  llamaModel = null;
  llamaContext = null;
  isInitialized = false;
  sona = null;
  constructor(options) {
    this.sonaEnabled = options.sonaEnabled;
    this.endpoint = options.endpoint;
    if (this.sonaEnabled) {
      this.sona = new SonaCoordinator();
    }
  }
  async initialize(modelIdOrPath = "ruvltra-claude-code") {
    if (this.endpoint) {
      console.log(`[RuvLLM Engine] Using HTTP endpoint: ${this.endpoint}`);
      this.isInitialized = true;
      return;
    }
    try {
      console.log(`[RuvLLM Engine] Initializing hybrid engine for model: ${modelIdOrPath}`);
      let modelPath = modelIdOrPath;
      if (modelIdOrPath === "ruvltra-claude-code" || modelIdOrPath === "qwen-base") {
        const defaultPath = path.join(os.homedir(), ".ruvllm", "models", "ruvltra-claude-code-0.5b-q4_k_m.gguf");
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
    } catch (e) {
      console.error(`[RuvLLM Engine] Failed to initialize engine: ${e.message}`);
      console.warn(`[RuvLLM Engine] Will fall back to mock generation.`);
      this.isInitialized = true;
    }
  }
  async generate(instruction, context) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    let builder = null;
    if (this.sonaEnabled && this.sona) {
      builder = new TrajectoryBuilder();
      builder.startStep("query", instruction);
    }
    const prompt = context ? `Context:
${context}

Instruction:
${instruction}

Response:` : `Instruction:
${instruction}

Response:`;
    let resultText = "";
    if (this.endpoint) {
      try {
        const res = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...process.env.RUVLTRA_HTTP_API_KEY && { "Authorization": `Bearer ${process.env.RUVLTRA_HTTP_API_KEY}` }
          },
          body: JSON.stringify({
            model: process.env.RUVLTRA_HTTP_MODEL || "ruvltra-claude-code",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 512,
            temperature: 0.7
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        resultText = data.choices?.[0]?.message?.content || data.content || "";
      } catch (e) {
        console.error(`[RuvLLM Engine] HTTP Endpoint error: ${e.message}`);
        resultText = `// Error calling HTTP endpoint: ${e.message}`;
      }
    } else if (this.llamaContext) {
      const session = new LlamaChatSession({
        contextSequence: this.llamaContext.getSequence()
      });
      console.error(`[RuvLLM Engine] Generating with node-llama-cpp (session isolated)...`);
      resultText = await session.prompt(prompt);
    } else {
      const delay = Math.random() * 500 + 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      resultText = `// Mock Generated code based on: ${instruction}
// Context size: ${context ? context.length : 0} bytes

function generatedTask() {
  console.log("Implementation pending");
}
`;
    }
    if (builder && this.sona) {
      builder.endStep(resultText, 0.9);
      const trajectory = builder.complete("success");
      this.sona.recordTrajectory(trajectory);
      if (Math.random() < 0.2) {
        const stats = this.sona.runBackgroundLoop();
        console.error(`[SONA] Background learning run. Patterns learned: ${stats.patternsLearned}`);
      }
    }
    return resultText;
  }
  async refactor(code, instruction) {
    return this.generate(`Refactor the following code: ${instruction || ""}

Code:
${code}`);
  }
};

// src/core/mcp-server.ts
var RuvltraMcpServer = class {
  server;
  inferenceEngine;
  config;
  constructor(config2) {
    this.config = config2;
    this.server = new Server(
      {
        name: "ruvltra-mcp-server",
        version: "0.1.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    this.inferenceEngine = new InferenceEngine({
      sonaEnabled: this.config.sonaEnabled,
      endpoint: this.config.httpEndpoint
    });
    this.setupHandlers();
  }
  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS
    }));
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      if (!args) {
        throw new McpError(ErrorCode.InvalidParams, "Arguments are required");
      }
      try {
        switch (name) {
          case "ruvltra_code_generate": {
            const { instruction, context } = args;
            const result = await this.inferenceEngine.generate(instruction, context);
            return {
              content: [{ type: "text", text: result }]
            };
          }
          case "ruvltra_code_refactor": {
            const { code, instruction } = args;
            const result = await this.inferenceEngine.refactor(code, instruction);
            return {
              content: [{ type: "text", text: result }]
            };
          }
          case "ruvltra_parallel_generate": {
            const { tasks } = args;
            if (!Array.isArray(tasks)) {
              throw new McpError(ErrorCode.InvalidParams, "Tasks must be an array");
            }
            const promises = tasks.map(async (task) => {
              const code = await this.inferenceEngine.generate(task.instruction, task.context);
              return `File: ${task.filePath}\\n---\\n${code}\\n`;
            });
            const results = await Promise.all(promises);
            return {
              content: [{ type: "text", text: results.join("\\n\\n") }]
            };
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }
  async run() {
    await this.inferenceEngine.initialize(this.config.modelPath);
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[RuvLTRA] MCP Server running on stdio (SONA: ${this.config.sonaEnabled})`);
  }
};

// src/index.ts
import dotenv from "dotenv";
dotenv.config();
var config = {
  maxWorkers: parseInt(process.env.RUVLTRA_MAX_WORKERS || "4", 10),
  sonaEnabled: process.env.RUVLTRA_SONA_ENABLED !== "false",
  modelPath: process.env.RUVLTRA_MODEL_PATH,
  httpEndpoint: process.env.RUVLTRA_HTTP_ENDPOINT,
  httpApiKey: process.env.RUVLTRA_HTTP_API_KEY,
  httpModel: process.env.RUVLTRA_HTTP_MODEL || "ruvltra-claude-code",
  logLevel: process.env.RUVLTRA_LOG_LEVEL || "info"
};
async function main() {
  const server = new RuvltraMcpServer(config);
  await server.run();
}
main().catch((error) => {
  console.error("[RuvLTRA] Fatal error:", error);
  process.exit(1);
});
