import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { isToolName, TOOL_DEFINITIONS } from '../tools/definitions.js';
import { ToolHandlers, ToolInputError } from '../tools/handlers.js';
import { ServerConfig, ToolName } from '../types.js';
import { Logger } from '../utils/logger.js';
import { WorkerPool } from '../workers/worker-pool.js';

export class RuvltraMcpServer {
  private server: Server;
  private readonly config: ServerConfig;
  private readonly logger: Logger;
  private readonly workerPool: WorkerPool;
  private readonly toolHandlers: ToolHandlers;

  constructor(config: ServerConfig) {
    this.config = config;
    this.logger = new Logger(config.logLevel, 'mcp');

    this.server = new Server(
      {
        name: 'ruvltra-mcp-server',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.workerPool = new WorkerPool(this.config, this.logger.child('pool'));
    this.toolHandlers = new ToolHandlers(this.workerPool, this.logger.child('tools'));

    this.setupHandlers();
    this.setupSignalHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!isToolName(name)) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        const result = await this.toolHandlers.execute(name as ToolName, args ?? {});
        return {
          content: [{ type: 'text', text: result.text }],
          ...(result.structuredContent
            ? { structuredContent: result.structuredContent }
            : {}),
          ...(result.isError ? { isError: true } : {}),
        };
      } catch (error) {
        if (error instanceof ToolInputError) {
          throw new McpError(ErrorCode.InvalidParams, error.message);
        }

        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Tool execution failed for ${name}`, { error: message });

        return {
          content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
          isError: true,
        };
      }
    });

    this.server.onerror = (error) => this.logger.error('MCP runtime error', error);
  }

  private setupSignalHandlers(): void {
    const shutdown = async (signal: string): Promise<void> => {
      this.logger.info(`Received ${signal}, shutting down`);
      await this.workerPool.shutdown();
      process.exit(0);
    };

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    const status = this.workerPool.getStatus();
    this.logger.info('MCP server running on stdio', {
      workers: status.currentWorkers,
      minWorkers: status.minWorkers,
      maxWorkers: status.maxWorkers,
      sonaEnabled: this.config.sonaEnabled,
    });
  }
}
