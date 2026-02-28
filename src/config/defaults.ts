import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpFormat, LogLevel, ServerConfig } from '../types.js';

const DEFAULT_CONFIG: ServerConfig = {
  minWorkers: 2,
  maxWorkers: 8,
  initialWorkers: 2,
  queueMaxLength: 256,
  taskTimeoutMs: 60_000,
  sonaEnabled: true,
  sonaStateDir: undefined,
  sonaPersistInterval: 10,
  modelPath: undefined,
  httpEndpoint: undefined,
  httpApiKey: undefined,
  httpModel: 'ruvltra-claude-code',
  httpFormat: 'auto',
  httpTimeoutMs: 15_000,
  httpMaxRetries: 2,
  httpRetryBaseMs: 250,
  httpCircuitFailureThreshold: 5,
  httpCircuitCooldownMs: 30_000,
  llamaCppPath: undefined,
  contextLength: 4096,
  gpuLayers: -1,
  threads: 0,
  maxTokens: 512,
  temperature: 0.2,
  mockLatencyMs: 120,
  logLevel: 'info',
};

type EnvLike = Record<string, string | undefined>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseInteger(
  raw: string | undefined,
  fallback: number,
  min?: number,
  max?: number
): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (min === undefined || max === undefined) {
    return parsed;
  }
  return clamp(parsed, min, max);
}

function parseNumber(
  raw: string | undefined,
  fallback: number,
  min?: number,
  max?: number
): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (min === undefined || max === undefined) {
    return parsed;
  }
  return clamp(parsed, min, max);
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function parseLogLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  return fallback;
}

function parseHttpFormat(
  raw: string | undefined,
  fallback: HttpFormat
): HttpFormat {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'openai' || normalized === 'llama') {
    return normalized;
  }
  return fallback;
}

function parseOptionalString(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function expandHome(rawPath: string | undefined): string | undefined {
  if (!rawPath) {
    return undefined;
  }
  if (rawPath === '~') {
    return os.homedir();
  }
  if (rawPath.startsWith('~/')) {
    return path.join(os.homedir(), rawPath.slice(2));
  }
  return rawPath;
}

function loadConfigFile(configPath: string | undefined): Partial<ServerConfig> {
  const resolvedPath = expandHome(configPath);
  if (!resolvedPath) {
    return {};
  }
  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = JSON.parse(content) as Partial<ServerConfig>;
    return parsed;
  } catch {
    return {};
  }
}

function mergeConfig(
  base: ServerConfig,
  override: Partial<ServerConfig>
): ServerConfig {
  return { ...base, ...override };
}

export function loadServerConfig(env: EnvLike): ServerConfig {
  const fileConfig = loadConfigFile(parseOptionalString(env.RUVLTRA_CONFIG));

  const fromEnv: Partial<ServerConfig> = {
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
      50_000
    ),
    taskTimeoutMs: parseInteger(
      env.RUVLTRA_TASK_TIMEOUT_MS,
      DEFAULT_CONFIG.taskTimeoutMs,
      100,
      600_000
    ),
    sonaEnabled: parseBoolean(env.RUVLTRA_SONA_ENABLED, DEFAULT_CONFIG.sonaEnabled),
    sonaStateDir: expandHome(parseOptionalString(env.RUVLTRA_SONA_STATE_DIR)),
    sonaPersistInterval: parseInteger(
      env.RUVLTRA_SONA_PERSIST_INTERVAL,
      DEFAULT_CONFIG.sonaPersistInterval,
      1,
      1000
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
      120_000
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
      60_000
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
      1000,
      600_000
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
      5000
    ),
    logLevel: parseLogLevel(env.RUVLTRA_LOG_LEVEL, DEFAULT_CONFIG.logLevel),
  };

  const merged = mergeConfig(mergeConfig(DEFAULT_CONFIG, fileConfig), fromEnv);

  const minWorkers = clamp(Math.round(merged.minWorkers), 1, 32);
  const maxWorkers = clamp(Math.round(merged.maxWorkers), minWorkers, 32);
  const initialWorkers = clamp(
    Math.round(merged.initialWorkers),
    minWorkers,
    maxWorkers
  );
  const queueMaxLength = clamp(
    Math.round(merged.queueMaxLength),
    maxWorkers,
    50_000
  );

  return {
    ...merged,
    minWorkers,
    maxWorkers,
    initialWorkers,
    queueMaxLength,
  };
}
