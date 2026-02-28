export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type HttpFormat = 'auto' | 'openai' | 'llama';

export type TaskType =
  | 'generate'
  | 'review'
  | 'refactor'
  | 'explain'
  | 'test'
  | 'fix'
  | 'complete'
  | 'translate';

export type InferenceBackend = 'http' | 'llama' | 'ruvllm' | 'mock';

export type ToolName =
  | 'ruvltra_code_generate'
  | 'ruvltra_code_review'
  | 'ruvltra_code_refactor'
  | 'ruvltra_code_explain'
  | 'ruvltra_code_test'
  | 'ruvltra_code_fix'
  | 'ruvltra_code_complete'
  | 'ruvltra_code_translate'
  | 'ruvltra_parallel_generate'
  | 'ruvltra_swarm_review'
  | 'ruvltra_status'
  | 'ruvltra_sona_stats'
  | 'ruvltra_scale_workers';

export interface ServerConfig {
  minWorkers: number;
  maxWorkers: number;
  initialWorkers: number;
  queueMaxLength: number;
  taskTimeoutMs: number;
  sonaEnabled: boolean;
  sonaStateDir?: string;
  sonaPersistInterval: number;
  modelPath?: string;
  httpEndpoint?: string;
  httpApiKey?: string;
  httpModel: string;
  httpFormat: HttpFormat;
  httpTimeoutMs: number;
  httpMaxRetries: number;
  httpRetryBaseMs: number;
  httpCircuitFailureThreshold: number;
  httpCircuitCooldownMs: number;
  llamaCppPath?: string;
  contextLength: number;
  gpuLayers: number;
  threads: number;
  maxTokens: number;
  temperature: number;
  mockLatencyMs: number;
  logLevel: LogLevel;
}

export interface GenerateRequest {
  taskType: TaskType;
  instruction: string;
  context?: string;
  language?: string;
  filePath?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface InferenceResult {
  text: string;
  backend: InferenceBackend;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface InferenceStatus {
  activeBackend: InferenceBackend;
  readyBackends: InferenceBackend[];
  backendNotes: Partial<Record<InferenceBackend, string>>;
  modelPath?: string;
  httpEndpoint?: string;
  httpCircuit?: {
    state: 'closed' | 'open' | 'half_open';
    consecutiveFailures: number;
    openedAt?: string;
    nextAttemptAt?: string;
  };
}

export interface WorkerTask extends GenerateRequest {
  taskId: string;
}

export interface WorkerTaskResult extends InferenceResult {
  taskId: string;
  workerId: string;
  promptUsed: string;
}

export interface WorkerRuntimeStats {
  workerId: string;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  lastUsedAt: string;
  inference: InferenceStatus;
}

export interface WorkerPoolStatus {
  minWorkers: number;
  maxWorkers: number;
  currentWorkers: number;
  queueMaxLength: number;
  queueLength: number;
  inFlight: number;
  submittedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  timedOutTasks: number;
  rejectedTasks: number;
  workers: WorkerRuntimeStats[];
  backendBreakdown: Record<InferenceBackend, number>;
}

export interface SonaPatternSummary {
  key: string;
  score: number;
  importance: number;
  hits: number;
}

export interface SonaStats {
  workerId: string;
  enabled: boolean;
  interactions: number;
  successRate: number;
  patternsLearned: number;
  protectedPatterns: number;
  consolidations: number;
  lastConsolidatedAt?: string;
  topPatterns: SonaPatternSummary[];
}

export interface ToolExecutionResult {
  text: string;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
