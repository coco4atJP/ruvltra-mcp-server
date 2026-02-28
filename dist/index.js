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
    description: "Generate code from instruction and context.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        context: { type: "string" },
        language: { type: "string" },
        filePath: { type: "string" },
        maxTokens: { type: "number" },
        temperature: { type: "number" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["instruction"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        output: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        model: { type: "string" },
        latencyMs: { type: "number" },
        taskId: { type: "string" }
      },
      required: ["output", "workerId", "backend", "latencyMs", "taskId"]
    }
  },
  {
    name: "ruvltra_code_review",
    description: "Review code for bugs, security, performance, correctness, and maintainability.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        focus: {
          type: "array",
          items: { type: "string" }
        },
        language: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["code"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        review: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        latencyMs: { type: "number" }
      },
      required: ["review", "workerId", "backend", "latencyMs"]
    }
  },
  {
    name: "ruvltra_code_refactor",
    description: "Refactor code while preserving behavior.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        instruction: { type: "string" },
        language: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["code"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        refactored: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        latencyMs: { type: "number" }
      },
      required: ["refactored", "workerId", "backend", "latencyMs"]
    }
  },
  {
    name: "ruvltra_code_explain",
    description: "Explain code clearly for a given audience.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        audience: { type: "string" },
        language: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["code"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        explanation: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        latencyMs: { type: "number" }
      },
      required: ["explanation", "workerId", "backend", "latencyMs"]
    }
  },
  {
    name: "ruvltra_code_test",
    description: "Generate tests for provided code.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        framework: { type: "string" },
        language: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["code"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        tests: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        latencyMs: { type: "number" }
      },
      required: ["tests", "workerId", "backend", "latencyMs"]
    }
  },
  {
    name: "ruvltra_code_fix",
    description: "Fix code using error details and optional guidance.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        error: { type: "string" },
        instruction: { type: "string" },
        language: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["code", "error"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        fix: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        latencyMs: { type: "number" }
      },
      required: ["fix", "workerId", "backend", "latencyMs"]
    }
  },
  {
    name: "ruvltra_code_complete",
    description: "Complete partial code from prefix/suffix.",
    inputSchema: {
      type: "object",
      properties: {
        prefix: { type: "string" },
        suffix: { type: "string" },
        language: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["prefix"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        completion: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        latencyMs: { type: "number" }
      },
      required: ["completion", "workerId", "backend", "latencyMs"]
    }
  },
  {
    name: "ruvltra_code_translate",
    description: "Translate code between programming languages.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        sourceLanguage: { type: "string" },
        targetLanguage: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["code", "targetLanguage"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        translated: { type: "string" },
        workerId: { type: "string" },
        backend: { type: "string" },
        latencyMs: { type: "number" }
      },
      required: ["translated", "workerId", "backend", "latencyMs"]
    }
  },
  {
    name: "ruvltra_parallel_generate",
    description: "Generate multiple files concurrently through the worker pool.",
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
              context: { type: "string" },
              language: { type: "string" }
            },
            required: ["filePath", "instruction"],
            additionalProperties: false
          }
        },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["tasks"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        totalTasks: { type: "number" },
        totalLatencyMs: { type: "number" },
        results: { type: "array" }
      },
      required: ["totalTasks", "totalLatencyMs", "results"]
    }
  },
  {
    name: "ruvltra_swarm_review",
    description: "Run multi-perspective parallel code reviews (up to 8 perspectives).",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        perspectives: {
          type: "array",
          items: { type: "string" }
        },
        maxAgents: { type: "integer", minimum: 1, maximum: 8 },
        language: { type: "string" },
        timeoutMs: { type: "integer", minimum: 1 }
      },
      required: ["code"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        perspectives: { type: "number" },
        totalLatencyMs: { type: "number" },
        reviews: { type: "array" }
      },
      required: ["perspectives", "totalLatencyMs", "reviews"]
    }
  },
  {
    name: "ruvltra_status",
    description: "Return server, worker, and backend runtime status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "object" }
      },
      required: ["status"]
    }
  },
  {
    name: "ruvltra_sona_stats",
    description: "Return SONA learning statistics for all workers or a specific worker.",
    inputSchema: {
      type: "object",
      properties: {
        workerId: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        sona: { type: "array" }
      },
      required: ["sona"]
    }
  },
  {
    name: "ruvltra_scale_workers",
    description: "Scale worker pool size within configured min/max.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "integer", minimum: 1, maximum: 32 }
      },
      required: ["target"],
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "object" }
      },
      required: ["status"]
    }
  }
];
var TOOL_NAME_SET = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
function isToolName(name) {
  return TOOL_NAME_SET.has(name);
}

// src/tools/handlers.ts
var DEFAULT_SWARM_PERSPECTIVES = [
  "security",
  "performance",
  "quality",
  "maintainability"
];
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
var ToolInputError = class extends Error {
};
var ToolHandlers = class {
  constructor(workerPool, logger) {
    this.workerPool = workerPool;
    this.logger = logger;
  }
  async execute(name, args) {
    const input = isRecord(args) ? args : {};
    switch (name) {
      case "ruvltra_code_generate":
        return this.handleCodeGenerate(input);
      case "ruvltra_code_review":
        return this.handleCodeReview(input);
      case "ruvltra_code_refactor":
        return this.handleCodeRefactor(input);
      case "ruvltra_code_explain":
        return this.handleCodeExplain(input);
      case "ruvltra_code_test":
        return this.handleCodeTest(input);
      case "ruvltra_code_fix":
        return this.handleCodeFix(input);
      case "ruvltra_code_complete":
        return this.handleCodeComplete(input);
      case "ruvltra_code_translate":
        return this.handleCodeTranslate(input);
      case "ruvltra_parallel_generate":
        return this.handleParallelGenerate(input);
      case "ruvltra_swarm_review":
        return this.handleSwarmReview(input);
      case "ruvltra_status":
        return this.wrapResult({
          status: this.workerPool.getStatus()
        });
      case "ruvltra_sona_stats":
        return this.handleSonaStats(input);
      case "ruvltra_scale_workers":
        return this.handleScaleWorkers(input);
      default:
        throw new ToolInputError(`Unsupported tool: ${name}`);
    }
  }
  async handleCodeGenerate(input) {
    const instruction = this.requiredString(input, "instruction");
    const result = await this.runSingleTask({
      taskType: "generate",
      instruction,
      context: this.optionalString(input, "context"),
      language: this.optionalString(input, "language"),
      filePath: this.optionalString(input, "filePath"),
      maxTokens: this.optionalNumber(input, "maxTokens"),
      temperature: this.optionalNumber(input, "temperature"),
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      output: result.text,
      workerId: result.workerId,
      backend: result.backend,
      model: result.model,
      latencyMs: result.latencyMs,
      taskId: result.taskId
    });
  }
  async handleCodeReview(input) {
    const code = this.requiredString(input, "code");
    const focus = this.optionalStringArray(input, "focus");
    const focusList = focus.length > 0 ? focus.join(", ") : "security, performance, quality";
    const instruction = [
      "Review the provided code and report concrete issues.",
      `Focus: ${focusList}`,
      "Format sections: Critical, High, Medium, Low, Suggested fixes.",
      "",
      code
    ].join("\n");
    const result = await this.runSingleTask({
      taskType: "review",
      instruction,
      language: this.optionalString(input, "language"),
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      review: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs
    });
  }
  async handleCodeRefactor(input) {
    const code = this.requiredString(input, "code");
    const instruction = this.optionalString(input, "instruction");
    const fullInstruction = [
      "Refactor the code while preserving behavior.",
      instruction ? `Additional goals: ${instruction}` : "No extra constraints.",
      "Return only refactored code.",
      "",
      code
    ].join("\n");
    const result = await this.runSingleTask({
      taskType: "refactor",
      instruction: fullInstruction,
      language: this.optionalString(input, "language"),
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      refactored: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs
    });
  }
  async handleCodeExplain(input) {
    const code = this.requiredString(input, "code");
    const audience = this.optionalString(input, "audience") ?? "software engineer";
    const instruction = [
      `Explain this code for a ${audience}.`,
      "Cover purpose, control flow, important edge cases, and extension points.",
      "",
      code
    ].join("\n");
    const result = await this.runSingleTask({
      taskType: "explain",
      instruction,
      language: this.optionalString(input, "language"),
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      explanation: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs
    });
  }
  async handleCodeTest(input) {
    const code = this.requiredString(input, "code");
    const framework = this.optionalString(input, "framework") ?? "project default";
    const instruction = [
      `Create automated tests using ${framework}.`,
      "Include happy path, edge cases, and failure path tests.",
      "Return test code only.",
      "",
      code
    ].join("\n");
    const result = await this.runSingleTask({
      taskType: "test",
      instruction,
      language: this.optionalString(input, "language"),
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      tests: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs
    });
  }
  async handleCodeFix(input) {
    const code = this.requiredString(input, "code");
    const error = this.requiredString(input, "error");
    const instruction = this.optionalString(input, "instruction");
    const fullInstruction = [
      "Fix the code based on the reported failure.",
      `Error: ${error}`,
      instruction ? `Additional guidance: ${instruction}` : "",
      "Return fixed code with a brief explanation.",
      "",
      code
    ].filter((line) => line.length > 0).join("\n");
    const result = await this.runSingleTask({
      taskType: "fix",
      instruction: fullInstruction,
      language: this.optionalString(input, "language"),
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      fix: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs
    });
  }
  async handleCodeComplete(input) {
    const prefix = this.requiredString(input, "prefix");
    const suffix = this.optionalString(input, "suffix");
    const instruction = [
      "Complete the missing code between prefix and suffix.",
      "Preserve style and behavior consistency.",
      "",
      "Prefix:",
      prefix,
      "",
      "Suffix:",
      suffix ?? "(none)"
    ].join("\n");
    const result = await this.runSingleTask({
      taskType: "complete",
      instruction,
      language: this.optionalString(input, "language"),
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      completion: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs
    });
  }
  async handleCodeTranslate(input) {
    const code = this.requiredString(input, "code");
    const targetLanguage = this.requiredString(input, "targetLanguage");
    const sourceLanguage = this.optionalString(input, "sourceLanguage") ?? "unknown";
    const instruction = [
      `Translate code from ${sourceLanguage} to ${targetLanguage}.`,
      "Preserve behavior and include idiomatic style in target language.",
      "Return translated code first, then brief migration notes.",
      "",
      code
    ].join("\n");
    const result = await this.runSingleTask({
      taskType: "translate",
      instruction,
      language: targetLanguage,
      timeoutMs: this.optionalInteger(input, "timeoutMs")
    });
    return this.wrapResult({
      translated: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs
    });
  }
  async handleParallelGenerate(input) {
    const tasksValue = input.tasks;
    if (!Array.isArray(tasksValue) || tasksValue.length === 0) {
      throw new ToolInputError("tasks must be a non-empty array");
    }
    const tasks = tasksValue.map((item, index) => {
      if (!isRecord(item)) {
        throw new ToolInputError(`tasks[${index}] must be an object`);
      }
      return {
        filePath: this.requiredString(item, "filePath", `tasks[${index}]`),
        instruction: this.requiredString(item, "instruction", `tasks[${index}]`),
        context: this.optionalString(item, "context"),
        language: this.optionalString(item, "language")
      };
    });
    const startedAt = Date.now();
    const results = await Promise.all(
      tasks.map(async (task) => {
        const generation = await this.workerPool.executeTask({
          taskType: "generate",
          instruction: task.instruction,
          context: task.context,
          language: task.language,
          filePath: task.filePath,
          timeoutMs: this.optionalInteger(input, "timeoutMs")
        });
        return {
          filePath: task.filePath,
          content: generation.text,
          workerId: generation.workerId,
          backend: generation.backend,
          latencyMs: generation.latencyMs
        };
      })
    );
    const totalLatencyMs = Date.now() - startedAt;
    return this.wrapResult({
      totalTasks: tasks.length,
      totalLatencyMs,
      results
    });
  }
  async handleSwarmReview(input) {
    const code = this.requiredString(input, "code");
    const maxAgents = Math.min(8, Math.max(1, this.optionalInteger(input, "maxAgents") ?? 4));
    const userPerspectives = this.optionalStringArray(input, "perspectives");
    const perspectives = userPerspectives.length > 0 ? userPerspectives.slice(0, maxAgents) : DEFAULT_SWARM_PERSPECTIVES.slice(0, maxAgents);
    const startedAt = Date.now();
    const reviews = await Promise.all(
      perspectives.map(async (perspective) => {
        const instruction = [
          `Review this code from the perspective of ${perspective}.`,
          "Provide prioritized findings and concrete remediation steps.",
          "",
          code
        ].join("\n");
        const result = await this.workerPool.executeTask({
          taskType: "review",
          instruction,
          language: this.optionalString(input, "language"),
          timeoutMs: this.optionalInteger(input, "timeoutMs")
        });
        return {
          perspective,
          review: result.text,
          workerId: result.workerId,
          backend: result.backend,
          latencyMs: result.latencyMs
        };
      })
    );
    return this.wrapResult({
      perspectives: reviews.length,
      totalLatencyMs: Date.now() - startedAt,
      reviews
    });
  }
  handleSonaStats(input) {
    const workerId = this.optionalString(input, "workerId");
    return this.wrapResult({
      sona: this.workerPool.getSonaStats(workerId)
    });
  }
  handleScaleWorkers(input) {
    const target = this.requiredInteger(input, "target");
    this.logger.info("Manual scale request", { target });
    const status = this.workerPool.scaleWorkers(target);
    return this.wrapResult({
      status
    });
  }
  async runSingleTask(params) {
    return this.workerPool.executeTask(params);
  }
  wrapResult(payload) {
    if (isRecord(payload)) {
      return {
        text: JSON.stringify(payload, null, 2),
        structuredContent: payload
      };
    }
    return {
      text: JSON.stringify({ value: payload }, null, 2),
      structuredContent: { value: payload }
    };
  }
  requiredString(input, key, objectName = "arguments") {
    const value = input[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ToolInputError(`${objectName}.${key} must be a non-empty string`);
    }
    return value;
  }
  optionalString(input, key) {
    const value = input[key];
    if (value === void 0) {
      return void 0;
    }
    if (typeof value !== "string") {
      throw new ToolInputError(`arguments.${key} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  optionalNumber(input, key) {
    const value = input[key];
    if (value === void 0) {
      return void 0;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ToolInputError(`arguments.${key} must be a number`);
    }
    return value;
  }
  optionalInteger(input, key) {
    const value = this.optionalNumber(input, key);
    if (value === void 0) {
      return void 0;
    }
    if (!Number.isInteger(value)) {
      throw new ToolInputError(`arguments.${key} must be an integer`);
    }
    return value;
  }
  requiredInteger(input, key) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new ToolInputError(`arguments.${key} must be an integer`);
    }
    return value;
  }
  optionalStringArray(input, key) {
    const value = input[key];
    if (value === void 0) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new ToolInputError(`arguments.${key} must be an array of strings`);
    }
    const result = [];
    value.forEach((item, index) => {
      if (typeof item !== "string") {
        throw new ToolInputError(`arguments.${key}[${index}] must be a string`);
      }
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
      }
    });
    return result;
  }
};

// src/utils/logger.ts
var LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
var Logger = class _Logger {
  constructor(level, scope = "core") {
    this.level = level;
    this.scope = scope;
  }
  child(scope) {
    return new _Logger(this.level, scope);
  }
  debug(message, ...meta) {
    this.write("debug", message, meta);
  }
  info(message, ...meta) {
    this.write("info", message, meta);
  }
  warn(message, ...meta) {
    this.write("warn", message, meta);
  }
  error(message, ...meta) {
    this.write("error", message, meta);
  }
  write(level, message, meta) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }
    if (meta.length === 0) {
      console.error(`[RuvLTRA][${level.toUpperCase()}][${this.scope}] ${message}`);
      return;
    }
    console.error(
      `[RuvLTRA][${level.toUpperCase()}][${this.scope}] ${message}`,
      ...meta
    );
  }
};

// src/workers/worker-pool.ts
import path3 from "path";

// src/ruvllm/inference-engine.ts
import fs from "fs";
import os from "os";
import path from "path";
var BACKEND_ORDER = ["http", "llama", "ruvllm", "mock"];
var RUVLLM_NATIVE_PACKAGES = {
  "darwin-x64": "@ruvector/ruvllm-darwin-x64",
  "darwin-arm64": "@ruvector/ruvllm-darwin-arm64",
  "linux-x64": "@ruvector/ruvllm-linux-x64-gnu",
  "linux-arm64": "@ruvector/ruvllm-linux-arm64-gnu",
  "win32-x64": "@ruvector/ruvllm-win32-x64-msvc"
};
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var InferenceEngine = class {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }
  initialized = false;
  activeBackend = "mock";
  backendReady = {
    http: false,
    llama: false,
    ruvllm: false,
    mock: true
  };
  backendNotes = {
    mock: "Fallback backend is always available"
  };
  llamaRuntime;
  ruvllmRuntime;
  httpCircuit = {
    state: "closed",
    consecutiveFailures: 0
  };
  async initialize() {
    if (this.initialized) {
      return;
    }
    this.backendReady.http = Boolean(this.config.httpEndpoint);
    if (this.backendReady.http) {
      this.backendNotes.http = "Configured from RUVLTRA_HTTP_ENDPOINT";
    } else {
      this.backendNotes.http = "RUVLTRA_HTTP_ENDPOINT is not set";
    }
    this.backendReady.llama = await this.tryInitializeLlama();
    this.backendReady.ruvllm = await this.tryInitializeRuvllm();
    this.activeBackend = BACKEND_ORDER.find((backend) => this.backendReady[backend]) ?? "mock";
    this.initialized = true;
    this.logger.info("Inference engine initialized", {
      activeBackend: this.activeBackend,
      readyBackends: BACKEND_ORDER.filter((backend) => this.backendReady[backend])
    });
  }
  async generate(request, signal) {
    if (!this.initialized) {
      await this.initialize();
    }
    this.throwIfAborted(signal);
    const prompt = this.buildPrompt(request);
    const attemptBackends = this.buildAttemptOrder();
    let lastError;
    for (const backend of attemptBackends) {
      if (!this.backendReady[backend]) {
        continue;
      }
      try {
        const result = await this.generateWithBackend(backend, request, prompt, signal);
        this.activeBackend = backend;
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.backendNotes[backend] = `Runtime failure: ${message}`;
        lastError = error instanceof Error ? error : new Error(message);
        this.logger.warn(`Backend ${backend} failed, trying next fallback`, {
          error: message
        });
      }
    }
    if (lastError) {
      throw lastError;
    }
    return this.generateWithMock(request, prompt, signal);
  }
  getStatus() {
    return {
      activeBackend: this.activeBackend,
      readyBackends: BACKEND_ORDER.filter((backend) => this.backendReady[backend]),
      backendNotes: { ...this.backendNotes },
      modelPath: this.resolveModelPath(),
      httpEndpoint: this.config.httpEndpoint,
      httpCircuit: {
        state: this.httpCircuit.state,
        consecutiveFailures: this.httpCircuit.consecutiveFailures,
        openedAt: this.httpCircuit.openedAt ? new Date(this.httpCircuit.openedAt).toISOString() : void 0,
        nextAttemptAt: this.httpCircuit.nextAttemptAt ? new Date(this.httpCircuit.nextAttemptAt).toISOString() : void 0
      }
    };
  }
  async shutdown() {
    const context = this.llamaRuntime?.context;
    if (context?.dispose) {
      try {
        context.dispose();
      } catch {
      }
    }
  }
  async generateWithBackend(backend, request, prompt, signal) {
    switch (backend) {
      case "http":
        return this.generateWithHttp(request, prompt, signal);
      case "llama":
        return this.generateWithLlama(request, prompt, signal);
      case "ruvllm":
        return this.generateWithRuvllm(request, prompt, signal);
      case "mock":
      default:
        return this.generateWithMock(request, prompt, signal);
    }
  }
  async generateWithHttp(request, prompt, signal) {
    const endpoint = this.config.httpEndpoint;
    if (!endpoint) {
      throw new Error("HTTP endpoint is not configured");
    }
    this.throwIfAborted(signal);
    this.ensureHttpCircuitAllowsAttempt();
    const maxTokens = request.maxTokens ?? this.config.maxTokens;
    const temperature = request.temperature ?? this.config.temperature;
    const format = this.resolveHttpFormat();
    const payload = format === "llama" ? {
      prompt,
      n_predict: maxTokens,
      temperature,
      stream: false
    } : {
      model: this.config.httpModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature
    };
    const maxRetries = Math.max(0, this.config.httpMaxRetries);
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      this.throwIfAborted(signal);
      const start = Date.now();
      let cleanupSignal;
      try {
        const requestSignal = this.createRequestSignal(signal, this.config.httpTimeoutMs);
        cleanupSignal = requestSignal.cleanup;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...this.config.httpApiKey ? { authorization: `Bearer ${this.config.httpApiKey}` } : {}
          },
          body: JSON.stringify(payload),
          signal: requestSignal.signal
        });
        if (!response.ok) {
          const statusError = new Error(
            `HTTP ${response.status}: ${response.statusText}`
          );
          statusError.statusCode = response.status;
          throw statusError;
        }
        const data = await response.json();
        const text = this.parseHttpText(data, format);
        if (!text) {
          throw new Error("HTTP response did not include generated content");
        }
        const usage = data.usage ?? {};
        this.recordHttpSuccess();
        return {
          text,
          backend: "http",
          model: this.config.httpModel,
          latencyMs: Date.now() - start,
          promptTokens: this.extractNumber(usage.prompt_tokens),
          completionTokens: this.extractNumber(usage.completion_tokens)
        };
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        if (this.isAbortError(wrapped)) {
          if (signal?.aborted) {
            throw this.abortReason(signal);
          }
          const timeoutError = new Error(
            `HTTP request timed out after ${this.config.httpTimeoutMs}ms`
          );
          lastError = timeoutError;
        } else {
          lastError = wrapped;
        }
        const canRetry = attempt < maxRetries && this.isRetryableHttpError(lastError);
        if (canRetry) {
          const backoff = this.computeRetryDelay(attempt);
          await this.sleepWithSignal(backoff, signal);
          continue;
        }
        this.recordHttpFailure();
      } finally {
        cleanupSignal?.();
      }
    }
    throw lastError ?? new Error("HTTP backend failed");
  }
  async generateWithLlama(request, prompt, signal) {
    if (!this.llamaRuntime) {
      throw new Error("llama.cpp backend is not initialized");
    }
    this.throwIfAborted(signal);
    const start = Date.now();
    const sequence = this.llamaRuntime.context.getSequence?.();
    const sessionOptions = sequence !== void 0 ? { contextSequence: sequence } : { context: this.llamaRuntime.context };
    const session = new this.llamaRuntime.LlamaChatSession(sessionOptions);
    try {
      const text = await this.withAbort(
        session.prompt(prompt, {
          maxTokens: request.maxTokens ?? this.config.maxTokens,
          temperature: request.temperature ?? this.config.temperature
        }),
        signal
      );
      return {
        text,
        backend: "llama",
        model: this.llamaRuntime.modelPath,
        latencyMs: Date.now() - start
      };
    } finally {
      sequence?.dispose?.();
    }
  }
  async generateWithRuvllm(request, prompt, signal) {
    const runtime = this.ruvllmRuntime;
    if (!runtime) {
      throw new Error("RuvLLM backend is not initialized");
    }
    this.throwIfAborted(signal);
    const maxTokens = request.maxTokens ?? this.config.maxTokens;
    const temperature = request.temperature ?? this.config.temperature;
    const start = Date.now();
    let trajectoryBuilder = null;
    if (runtime.trajectoryBuilderCtor && this.config.sonaEnabled) {
      trajectoryBuilder = new runtime.trajectoryBuilderCtor();
      trajectoryBuilder.startStep?.("query", prompt);
    }
    let rawOutput;
    const clientObj = runtime.client;
    if (clientObj?.generate) {
      rawOutput = await this.withAbort(
        Promise.resolve(clientObj.generate(prompt, { maxTokens, temperature })),
        signal
      );
    } else if (clientObj?.query) {
      rawOutput = await this.withAbort(
        Promise.resolve(clientObj.query(prompt, { maxTokens, temperature })),
        signal
      );
    } else {
      const moduleRecord = runtime.module;
      if (moduleRecord.generate) {
        rawOutput = await this.withAbort(
          moduleRecord.generate({
            prompt,
            maxTokens,
            temperature,
            model: this.config.modelPath ?? this.config.httpModel
          }),
          signal
        );
      } else if (moduleRecord.complete) {
        rawOutput = await this.withAbort(
          moduleRecord.complete({
            prompt,
            maxTokens,
            temperature,
            model: this.config.modelPath ?? this.config.httpModel
          }),
          signal
        );
      } else {
        throw new Error("No compatible generate API found in @ruvector/ruvllm");
      }
    }
    const text = this.extractGeneratedText(rawOutput);
    if (!text) {
      throw new Error("RuvLLM returned empty output");
    }
    if (this.isRuvllmFallbackMessage(text)) {
      const fallbackNote = this.markRuvllmAsUnavailable(
        "JavaScript fallback mode detected from generation output"
      );
      throw new Error(fallbackNote);
    }
    if (trajectoryBuilder && runtime.sonaCoordinator) {
      trajectoryBuilder.endStep?.(text, 0.85);
      const trajectory = trajectoryBuilder.complete?.("success");
      if (trajectory && runtime.sonaCoordinator.recordTrajectory) {
        runtime.sonaCoordinator.recordTrajectory(trajectory);
      }
      runtime.sonaCoordinator.runBackgroundLoop?.();
    }
    return {
      text,
      backend: "ruvllm",
      model: this.config.modelPath ?? this.config.httpModel,
      latencyMs: Date.now() - start
    };
  }
  async generateWithMock(request, prompt, signal) {
    this.throwIfAborted(signal);
    const start = Date.now();
    const jitter = Math.floor(Math.random() * 40);
    await this.sleepWithSignal(this.config.mockLatencyMs + jitter, signal);
    const text = [
      `// Mock backend response (${request.taskType})`,
      `// Instruction: ${request.instruction.slice(0, 120)}`,
      request.context ? `// Context length: ${request.context.length}` : "// Context length: 0",
      "",
      "/*",
      "  This is mock output because no inference backend is currently available.",
      "  Configure one of the following for real generations:",
      "  - RUVLTRA_HTTP_ENDPOINT",
      "  - RUVLTRA_MODEL_PATH with node-llama-cpp support",
      "  - @ruvector/ruvllm runtime support",
      "*/",
      "",
      prompt.split("\n").slice(0, 8).join("\n")
    ].join("\n");
    return {
      text,
      backend: "mock",
      model: "mock://ruvltra",
      latencyMs: Date.now() - start
    };
  }
  async tryInitializeLlama() {
    const modelPath = this.resolveModelPath();
    if (!modelPath) {
      this.backendNotes.llama = "Model file not found (set RUVLTRA_MODEL_PATH)";
      return false;
    }
    try {
      const llamaModule = await import("node-llama-cpp");
      const getLlama = llamaModule.getLlama;
      const LlamaChatSession = llamaModule.LlamaChatSession;
      if (!getLlama || !LlamaChatSession) {
        this.backendNotes.llama = "node-llama-cpp API not available";
        return false;
      }
      const llama = await getLlama();
      const model = await llama.loadModel({
        modelPath,
        gpuLayers: this.config.gpuLayers
      });
      const context = await model.createContext({
        contextSize: this.config.contextLength,
        threads: this.config.threads > 0 ? this.config.threads : void 0
      });
      this.llamaRuntime = {
        modelPath,
        context,
        LlamaChatSession
      };
      this.backendNotes.llama = `Loaded model: ${modelPath}`;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.backendNotes.llama = `Initialization failed: ${message}`;
      return false;
    }
  }
  async tryInitializeRuvllm() {
    try {
      let imported;
      try {
        imported = await import("@ruvector/ruvllm");
      } catch {
        const { createRequire } = await import("module");
        const cjsRequire = createRequire(import.meta.url);
        imported = cjsRequire("@ruvector/ruvllm");
      }
      const moduleRecord = "RuvLLM" in imported ? imported : imported.default ?? imported;
      const ruvllmModelId = process.env.RUVLTRA_RUVLLM_MODEL ?? "ruvltra-claude-code";
      let modelPath = this.config.modelPath;
      if (!modelPath) {
        const downloadModel = moduleRecord.downloadModel;
        const isModelDownloaded = moduleRecord.isModelDownloaded;
        if (downloadModel) {
          const alreadyDownloaded = isModelDownloaded?.(ruvllmModelId) ?? false;
          if (!alreadyDownloaded) {
            this.logger.info(`Downloading RuvLLM model: ${ruvllmModelId}...`);
          }
          try {
            modelPath = await downloadModel(ruvllmModelId);
            this.logger.info(`RuvLLM model ready: ${modelPath}`);
          } catch (dlError) {
            const dlMsg = dlError instanceof Error ? dlError.message : String(dlError);
            this.logger.warn(`Model download failed (${ruvllmModelId}): ${dlMsg}`);
          }
        }
      }
      let client = null;
      const RuvLLMClass = moduleRecord.RuvLLM;
      const createClient = moduleRecord.createClient;
      if (RuvLLMClass) {
        client = new RuvLLMClass({
          learningEnabled: this.config.sonaEnabled,
          modelPath,
          model: modelPath ?? this.config.httpModel
        });
      } else if (createClient) {
        client = await createClient({
          model: modelPath ?? this.config.httpModel
        });
      }
      const TrajectoryBuilder = moduleRecord.TrajectoryBuilder;
      const SonaCoordinator = moduleRecord.SonaCoordinator;
      const clientObj = client;
      const clientHasCallableGenerator = typeof clientObj?.generate === "function" || typeof clientObj?.query === "function";
      const moduleHasCallableGenerator = typeof moduleRecord.generate === "function" || typeof moduleRecord.complete === "function";
      if (!clientHasCallableGenerator && !moduleHasCallableGenerator) {
        this.backendNotes.ruvllm = "Initialization failed: no callable generate API found in module/client";
        return false;
      }
      const nativeLoaded = this.detectRuvllmNativeLoaded(moduleRecord, client);
      if (nativeLoaded === false) {
        this.markRuvllmAsUnavailable(
          "JavaScript fallback mode detected at initialization"
        );
        return false;
      }
      this.ruvllmRuntime = {
        module: moduleRecord,
        client,
        trajectoryBuilderCtor: TrajectoryBuilder,
        sonaCoordinator: this.config.sonaEnabled && SonaCoordinator ? new SonaCoordinator() : void 0
      };
      this.backendNotes.ruvllm = "Native @ruvector/ruvllm backend ready";
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.backendNotes.ruvllm = `Initialization failed: ${message}`;
      return false;
    }
  }
  resolveHttpFormat() {
    if (this.config.httpFormat !== "auto") {
      return this.config.httpFormat;
    }
    const endpoint = this.config.httpEndpoint ?? "";
    if (endpoint.includes("/chat/completions") || endpoint.includes("/v1/completions")) {
      return "openai";
    }
    if (endpoint.includes("/completion") || endpoint.includes("/generate")) {
      return "llama";
    }
    return "openai";
  }
  detectRuvllmNativeLoaded(moduleRecord, client) {
    const clientRecord = client;
    const clientNativeLoaded = this.tryCallBoolean(clientRecord?.isNativeLoaded);
    if (typeof clientNativeLoaded === "boolean") {
      return clientNativeLoaded;
    }
    const versionFn = moduleRecord.version;
    const version = this.tryCallString(versionFn);
    if (!version) {
      return void 0;
    }
    return !version.toLowerCase().includes("-js");
  }
  markRuvllmAsUnavailable(reason) {
    this.backendReady.ruvllm = false;
    this.ruvllmRuntime = void 0;
    const packageName = this.getExpectedRuvllmNativePackage();
    const installHint = packageName ? `Install native bindings: npm install ${packageName}` : "Install the platform-specific @ruvector/ruvllm native package";
    const note = `RuvLLM native runtime unavailable (${reason}). ${installHint}`;
    this.backendNotes.ruvllm = note;
    this.logger.warn(note);
    return note;
  }
  getExpectedRuvllmNativePackage() {
    const platformKey = `${process.platform}-${process.arch}`;
    return RUVLLM_NATIVE_PACKAGES[platformKey];
  }
  isRuvllmFallbackMessage(text) {
    const normalized = text.toLowerCase();
    return normalized.includes("[ruvllm javascript fallback mode]") || normalized.includes("no native simd module loaded") || normalized.includes("running in javascript fallback mode");
  }
  tryCallBoolean(fn) {
    if (!fn) {
      return void 0;
    }
    try {
      const result = fn();
      if (typeof result === "boolean") {
        return result;
      }
    } catch {
    }
    return void 0;
  }
  tryCallString(fn) {
    if (!fn) {
      return void 0;
    }
    try {
      const result = fn();
      if (typeof result === "string") {
        return result;
      }
    } catch {
    }
    return void 0;
  }
  buildAttemptOrder() {
    return [...BACKEND_ORDER];
  }
  parseHttpText(data, format) {
    if (format === "llama") {
      return this.extractGeneratedText(data);
    }
    const choices = data.choices;
    const choice = Array.isArray(choices) ? choices[0] : void 0;
    const message = choice?.message;
    const fromChat = message?.content;
    const fromCompletion = choice?.text;
    const parsed = this.extractGeneratedText(fromChat ?? fromCompletion ?? data);
    return parsed;
  }
  extractGeneratedText(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : void 0;
    }
    if (!value || typeof value !== "object") {
      return void 0;
    }
    const record = value;
    const candidates = [
      record.content,
      record.text,
      record.response,
      record.completion,
      record.generated_text,
      record.output
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
      if (candidate && typeof candidate === "object") {
        const nestedText = this.extractGeneratedText(candidate);
        if (nestedText) {
          return nestedText;
        }
      }
    }
    return void 0;
  }
  extractNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return void 0;
  }
  buildPrompt(request) {
    const sections = [];
    sections.push(`Task: ${request.taskType}`);
    if (request.language) {
      sections.push(`Language: ${request.language}`);
    }
    if (request.filePath) {
      sections.push(`File: ${request.filePath}`);
    }
    sections.push("");
    sections.push("Instruction:");
    sections.push(request.instruction.trim());
    if (request.context) {
      sections.push("");
      sections.push("Context:");
      sections.push(request.context.trim());
    }
    sections.push("");
    sections.push("Return only the final answer with clear, practical output.");
    return sections.join("\n");
  }
  resolveModelPath() {
    const configured = this.config.modelPath;
    if (configured && fs.existsSync(configured)) {
      return configured;
    }
    const candidates = [
      path.join(process.cwd(), "models", "ruvltra-claude-code-0.5b-q4_k_m.gguf"),
      path.join(
        os.homedir(),
        ".ruvltra",
        "models",
        "ruvltra-claude-code-0.5b-q4_k_m.gguf"
      )
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return configured;
  }
  createRequestSignal(parent, timeoutMs) {
    const controller = new AbortController();
    const onParentAbort = () => {
      controller.abort(this.abortReason(parent));
    };
    if (parent) {
      if (parent.aborted) {
        onParentAbort();
      } else {
        parent.addEventListener("abort", onParentAbort, { once: true });
      }
    }
    const timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`HTTP request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeoutHandle.unref?.();
    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeoutHandle);
        if (parent) {
          parent.removeEventListener("abort", onParentAbort);
        }
      }
    };
  }
  ensureHttpCircuitAllowsAttempt() {
    if (this.httpCircuit.state !== "open") {
      return;
    }
    const now = Date.now();
    if ((this.httpCircuit.nextAttemptAt ?? 0) <= now) {
      this.httpCircuit.state = "half_open";
      return;
    }
    const waitMs = Math.max(0, (this.httpCircuit.nextAttemptAt ?? 0) - now);
    throw new Error(`HTTP circuit open; retry after ${waitMs}ms`);
  }
  recordHttpSuccess() {
    this.httpCircuit.state = "closed";
    this.httpCircuit.consecutiveFailures = 0;
    this.httpCircuit.openedAt = void 0;
    this.httpCircuit.nextAttemptAt = void 0;
    this.backendNotes.http = "HTTP backend healthy";
  }
  recordHttpFailure() {
    this.httpCircuit.consecutiveFailures += 1;
    if (this.httpCircuit.consecutiveFailures >= this.config.httpCircuitFailureThreshold) {
      this.httpCircuit.state = "open";
      this.httpCircuit.openedAt = Date.now();
      this.httpCircuit.nextAttemptAt = this.httpCircuit.openedAt + this.config.httpCircuitCooldownMs;
      this.backendNotes.http = `Circuit open after ${this.httpCircuit.consecutiveFailures} failures`;
      return;
    }
    if (this.httpCircuit.state === "half_open") {
      this.httpCircuit.state = "open";
      this.httpCircuit.openedAt = Date.now();
      this.httpCircuit.nextAttemptAt = this.httpCircuit.openedAt + this.config.httpCircuitCooldownMs;
      this.backendNotes.http = "Circuit reopened after half-open probe failure";
    }
  }
  isRetryableHttpError(error) {
    const status = error.statusCode;
    if (typeof status === "number") {
      return status === 408 || status === 429 || status >= 500;
    }
    const message = error.message.toLowerCase();
    return message.includes("timeout") || message.includes("network") || message.includes("econnreset") || message.includes("fetch failed");
  }
  computeRetryDelay(attempt) {
    const base = Math.max(1, this.config.httpRetryBaseMs);
    const exponential = Math.min(base * 2 ** attempt, 15e3);
    const jitter = Math.floor(Math.random() * 50);
    return exponential + jitter;
  }
  async sleepWithSignal(ms, signal) {
    if (ms <= 0) {
      return;
    }
    await this.withAbort(delay(ms), signal);
  }
  async withAbort(promise, signal) {
    if (!signal) {
      return promise;
    }
    if (signal.aborted) {
      throw this.abortReason(signal);
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        reject(this.abortReason(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      }).catch((error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      });
    });
  }
  throwIfAborted(signal) {
    if (signal?.aborted) {
      throw this.abortReason(signal);
    }
  }
  abortReason(signal) {
    const reason = signal?.reason;
    if (reason instanceof Error) {
      return reason;
    }
    if (typeof reason === "string" && reason.length > 0) {
      return new Error(reason);
    }
    return new Error("Operation aborted");
  }
  isAbortError(error) {
    const normalized = `${error.name}:${error.message}`.toLowerCase();
    return normalized.includes("abort") || normalized.includes("aborted") || normalized.includes("operation aborted");
  }
};

// src/ruvllm/sona-engine.ts
import fs2 from "fs";
import path2 from "path";
var CONSOLIDATE_INTERVAL = 20;
var MAX_HINTS = 3;
var MAX_PATTERNS = 600;
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function extractKeywords(input) {
  const words = input.toLowerCase().split(/[^a-z0-9_]+/).filter((word) => word.length >= 4);
  return Array.from(new Set(words)).slice(0, 6);
}
var SonaEngine = class {
  constructor(options) {
    this.options = options;
    this.stateFilePath = options.stateFilePath;
    this.persistInterval = Math.max(1, options.persistInterval);
    this.logger = options.logger ?? new Logger("error", `sona:${options.workerId}`);
    this.loadStateFromDisk();
  }
  patterns = /* @__PURE__ */ new Map();
  interactions = 0;
  successes = 0;
  consolidations = 0;
  lastConsolidatedAt;
  stateFilePath;
  persistInterval;
  logger;
  enhanceInstruction(instruction, taskType, language) {
    if (!this.options.enabled) {
      return instruction;
    }
    const hints = this.selectHints(taskType, language);
    if (hints.length === 0) {
      return instruction;
    }
    const hintLines = hints.map((hint, index) => `${index + 1}. ${hint}`).join("\n");
    return [
      "Apply these learned project preferences before answering:",
      hintLines,
      "",
      instruction
    ].join("\n");
  }
  recordInteraction(input) {
    if (!this.options.enabled) {
      return;
    }
    this.interactions += 1;
    if (input.success) {
      this.successes += 1;
    }
    const keys = this.extractPatternKeys(input);
    const quality = this.calculateQuality(input);
    for (const key of keys) {
      this.updatePattern(key, quality, input.success);
    }
    if (this.interactions % CONSOLIDATE_INTERVAL === 0) {
      this.consolidate();
    }
    if (this.interactions % this.persistInterval === 0) {
      this.flush();
    }
  }
  getStats() {
    const topPatterns = this.getTopPatternSummaries(5);
    return {
      workerId: this.options.workerId,
      enabled: this.options.enabled,
      interactions: this.interactions,
      successRate: this.interactions === 0 ? 0 : Number((this.successes / this.interactions).toFixed(4)),
      patternsLearned: this.patterns.size,
      protectedPatterns: Array.from(this.patterns.values()).filter(
        (pattern) => pattern.importance >= 0.6
      ).length,
      consolidations: this.consolidations,
      lastConsolidatedAt: this.lastConsolidatedAt ? new Date(this.lastConsolidatedAt).toISOString() : void 0,
      topPatterns
    };
  }
  flush() {
    if (!this.options.enabled || !this.stateFilePath) {
      return;
    }
    try {
      const payload = {
        version: 1,
        interactions: this.interactions,
        successes: this.successes,
        consolidations: this.consolidations,
        lastConsolidatedAt: this.lastConsolidatedAt,
        patterns: Array.from(this.patterns.values()).map((pattern) => ({
          key: pattern.key,
          score: pattern.score,
          importance: pattern.importance,
          hits: pattern.hits,
          successes: pattern.successes,
          lastSeenAt: pattern.lastSeenAt
        }))
      };
      const parentDir = path2.dirname(this.stateFilePath);
      fs2.mkdirSync(parentDir, { recursive: true });
      fs2.writeFileSync(this.stateFilePath, JSON.stringify(payload), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Failed to persist SONA state", { error: message });
    }
  }
  extractPatternKeys(input) {
    const keys = /* @__PURE__ */ new Set();
    keys.add(`task:${input.taskType}`);
    keys.add("task:general");
    if (input.language) {
      keys.add(`lang:${input.language.toLowerCase()}`);
    }
    if (input.filePath) {
      const extension = this.extractFileExtension(input.filePath);
      if (extension) {
        keys.add(`fileext:${extension.toLowerCase()}`);
      }
    }
    for (const keyword of extractKeywords(input.instruction)) {
      keys.add(`kw:${keyword}`);
    }
    if (input.response.includes("try") && input.response.includes("catch")) {
      keys.add("pattern:error-handling");
    }
    if (input.response.includes("interface ") || input.response.includes("type ")) {
      keys.add("pattern:typed-api");
    }
    return Array.from(keys);
  }
  calculateQuality(input) {
    const base = input.success ? 0.8 : 0.2;
    const latencyPenalty = Math.min(input.latencyMs / 12e3, 0.4);
    const tokenBonus = input.completionTokens !== void 0 ? Math.min(input.completionTokens / 1600, 0.15) : 0;
    const promptPenalty = input.promptTokens !== void 0 ? Math.min(input.promptTokens / 8e3, 0.08) : 0;
    return clamp(base + tokenBonus - latencyPenalty - promptPenalty, 0.05, 1);
  }
  updatePattern(key, quality, success) {
    const now = Date.now();
    const pattern = this.patterns.get(key) ?? {
      key,
      score: 0.5,
      importance: 0.2,
      hits: 0,
      successes: 0,
      lastSeenAt: now
    };
    pattern.hits += 1;
    pattern.successes += success ? 1 : 0;
    pattern.lastSeenAt = now;
    const plasticity = Math.max(0.05, 1 - pattern.importance);
    const alpha = 0.28 * plasticity;
    pattern.score = pattern.score * (1 - alpha) + quality * alpha;
    const stabilityGain = success ? 0.06 : 0.01;
    pattern.importance = clamp(pattern.importance * 0.97 + stabilityGain, 0.05, 0.99);
    this.patterns.set(key, pattern);
  }
  consolidate() {
    this.consolidations += 1;
    this.lastConsolidatedAt = Date.now();
    const now = Date.now();
    for (const [key, pattern] of this.patterns) {
      const ageMinutes = (now - pattern.lastSeenAt) / 6e4;
      const valueScore = pattern.score * 0.65 + pattern.importance * 0.35;
      if (pattern.hits <= 1 && ageMinutes > 30) {
        this.patterns.delete(key);
        continue;
      }
      if (valueScore < 0.22 && ageMinutes > 10) {
        this.patterns.delete(key);
      }
    }
    if (this.patterns.size > MAX_PATTERNS) {
      const candidates = Array.from(this.patterns.values()).sort((a, b) => {
        const left = a.score * 0.7 + a.importance * 0.3;
        const right = b.score * 0.7 + b.importance * 0.3;
        return left - right;
      }).slice(0, this.patterns.size - MAX_PATTERNS);
      for (const pattern of candidates) {
        this.patterns.delete(pattern.key);
      }
    }
    this.flush();
  }
  selectHints(taskType, language) {
    const candidates = Array.from(this.patterns.values()).filter((pattern) => {
      if (pattern.key === `task:${taskType}`) {
        return true;
      }
      if (pattern.key === "task:general") {
        return true;
      }
      if (language && pattern.key === `lang:${language.toLowerCase()}`) {
        return true;
      }
      return pattern.key.startsWith("kw:") || pattern.key.startsWith("pattern:");
    });
    candidates.sort((a, b) => {
      const left = a.score * 0.7 + a.importance * 0.3;
      const right = b.score * 0.7 + b.importance * 0.3;
      return right - left;
    });
    return candidates.slice(0, MAX_HINTS).map((pattern) => this.patternToHint(pattern));
  }
  patternToHint(pattern) {
    if (pattern.key.startsWith("task:")) {
      return `Optimize for ${pattern.key.slice(5)} tasks with concise, directly usable output.`;
    }
    if (pattern.key.startsWith("lang:")) {
      return `Follow idiomatic ${pattern.key.slice(5)} project conventions.`;
    }
    if (pattern.key.startsWith("kw:")) {
      return `Respect prior preference around "${pattern.key.slice(3)}".`;
    }
    if (pattern.key.startsWith("pattern:error-handling")) {
      return "Include defensive error handling for risky branches.";
    }
    if (pattern.key.startsWith("pattern:typed-api")) {
      return "Keep API contracts explicit with strong typing.";
    }
    if (pattern.key.startsWith("fileext:")) {
      return `Match formatting and structure patterns for *.${pattern.key.slice(8)} files.`;
    }
    return `Reuse proven project style from pattern ${pattern.key}.`;
  }
  extractFileExtension(filePath) {
    const segments = filePath.split(".");
    if (segments.length < 2) {
      return void 0;
    }
    return segments[segments.length - 1];
  }
  getTopPatternSummaries(limit) {
    return Array.from(this.patterns.values()).sort((a, b) => {
      const left = a.score * 0.7 + a.importance * 0.3;
      const right = b.score * 0.7 + b.importance * 0.3;
      return right - left;
    }).slice(0, limit).map((pattern) => ({
      key: pattern.key,
      score: Number(pattern.score.toFixed(4)),
      importance: Number(pattern.importance.toFixed(4)),
      hits: pattern.hits
    }));
  }
  loadStateFromDisk() {
    if (!this.options.enabled || !this.stateFilePath) {
      return;
    }
    try {
      if (!fs2.existsSync(this.stateFilePath)) {
        return;
      }
      const raw = fs2.readFileSync(this.stateFilePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.patterns)) {
        return;
      }
      this.interactions = Math.max(0, parsed.interactions ?? 0);
      this.successes = Math.max(0, parsed.successes ?? 0);
      this.consolidations = Math.max(0, parsed.consolidations ?? 0);
      this.lastConsolidatedAt = parsed.lastConsolidatedAt;
      for (const pattern of parsed.patterns) {
        if (typeof pattern.key !== "string" || typeof pattern.score !== "number" || typeof pattern.importance !== "number" || typeof pattern.hits !== "number" || typeof pattern.successes !== "number" || typeof pattern.lastSeenAt !== "number") {
          continue;
        }
        this.patterns.set(pattern.key, {
          key: pattern.key,
          score: clamp(pattern.score, 0.01, 1),
          importance: clamp(pattern.importance, 0.01, 0.99),
          hits: Math.max(0, Math.floor(pattern.hits)),
          successes: Math.max(0, Math.floor(pattern.successes)),
          lastSeenAt: Math.max(0, Math.floor(pattern.lastSeenAt))
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn("Failed to load SONA state", { error: message });
    }
  }
};

// src/workers/worker-pool.ts
function clamp2(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
var QueueOverflowError = class extends Error {
};
var TaskCancelledError = class extends Error {
};
var TaskTimeoutError = class extends Error {
};
var WorkerPool = class {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    for (let index = 0; index < this.config.initialWorkers; index += 1) {
      this.createWorker();
    }
    this.scaleDownTimer = setInterval(() => {
      this.maybeScaleDown();
    }, 5e3);
    this.scaleDownTimer.unref?.();
  }
  workers = [];
  queue = [];
  scaleDownTimer;
  pendingByTaskId = /* @__PURE__ */ new Map();
  runningByTaskId = /* @__PURE__ */ new Map();
  createdWorkers = 0;
  inFlight = 0;
  submittedTasks = 0;
  failedTasks = 0;
  cancelledTasks = 0;
  timedOutTasks = 0;
  rejectedTasks = 0;
  taskCounter = 0;
  scaleDownIdleMs = 2e4;
  executeTask(task) {
    if (this.queue.length >= this.config.queueMaxLength) {
      this.rejectedTasks += 1;
      const suggestedRetryMs = Math.max(50, Math.ceil(this.config.taskTimeoutMs / 4));
      return Promise.reject(
        new QueueOverflowError(
          `Queue limit reached (${this.config.queueMaxLength}). Retry after ~${suggestedRetryMs}ms.`
        )
      );
    }
    const taskId = task.taskId ?? this.nextTaskId();
    const fullTask = { ...task, taskId };
    const timeoutMs = task.timeoutMs ?? this.config.taskTimeoutMs;
    this.submittedTasks += 1;
    return new Promise((resolve, reject) => {
      const queueItem = {
        task: fullTask,
        resolve,
        reject,
        controller: new AbortController(),
        settled: false,
        timedOut: false,
        started: false
      };
      if (timeoutMs > 0) {
        queueItem.timeoutHandle = setTimeout(() => {
          this.timedOutTasks += 1;
          queueItem.timedOut = true;
          this.cancelTask(
            taskId,
            new TaskTimeoutError(`Task ${taskId} timed out after ${timeoutMs}ms`)
          );
        }, timeoutMs);
        queueItem.timeoutHandle.unref?.();
      }
      this.pendingByTaskId.set(taskId, queueItem);
      this.queue.push(queueItem);
      this.maybeScaleUp();
      this.dispatch();
    });
  }
  getStatus() {
    const workers = this.workers.map((worker) => this.toRuntimeStats(worker));
    const backendBreakdown = {
      http: 0,
      llama: 0,
      ruvllm: 0,
      mock: 0
    };
    for (const worker of workers) {
      backendBreakdown[worker.inference.activeBackend] += 1;
    }
    return {
      minWorkers: this.config.minWorkers,
      maxWorkers: this.config.maxWorkers,
      currentWorkers: this.workers.length,
      queueMaxLength: this.config.queueMaxLength,
      queueLength: this.queue.length,
      inFlight: this.inFlight,
      submittedTasks: this.submittedTasks,
      failedTasks: this.failedTasks,
      cancelledTasks: this.cancelledTasks,
      timedOutTasks: this.timedOutTasks,
      rejectedTasks: this.rejectedTasks,
      workers,
      backendBreakdown
    };
  }
  getSonaStats(workerId) {
    const nodes = workerId ? this.workers.filter((worker) => worker.id === workerId) : this.workers;
    return nodes.map((worker) => worker.sona.getStats());
  }
  scaleWorkers(target) {
    const desired = clamp2(Math.round(target), this.config.minWorkers, this.config.maxWorkers);
    if (desired > this.workers.length) {
      while (this.workers.length < desired) {
        this.createWorker();
      }
      this.logger.info("Scaled worker pool up", { workers: this.workers.length });
      return this.getStatus();
    }
    if (desired < this.workers.length) {
      const removable = this.workers.filter((worker) => worker.activeTasks === 0).sort((left, right) => left.lastUsedAt - right.lastUsedAt);
      while (this.workers.length > desired && removable.length > 0) {
        const node = removable.shift();
        if (!node) {
          break;
        }
        this.removeWorker(node);
      }
      this.logger.info("Scaled worker pool down", { workers: this.workers.length });
    }
    return this.getStatus();
  }
  async shutdown() {
    clearInterval(this.scaleDownTimer);
    for (const item of [...this.pendingByTaskId.values(), ...this.runningByTaskId.values()]) {
      this.finishWithError(
        item,
        new TaskCancelledError(`Task ${item.task.taskId} cancelled during shutdown`)
      );
    }
    this.pendingByTaskId.clear();
    this.runningByTaskId.clear();
    this.queue.length = 0;
    for (const worker of this.workers) {
      worker.sona.flush();
    }
    await Promise.all(this.workers.map((worker) => worker.engine.shutdown()));
  }
  dispatch() {
    while (this.queue.length > 0) {
      const worker = this.pickAvailableWorker();
      if (!worker) {
        return;
      }
      const nextItem = this.queue.shift();
      if (!nextItem) {
        return;
      }
      if (nextItem.settled) {
        continue;
      }
      this.runOnWorker(worker, nextItem);
    }
  }
  runOnWorker(worker, item) {
    item.started = true;
    this.pendingByTaskId.delete(item.task.taskId);
    this.runningByTaskId.set(item.task.taskId, item);
    worker.activeTasks += 1;
    worker.lastUsedAt = Date.now();
    this.inFlight += 1;
    const originalInstruction = item.task.instruction;
    const enhancedInstruction = worker.sona.enhanceInstruction(
      originalInstruction,
      item.task.taskType,
      item.task.language
    );
    const request = {
      ...item.task,
      instruction: enhancedInstruction
    };
    worker.engine.generate(request, item.controller.signal).then((result) => {
      if (item.settled) {
        return;
      }
      worker.completedTasks += 1;
      worker.sona.recordInteraction({
        taskType: item.task.taskType,
        instruction: originalInstruction,
        response: result.text,
        success: true,
        latencyMs: result.latencyMs,
        language: item.task.language,
        filePath: item.task.filePath,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens
      });
      this.finishWithSuccess(item, {
        ...result,
        workerId: worker.id,
        taskId: item.task.taskId,
        promptUsed: enhancedInstruction
      });
    }).catch((error) => {
      if (item.settled) {
        return;
      }
      const wrapped = error instanceof Error ? error : new Error(String(error));
      if (!(wrapped instanceof TaskCancelledError) && !(wrapped instanceof TaskTimeoutError)) {
        worker.failedTasks += 1;
        this.failedTasks += 1;
      } else {
        this.cancelledTasks += 1;
      }
      worker.sona.recordInteraction({
        taskType: item.task.taskType,
        instruction: originalInstruction,
        response: wrapped.message,
        success: false,
        latencyMs: 0,
        language: item.task.language,
        filePath: item.task.filePath
      });
      this.finishWithError(item, wrapped);
    }).finally(() => {
      worker.activeTasks -= 1;
      worker.lastUsedAt = Date.now();
      this.inFlight -= 1;
      this.runningByTaskId.delete(item.task.taskId);
      this.maybeScaleDown();
      this.dispatch();
    });
  }
  pickAvailableWorker() {
    if (this.workers.length === 0) {
      return void 0;
    }
    return this.workers.slice().filter((worker) => worker.activeTasks === 0).sort((left, right) => {
      return left.lastUsedAt - right.lastUsedAt;
    })[0];
  }
  maybeScaleUp() {
    const shouldScale = this.queue.length > this.workers.length && this.workers.length < this.config.maxWorkers;
    if (!shouldScale) {
      return;
    }
    this.createWorker();
    this.logger.debug("Auto-scaled worker pool up", {
      workers: this.workers.length,
      queueLength: this.queue.length
    });
  }
  maybeScaleDown() {
    if (this.workers.length <= this.config.minWorkers) {
      return;
    }
    const now = Date.now();
    const idleWorkers = this.workers.filter(
      (worker) => worker.activeTasks === 0 && now - worker.lastUsedAt > this.scaleDownIdleMs
    ).sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    if (idleWorkers.length === 0) {
      return;
    }
    const removable = idleWorkers[0];
    if (!removable) {
      return;
    }
    if (this.workers.length > this.config.minWorkers) {
      this.removeWorker(removable);
      this.logger.debug("Auto-scaled worker pool down", {
        workers: this.workers.length
      });
    }
  }
  createWorker() {
    this.createdWorkers += 1;
    const id = `worker-${this.createdWorkers}`;
    const workerLogger = this.logger.child(id);
    const engine = new InferenceEngine(this.config, workerLogger.child("inference"));
    const sona = new SonaEngine({
      workerId: id,
      enabled: this.config.sonaEnabled,
      stateFilePath: this.resolveSonaStatePath(id),
      persistInterval: this.config.sonaPersistInterval,
      logger: workerLogger.child("sona")
    });
    const node = {
      id,
      engine,
      sona,
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      lastUsedAt: Date.now()
    };
    this.workers.push(node);
    return node;
  }
  removeWorker(worker) {
    const index = this.workers.findIndex((item) => item.id === worker.id);
    if (index === -1) {
      return;
    }
    this.workers.splice(index, 1);
    worker.sona.flush();
    void worker.engine.shutdown();
  }
  toRuntimeStats(worker) {
    return {
      workerId: worker.id,
      activeTasks: worker.activeTasks,
      completedTasks: worker.completedTasks,
      failedTasks: worker.failedTasks,
      lastUsedAt: new Date(worker.lastUsedAt).toISOString(),
      inference: worker.engine.getStatus()
    };
  }
  nextTaskId() {
    this.taskCounter += 1;
    return `task-${Date.now()}-${this.taskCounter}`;
  }
  resolveSonaStatePath(workerId) {
    if (!this.config.sonaEnabled) {
      return void 0;
    }
    const baseDir = this.config.sonaStateDir ?? path3.join(process.cwd(), ".ruvltra-state", "sona");
    return path3.join(baseDir, `${workerId}.json`);
  }
  cancelTask(taskId, reason) {
    const pending = this.pendingByTaskId.get(taskId);
    if (pending) {
      this.cancelledTasks += 1;
      this.pendingByTaskId.delete(taskId);
      this.removeFromQueue(taskId);
      pending.controller.abort(reason);
      this.finishWithError(pending, reason);
      return;
    }
    const running = this.runningByTaskId.get(taskId);
    if (running) {
      this.cancelledTasks += 1;
      running.controller.abort(reason);
      this.finishWithError(running, reason);
    }
  }
  removeFromQueue(taskId) {
    const index = this.queue.findIndex((item) => item.task.taskId === taskId);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }
  finishWithSuccess(item, result) {
    if (item.settled) {
      return;
    }
    item.settled = true;
    if (item.timeoutHandle) {
      clearTimeout(item.timeoutHandle);
    }
    item.resolve(result);
  }
  finishWithError(item, error) {
    if (item.settled) {
      return;
    }
    item.settled = true;
    if (item.timeoutHandle) {
      clearTimeout(item.timeoutHandle);
    }
    item.reject(error);
  }
};

// src/core/mcp-server.ts
var RuvltraMcpServer = class {
  server;
  config;
  logger;
  workerPool;
  toolHandlers;
  constructor(config) {
    this.config = config;
    this.logger = new Logger(config.logLevel, "mcp");
    this.server = new Server(
      {
        name: "ruvltra-mcp-server",
        version: "0.2.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    this.workerPool = new WorkerPool(this.config, this.logger.child("pool"));
    this.toolHandlers = new ToolHandlers(this.workerPool, this.logger.child("tools"));
    this.setupHandlers();
    this.setupSignalHandlers();
  }
  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS
    }));
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      if (!isToolName(name)) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
      try {
        const result = await this.toolHandlers.execute(name, args ?? {});
        return {
          content: [{ type: "text", text: result.text }],
          ...result.structuredContent ? { structuredContent: result.structuredContent } : {},
          ...result.isError ? { isError: true } : {}
        };
      } catch (error) {
        if (error instanceof ToolInputError) {
          throw new McpError(ErrorCode.InvalidParams, error.message);
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Tool execution failed for ${name}`, { error: message });
        return {
          content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
          isError: true
        };
      }
    });
    this.server.onerror = (error) => this.logger.error("MCP runtime error", error);
  }
  setupSignalHandlers() {
    const shutdown = async (signal) => {
      this.logger.info(`Received ${signal}, shutting down`);
      await this.workerPool.shutdown();
      process.exit(0);
    };
    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  }
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    const status = this.workerPool.getStatus();
    this.logger.info("MCP server running on stdio", {
      workers: status.currentWorkers,
      minWorkers: status.minWorkers,
      maxWorkers: status.maxWorkers,
      sonaEnabled: this.config.sonaEnabled
    });
  }
};

// src/config/defaults.ts
import fs3 from "fs";
import os2 from "os";
import path4 from "path";
var DEFAULT_CONFIG = {
  minWorkers: 2,
  maxWorkers: 8,
  initialWorkers: 2,
  queueMaxLength: 256,
  taskTimeoutMs: 6e4,
  sonaEnabled: true,
  sonaStateDir: void 0,
  sonaPersistInterval: 10,
  modelPath: void 0,
  httpEndpoint: void 0,
  httpApiKey: void 0,
  httpModel: "ruvltra-claude-code",
  httpFormat: "auto",
  httpTimeoutMs: 15e3,
  httpMaxRetries: 2,
  httpRetryBaseMs: 250,
  httpCircuitFailureThreshold: 5,
  httpCircuitCooldownMs: 3e4,
  llamaCppPath: void 0,
  contextLength: 4096,
  gpuLayers: -1,
  threads: 0,
  maxTokens: 512,
  temperature: 0.2,
  mockLatencyMs: 120,
  logLevel: "info"
};
function clamp3(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function parseInteger(raw, fallback, min, max) {
  if (raw === void 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (min === void 0 || max === void 0) {
    return parsed;
  }
  return clamp3(parsed, min, max);
}
function parseNumber(raw, fallback, min, max) {
  if (raw === void 0) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (min === void 0 || max === void 0) {
    return parsed;
  }
  return clamp3(parsed, min, max);
}
function parseBoolean(raw, fallback) {
  if (raw === void 0) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}
function parseLogLevel(raw, fallback) {
  if (raw === void 0) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return fallback;
}
function parseHttpFormat(raw, fallback) {
  if (raw === void 0) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "auto" || normalized === "openai" || normalized === "llama") {
    return normalized;
  }
  return fallback;
}
function parseOptionalString(raw) {
  if (raw === void 0) {
    return void 0;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function expandHome(rawPath) {
  if (!rawPath) {
    return void 0;
  }
  if (rawPath === "~") {
    return os2.homedir();
  }
  if (rawPath.startsWith("~/")) {
    return path4.join(os2.homedir(), rawPath.slice(2));
  }
  return rawPath;
}
function loadConfigFile(configPath) {
  const resolvedPath = expandHome(configPath);
  if (!resolvedPath) {
    return {};
  }
  try {
    const content = fs3.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(content);
    return parsed;
  } catch {
    return {};
  }
}
function mergeConfig(base, override) {
  return { ...base, ...override };
}
function loadServerConfig(env) {
  const fileConfig = loadConfigFile(parseOptionalString(env.RUVLTRA_CONFIG));
  const fromEnv = {
    minWorkers: parseInteger(env.RUVLTRA_MIN_WORKERS, DEFAULT_CONFIG.minWorkers, 1, 32),
    maxWorkers: parseInteger(env.RUVLTRA_MAX_WORKERS, DEFAULT_CONFIG.maxWorkers, 1, 32),
    initialWorkers: parseInteger(
      env.RUVLTRA_INITIAL_WORKERS,
      DEFAULT_CONFIG.initialWorkers,
      1,
      32
    ),
    queueMaxLength: parseInteger(
      env.RUVLTRA_QUEUE_MAX_LENGTH,
      DEFAULT_CONFIG.queueMaxLength,
      1,
      5e4
    ),
    taskTimeoutMs: parseInteger(
      env.RUVLTRA_TASK_TIMEOUT_MS,
      DEFAULT_CONFIG.taskTimeoutMs,
      100,
      6e5
    ),
    sonaEnabled: parseBoolean(env.RUVLTRA_SONA_ENABLED, DEFAULT_CONFIG.sonaEnabled),
    sonaStateDir: expandHome(parseOptionalString(env.RUVLTRA_SONA_STATE_DIR)),
    sonaPersistInterval: parseInteger(
      env.RUVLTRA_SONA_PERSIST_INTERVAL,
      DEFAULT_CONFIG.sonaPersistInterval,
      1,
      1e3
    ),
    modelPath: expandHome(parseOptionalString(env.RUVLTRA_MODEL_PATH)),
    httpEndpoint: parseOptionalString(env.RUVLTRA_HTTP_ENDPOINT),
    httpApiKey: parseOptionalString(env.RUVLTRA_HTTP_API_KEY),
    httpModel: parseOptionalString(env.RUVLTRA_HTTP_MODEL) ?? DEFAULT_CONFIG.httpModel,
    httpFormat: parseHttpFormat(env.RUVLTRA_HTTP_FORMAT, DEFAULT_CONFIG.httpFormat),
    httpTimeoutMs: parseInteger(
      env.RUVLTRA_HTTP_TIMEOUT_MS,
      DEFAULT_CONFIG.httpTimeoutMs,
      100,
      12e4
    ),
    httpMaxRetries: parseInteger(
      env.RUVLTRA_HTTP_MAX_RETRIES,
      DEFAULT_CONFIG.httpMaxRetries,
      0,
      10
    ),
    httpRetryBaseMs: parseInteger(
      env.RUVLTRA_HTTP_RETRY_BASE_MS,
      DEFAULT_CONFIG.httpRetryBaseMs,
      10,
      6e4
    ),
    httpCircuitFailureThreshold: parseInteger(
      env.RUVLTRA_HTTP_CIRCUIT_FAILURE_THRESHOLD,
      DEFAULT_CONFIG.httpCircuitFailureThreshold,
      1,
      100
    ),
    httpCircuitCooldownMs: parseInteger(
      env.RUVLTRA_HTTP_CIRCUIT_COOLDOWN_MS,
      DEFAULT_CONFIG.httpCircuitCooldownMs,
      1e3,
      6e5
    ),
    llamaCppPath: expandHome(parseOptionalString(env.LLAMA_CPP_PATH)),
    contextLength: parseInteger(
      env.RUVLTRA_CONTEXT_LENGTH,
      DEFAULT_CONFIG.contextLength,
      512,
      32768
    ),
    gpuLayers: parseInteger(env.RUVLTRA_GPU_LAYERS, DEFAULT_CONFIG.gpuLayers, -1, 256),
    threads: parseInteger(env.RUVLTRA_THREADS, DEFAULT_CONFIG.threads, 0, 128),
    maxTokens: parseInteger(env.RUVLTRA_MAX_TOKENS, DEFAULT_CONFIG.maxTokens, 64, 8192),
    temperature: parseNumber(env.RUVLTRA_TEMPERATURE, DEFAULT_CONFIG.temperature, 0, 2),
    mockLatencyMs: parseInteger(
      env.RUVLTRA_MOCK_LATENCY_MS,
      DEFAULT_CONFIG.mockLatencyMs,
      0,
      5e3
    ),
    logLevel: parseLogLevel(env.RUVLTRA_LOG_LEVEL, DEFAULT_CONFIG.logLevel)
  };
  const merged = mergeConfig(mergeConfig(DEFAULT_CONFIG, fileConfig), fromEnv);
  const minWorkers = clamp3(Math.round(merged.minWorkers), 1, 32);
  const maxWorkers = clamp3(Math.round(merged.maxWorkers), minWorkers, 32);
  const initialWorkers = clamp3(
    Math.round(merged.initialWorkers),
    minWorkers,
    maxWorkers
  );
  const queueMaxLength = clamp3(
    Math.round(merged.queueMaxLength),
    maxWorkers,
    5e4
  );
  return {
    ...merged,
    minWorkers,
    maxWorkers,
    initialWorkers,
    queueMaxLength
  };
}

// src/index.ts
import dotenv from "dotenv";
dotenv.config();
console.log = (...args) => console.error(...args);
async function main() {
  const config = loadServerConfig(process.env);
  const server = new RuvltraMcpServer(config);
  await server.run();
}
main().catch((error) => {
  console.error("[RuvLTRA] Fatal error:", error);
  process.exit(1);
});
