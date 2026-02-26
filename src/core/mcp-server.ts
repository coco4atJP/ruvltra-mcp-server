import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOL_DEFINITIONS } from '../tools/definitions.js';
import { InferenceEngine } from '../ruvllm/inference-engine.js';
import { ServerConfig } from '../types.js';

export class RuvltraMcpServer {
  private server: Server;
  private inferenceEngine: InferenceEngine;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    
    this.server = new Server(
      {
        name: 'ruvltra-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize the engine (Mocking @ruvector/ruvllm for this PoC)
    this.inferenceEngine = new InferenceEngine({
      sonaEnabled: this.config.sonaEnabled,
      endpoint: this.config.httpEndpoint
    });

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new McpError(ErrorCode.InvalidParams, 'Arguments are required');
      }

      try {
        switch (name) {
          case 'ruvltra_code_generate': {
            const { instruction, context } = args as any;
            const result = await this.inferenceEngine.generate(instruction, context);
            return {
              content: [{ type: 'text', text: result }],
            };
          }

          case 'ruvltra_code_refactor': {
            const { code, instruction } = args as any;
            const result = await this.inferenceEngine.refactor(code, instruction);
            return {
              content: [{ type: 'text', text: result }],
            };
          }

          case 'ruvltra_parallel_generate': {
            const { tasks } = args as any;
            if (!Array.isArray(tasks)) {
               throw new McpError(ErrorCode.InvalidParams, 'Tasks must be an array');
            }
            // Execute in parallel
            const promises = tasks.map(async (task: any) => {
                const code = await this.inferenceEngine.generate(task.instruction, task.context);
                return `File: ${task.filePath}\\n---\\n${code}\\n`;
            });
            const results = await Promise.all(promises);
            return {
              content: [{ type: 'text', text: results.join('\\n\\n') }],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        console.error(`Error executing tool ${name}:`, error);
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });

    this.server.onerror = (error) => console.error('[MCP Error]', error);
  }

  async run() {
    await this.inferenceEngine.initialize(this.config.modelPath);
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[RuvLTRA] MCP Server running on stdio (SONA: ${this.config.sonaEnabled})`);
  }
}
