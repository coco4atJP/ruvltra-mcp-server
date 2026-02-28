#!/usr/bin/env node
import { RuvltraMcpServer } from './core/mcp-server.js';
import { loadServerConfig } from './config/defaults.js';
import dotenv from 'dotenv';

dotenv.config();

// Redirect all logs to stderr to protect MCP stdout channel
console.log = (...args) => console.error(...args);

async function main() {
  const config = loadServerConfig(process.env);
  const server = new RuvltraMcpServer(config);
  await server.run();
}

main().catch((error) => {
  console.error('[RuvLTRA] Fatal error:', error);
  process.exit(1);
});
