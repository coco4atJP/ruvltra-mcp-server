export const TOOL_DEFINITIONS = [
  {
    name: 'ruvltra_code_generate',
    description: 'Generate code from natural language description and context using RuvLTRA.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'The natural language instruction for the code generation.',
        },
        context: {
          type: 'string',
          description: 'The surrounding code or necessary context.',
        },
      },
      required: ['instruction', 'context'],
    },
  },
  {
    name: 'ruvltra_code_refactor',
    description: 'Refactor existing code according to SONA-learned project style.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code snippet to refactor.',
        },
        instruction: {
          type: 'string',
          description: 'Optional specific refactoring instructions (e.g., "extract into class").',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'ruvltra_parallel_generate',
    description: 'Generate multiple files concurrently using the worker pool.',
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
              context: { type: 'string' }
            },
            required: ['filePath', 'instruction']
          },
          description: 'List of generation tasks to execute in parallel.',
        },
      },
      required: ['tasks'],
    },
  }
];
