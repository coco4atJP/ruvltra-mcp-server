export interface ServerConfig {
  maxWorkers: number;
  sonaEnabled: boolean;
  modelPath?: string;
  httpEndpoint?: string;
  httpApiKey?: string;
  httpModel: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface TaskRequest {
  id: string;
  type: 'generate' | 'refactor' | 'review';
  context: string;
  instruction: string;
  files?: string[];
}

export interface TaskResult {
  id: string;
  success: boolean;
  data: string;
  error?: string;
  workerId?: string;
  metrics?: {
    latency: number;
    tokens: number;
  };
}
