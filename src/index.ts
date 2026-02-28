#!/usr/bin/env node
import { RuvltraMcpServer } from './core/mcp-server.js';
import { loadServerConfig } from './config/defaults.js';
import dotenv from 'dotenv';

dotenv.config();

// Keep node-llama-cpp logs away from MCP stdout and disable verbose debug mode by default.
process.env.NODE_LLAMA_CPP_LOG_LEVEL ??= 'error';
process.env.NODE_LLAMA_CPP_DEBUG ??= 'false';

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
