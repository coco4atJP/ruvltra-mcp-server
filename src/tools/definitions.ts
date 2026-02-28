import { ToolName } from '../types.js';

type JsonSchema = Record<string, unknown>;

interface ToolDefinition {
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
}

const ENGLISH_INPUT_NOTE =
  'For best output quality, provide instructions and context in English.';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'ruvltra_code_generate',
    description: `Generate code from instruction and context. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string' },
        context: { type: 'string' },
        language: { type: 'string' },
        filePath: { type: 'string' },
        maxTokens: { type: 'number' },
        temperature: { type: 'number' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['instruction'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        output: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        model: { type: 'string' },
        latencyMs: { type: 'number' },
        taskId: { type: 'string' },
      },
      required: ['output', 'workerId', 'backend', 'latencyMs', 'taskId'],
    },
  },
  {
    name: 'ruvltra_code_review',
    description:
      `Review code for bugs, security, performance, correctness, and maintainability. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        focus: {
          type: 'array',
          items: { type: 'string' },
        },
        language: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        review: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        latencyMs: { type: 'number' },
      },
      required: ['review', 'workerId', 'backend', 'latencyMs'],
    },
  },
  {
    name: 'ruvltra_code_refactor',
    description: `Refactor code while preserving behavior. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        instruction: { type: 'string' },
        language: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        refactored: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        latencyMs: { type: 'number' },
      },
      required: ['refactored', 'workerId', 'backend', 'latencyMs'],
    },
  },
  {
    name: 'ruvltra_code_explain',
    description: `Explain code clearly for a given audience. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        audience: { type: 'string' },
        language: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        explanation: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        latencyMs: { type: 'number' },
      },
      required: ['explanation', 'workerId', 'backend', 'latencyMs'],
    },
  },
  {
    name: 'ruvltra_code_test',
    description: `Generate tests for provided code. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        framework: { type: 'string' },
        language: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        tests: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        latencyMs: { type: 'number' },
      },
      required: ['tests', 'workerId', 'backend', 'latencyMs'],
    },
  },
  {
    name: 'ruvltra_code_fix',
    description: `Fix code using error details and optional guidance. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        error: { type: 'string' },
        instruction: { type: 'string' },
        language: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['code', 'error'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        fix: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        latencyMs: { type: 'number' },
      },
      required: ['fix', 'workerId', 'backend', 'latencyMs'],
    },
  },
  {
    name: 'ruvltra_code_complete',
    description: `Complete partial code from prefix/suffix. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        prefix: { type: 'string' },
        suffix: { type: 'string' },
        language: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['prefix'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        completion: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        latencyMs: { type: 'number' },
      },
      required: ['completion', 'workerId', 'backend', 'latencyMs'],
    },
  },
  {
    name: 'ruvltra_code_translate',
    description: `Translate code between programming languages. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        sourceLanguage: { type: 'string' },
        targetLanguage: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['code', 'targetLanguage'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        translated: { type: 'string' },
        workerId: { type: 'string' },
        backend: { type: 'string' },
        latencyMs: { type: 'number' },
      },
      required: ['translated', 'workerId', 'backend', 'latencyMs'],
    },
  },
  {
    name: 'ruvltra_parallel_generate',
    description: `Generate multiple files concurrently through the worker pool. ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              instruction: { type: 'string' },
              context: { type: 'string' },
              language: { type: 'string' },
            },
            required: ['filePath', 'instruction'],
            additionalProperties: false,
          },
        },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['tasks'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        totalTasks: { type: 'number' },
        totalLatencyMs: { type: 'number' },
        results: { type: 'array' },
      },
      required: ['totalTasks', 'totalLatencyMs', 'results'],
    },
  },
  {
    name: 'ruvltra_swarm_review',
    description: `Run multi-perspective parallel code reviews (up to 8 perspectives). ${ENGLISH_INPUT_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        perspectives: {
          type: 'array',
          items: { type: 'string' },
        },
        maxAgents: { type: 'integer', minimum: 1, maximum: 8 },
        language: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        perspectives: { type: 'number' },
        totalLatencyMs: { type: 'number' },
        reviews: { type: 'array' },
      },
      required: ['perspectives', 'totalLatencyMs', 'reviews'],
    },
  },
  {
    name: 'ruvltra_status',
    description: 'Return server, worker, and backend runtime status.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'object' },
      },
      required: ['status'],
    },
  },
  {
    name: 'ruvltra_sona_stats',
    description: 'Return SONA learning statistics for all workers or a specific worker.',
    inputSchema: {
      type: 'object',
      properties: {
        workerId: { type: 'string' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        sona: { type: 'array' },
      },
      required: ['sona'],
    },
  },
  {
    name: 'ruvltra_scale_workers',
    description: 'Scale worker pool size within configured min/max.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'integer', minimum: 1, maximum: 32 },
      },
      required: ['target'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'object' },
      },
      required: ['status'],
    },
  },
];

const TOOL_NAME_SET = new Set<string>(TOOL_DEFINITIONS.map((tool) => tool.name));

export function isToolName(name: string): name is ToolName {
  return TOOL_NAME_SET.has(name);
}
