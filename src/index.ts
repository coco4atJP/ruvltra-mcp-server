#!/usr/bin/env node
import { RuvltraMcpServer } from './core/mcp-server.js';
import { ServerConfig } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

const config: ServerConfig = {
  maxWorkers: parseInt(process.env.RUVLTRA_MAX_WORKERS || '4', 10),
  sonaEnabled: process.env.RUVLTRA_SONA_ENABLED !== 'false',
  modelPath: process.env.RUVLTRA_MODEL_PATH,
  httpEndpoint: process.env.RUVLTRA_HTTP_ENDPOINT,
  httpApiKey: process.env.RUVLTRA_HTTP_API_KEY,
  httpModel: process.env.RUVLTRA_HTTP_MODEL || 'ruvltra-claude-code',
  logLevel: (process.env.RUVLTRA_LOG_LEVEL as any) || 'info',
};

async function main() {
  const server = new RuvltraMcpServer(config);
  await server.run();
}

main().catch((error) => {
  console.error('[RuvLTRA] Fatal error:', error);
  process.exit(1);
});
