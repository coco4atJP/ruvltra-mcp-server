import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GenerateRequest,
  HttpFormat,
  InferenceBackend,
  InferenceResult,
  InferenceStatus,
  ServerConfig,
} from '../types.js';
import { Logger } from '../utils/logger.js';

interface LlamaRuntime {
  readonly modelPath: string;
  readonly LlamaChatSession: new (options: Record<string, unknown>) => {
    prompt: (
      input: string,
      options?: Record<string, unknown>
    ) => Promise<string>;
  };
  readonly context: {
    getSequence?: () => {
      dispose?: () => void;
    };
  };
}

interface RuvllmRuntime {
  readonly module: Record<string, unknown>;
  readonly client: unknown;
  readonly trajectoryBuilderCtor?: new () => {
    startStep?: (step: string, payload: string) => void;
    endStep?: (payload: string, confidence: number) => void;
    complete?: (status: string) => unknown;
  };
  readonly sonaCoordinator?: {
    recordTrajectory?: (trajectory: unknown) => void;
    runBackgroundLoop?: () => unknown;
  };
}

interface HttpCircuitState {
  state: 'closed' | 'open' | 'half_open';
  consecutiveFailures: number;
  openedAt?: number;
  nextAttemptAt?: number;
}

const BACKEND_ORDER: InferenceBackend[] = ['http', 'llama', 'ruvllm', 'mock'];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InferenceEngine {
  private initialized = false;
  private activeBackend: InferenceBackend = 'mock';

  private readonly backendReady: Record<InferenceBackend, boolean> = {
    http: false,
    llama: false,
    ruvllm: false,
    mock: true,
  };

  private readonly backendNotes: Partial<Record<InferenceBackend, string>> = {
    mock: 'Fallback backend is always available',
  };

  private llamaRuntime: LlamaRuntime | undefined;
  private ruvllmRuntime: RuvllmRuntime | undefined;
  private readonly httpCircuit: HttpCircuitState = {
    state: 'closed',
    consecutiveFailures: 0,
  };

  constructor(
    private readonly config: ServerConfig,
    private readonly logger: Logger
  ) { }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.backendReady.http = Boolean(this.config.httpEndpoint);
    if (this.backendReady.http) {
      this.backendNotes.http = 'Configured from RUVLTRA_HTTP_ENDPOINT';
    } else {
      this.backendNotes.http = 'RUVLTRA_HTTP_ENDPOINT is not set';
    }

    this.backendReady.llama = await this.tryInitializeLlama();
    this.backendReady.ruvllm = await this.tryInitializeRuvllm();

    this.activeBackend = BACKEND_ORDER.find((backend) => this.backendReady[backend]) ?? 'mock';
    this.initialized = true;

    this.logger.info('Inference engine initialized', {
      activeBackend: this.activeBackend,
      readyBackends: BACKEND_ORDER.filter((backend) => this.backendReady[backend]),
    });
  }

  async generate(
    request: GenerateRequest,
    signal?: AbortSignal
  ): Promise<InferenceResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.throwIfAborted(signal);

    const prompt = this.buildPrompt(request);
    const attemptBackends = this.buildAttemptOrder();

    let lastError: Error | undefined;
    for (const backend of attemptBackends) {
      if (!this.backendReady[backend]) {
        continue;
      }
      try {
        const result = await this.generateWithBackend(backend, request, prompt, signal);
        this.activeBackend = backend;
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.backendNotes[backend] = `Runtime failure: ${message}`;
        lastError = error instanceof Error ? error : new Error(message);
        this.logger.warn(`Backend ${backend} failed, trying next fallback`, {
          error: message,
        });
      }
    }

    if (lastError) {
      throw lastError;
    }

    return this.generateWithMock(request, prompt, signal);
  }

  getStatus(): InferenceStatus {
    return {
      activeBackend: this.activeBackend,
      readyBackends: BACKEND_ORDER.filter((backend) => this.backendReady[backend]),
      backendNotes: { ...this.backendNotes },
      modelPath: this.resolveModelPath(),
      httpEndpoint: this.config.httpEndpoint,
      httpCircuit: {
        state: this.httpCircuit.state,
        consecutiveFailures: this.httpCircuit.consecutiveFailures,
        openedAt: this.httpCircuit.openedAt
          ? new Date(this.httpCircuit.openedAt).toISOString()
          : undefined,
        nextAttemptAt: this.httpCircuit.nextAttemptAt
          ? new Date(this.httpCircuit.nextAttemptAt).toISOString()
          : undefined,
      },
    };
  }

  async shutdown(): Promise<void> {
    const context = this.llamaRuntime?.context as
      | { dispose?: () => void }
      | undefined;
    if (context?.dispose) {
      try {
        context.dispose();
      } catch {
        // Ignore cleanup failures.
      }
    }
  }

  private async generateWithBackend(
    backend: InferenceBackend,
    request: GenerateRequest,
    prompt: string,
    signal?: AbortSignal
  ): Promise<InferenceResult> {
    switch (backend) {
      case 'http':
        return this.generateWithHttp(request, prompt, signal);
      case 'llama':
        return this.generateWithLlama(request, prompt, signal);
      case 'ruvllm':
        return this.generateWithRuvllm(request, prompt, signal);
      case 'mock':
      default:
        return this.generateWithMock(request, prompt, signal);
    }
  }

  private async generateWithHttp(
    request: GenerateRequest,
    prompt: string,
    signal?: AbortSignal
  ): Promise<InferenceResult> {
    const endpoint = this.config.httpEndpoint;
    if (!endpoint) {
      throw new Error('HTTP endpoint is not configured');
    }

    this.throwIfAborted(signal);
    this.ensureHttpCircuitAllowsAttempt();

    const maxTokens = request.maxTokens ?? this.config.maxTokens;
    const temperature = request.temperature ?? this.config.temperature;

    const format = this.resolveHttpFormat();
    const payload =
      format === 'llama'
        ? {
          prompt,
          n_predict: maxTokens,
          temperature,
          stream: false,
        }
        : {
          model: this.config.httpModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
        };

    const maxRetries = Math.max(0, this.config.httpMaxRetries);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      this.throwIfAborted(signal);
      const start = Date.now();
      let cleanupSignal: (() => void) | undefined;
      try {
        const requestSignal = this.createRequestSignal(signal, this.config.httpTimeoutMs);
        cleanupSignal = requestSignal.cleanup;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.config.httpApiKey
              ? { authorization: `Bearer ${this.config.httpApiKey}` }
              : {}),
          },
          body: JSON.stringify(payload),
          signal: requestSignal.signal,
        });

        if (!response.ok) {
          const statusError = new Error(
            `HTTP ${response.status}: ${response.statusText}`
          ) as Error & { statusCode?: number };
          statusError.statusCode = response.status;
          throw statusError;
        }

        const data = (await response.json()) as Record<string, unknown>;
        const text = this.parseHttpText(data, format);
        if (!text) {
          throw new Error('HTTP response did not include generated content');
        }

        const usage = (data.usage ?? {}) as Record<string, unknown>;
        this.recordHttpSuccess();
        return {
          text,
          backend: 'http',
          model: this.config.httpModel,
          latencyMs: Date.now() - start,
          promptTokens: this.extractNumber(usage.prompt_tokens),
          completionTokens: this.extractNumber(usage.completion_tokens),
        };
      } catch (error) {
        const wrapped =
          error instanceof Error ? error : new Error(String(error));
        if (this.isAbortError(wrapped)) {
          if (signal?.aborted) {
            throw this.abortReason(signal);
          }
          const timeoutError = new Error(
            `HTTP request timed out after ${this.config.httpTimeoutMs}ms`
          );
          lastError = timeoutError;
        } else {
          lastError = wrapped;
        }

        const canRetry =
          attempt < maxRetries && this.isRetryableHttpError(lastError);
        if (canRetry) {
          const backoff = this.computeRetryDelay(attempt);
          await this.sleepWithSignal(backoff, signal);
          continue;
        }

        this.recordHttpFailure();
      } finally {
        cleanupSignal?.();
      }
    }

    throw lastError ?? new Error('HTTP backend failed');
  }

  private async generateWithLlama(
    request: GenerateRequest,
    prompt: string,
    signal?: AbortSignal
  ): Promise<InferenceResult> {
    if (!this.llamaRuntime) {
      throw new Error('llama.cpp backend is not initialized');
    }

    this.throwIfAborted(signal);

    const start = Date.now();
    const sequence = this.llamaRuntime.context.getSequence?.();
    const sessionOptions =
      sequence !== undefined ? { contextSequence: sequence } : { context: this.llamaRuntime.context };
    const session = new this.llamaRuntime.LlamaChatSession(sessionOptions);

    try {
      const text = await this.withAbort(
        session.prompt(prompt, {
          maxTokens: request.maxTokens ?? this.config.maxTokens,
          temperature: request.temperature ?? this.config.temperature,
        }),
        signal
      );
      return {
        text,
        backend: 'llama',
        model: this.llamaRuntime.modelPath,
        latencyMs: Date.now() - start,
      };
    } finally {
      sequence?.dispose?.();
    }
  }

  private async generateWithRuvllm(
    request: GenerateRequest,
    prompt: string,
    signal?: AbortSignal
  ): Promise<InferenceResult> {
    const runtime = this.ruvllmRuntime;
    if (!runtime) {
      throw new Error('RuvLLM backend is not initialized');
    }

    this.throwIfAborted(signal);

    const maxTokens = request.maxTokens ?? this.config.maxTokens;
    const temperature = request.temperature ?? this.config.temperature;
    const start = Date.now();

    let trajectoryBuilder: InstanceType<
      NonNullable<RuvllmRuntime['trajectoryBuilderCtor']>
    > | null = null;

    if (runtime.trajectoryBuilderCtor && this.config.sonaEnabled) {
      trajectoryBuilder = new runtime.trajectoryBuilderCtor();
      trajectoryBuilder.startStep?.('query', prompt);
    }

    let rawOutput: unknown;
    const clientObj = runtime.client as {
      generate?: (input: unknown) => Promise<unknown>;
      query?: (prompt: string, config?: unknown) => Promise<unknown>;
    } | null;

    if (clientObj?.generate) {
      // RuvLLM インスタンスの .generate() メソッド
      rawOutput = await this.withAbort(
        clientObj.generate(prompt),
        signal
      );
    } else if (clientObj?.query) {
      // RuvLLM インスタンスの .query() メソッド (フォールバック)
      rawOutput = await this.withAbort(
        clientObj.query(prompt, { maxTokens, temperature }),
        signal
      );
    } else {
      // モジュールレベルの generate/complete (将来のバージョン互換)
      const moduleRecord = runtime.module as {
        generate?: (input: unknown) => Promise<unknown>;
        complete?: (input: unknown) => Promise<unknown>;
      };
      if (moduleRecord.generate) {
        rawOutput = await this.withAbort(
          moduleRecord.generate({
            prompt,
            maxTokens,
            temperature,
            model: this.config.modelPath ?? this.config.httpModel,
          }),
          signal
        );
      } else if (moduleRecord.complete) {
        rawOutput = await this.withAbort(
          moduleRecord.complete({
            prompt,
            maxTokens,
            temperature,
            model: this.config.modelPath ?? this.config.httpModel,
          }),
          signal
        );
      } else {
        throw new Error('No compatible generate API found in @ruvector/ruvllm');
      }
    }

    const text = this.extractGeneratedText(rawOutput);
    if (!text) {
      throw new Error('RuvLLM returned empty output');
    }

    if (trajectoryBuilder && runtime.sonaCoordinator) {
      trajectoryBuilder.endStep?.(text, 0.85);
      const trajectory = trajectoryBuilder.complete?.('success');
      if (trajectory && runtime.sonaCoordinator.recordTrajectory) {
        runtime.sonaCoordinator.recordTrajectory(trajectory);
      }
      runtime.sonaCoordinator.runBackgroundLoop?.();
    }

    return {
      text,
      backend: 'ruvllm',
      model: this.config.modelPath ?? this.config.httpModel,
      latencyMs: Date.now() - start,
    };
  }

  private async generateWithMock(
    request: GenerateRequest,
    prompt: string,
    signal?: AbortSignal
  ): Promise<InferenceResult> {
    this.throwIfAborted(signal);

    const start = Date.now();
    const jitter = Math.floor(Math.random() * 40);
    await this.sleepWithSignal(this.config.mockLatencyMs + jitter, signal);

    const text = [
      `// Mock backend response (${request.taskType})`,
      `// Instruction: ${request.instruction.slice(0, 120)}`,
      request.context
        ? `// Context length: ${request.context.length}`
        : '// Context length: 0',
      '',
      '/*',
      '  This is mock output because no inference backend is currently available.',
      '  Configure one of the following for real generations:',
      '  - RUVLTRA_HTTP_ENDPOINT',
      '  - RUVLTRA_MODEL_PATH with node-llama-cpp support',
      '  - @ruvector/ruvllm runtime support',
      '*/',
      '',
      prompt
        .split('\n')
        .slice(0, 8)
        .join('\n'),
    ].join('\n');

    return {
      text,
      backend: 'mock',
      model: 'mock://ruvltra',
      latencyMs: Date.now() - start,
    };
  }

  private async tryInitializeLlama(): Promise<boolean> {
    const modelPath = this.resolveModelPath();
    if (!modelPath) {
      this.backendNotes.llama = 'Model file not found (set RUVLTRA_MODEL_PATH)';
      return false;
    }

    try {
      const llamaModule = (await import('node-llama-cpp')) as Record<string, unknown>;
      const getLlama = llamaModule.getLlama as
        | (() => Promise<{ loadModel: (options: unknown) => Promise<unknown> }>)
        | undefined;
      const LlamaChatSession = llamaModule.LlamaChatSession as LlamaRuntime['LlamaChatSession'] | undefined;

      if (!getLlama || !LlamaChatSession) {
        this.backendNotes.llama = 'node-llama-cpp API not available';
        return false;
      }

      const llama = await getLlama();
      const model = (await llama.loadModel({
        modelPath,
        gpuLayers: this.config.gpuLayers,
      })) as {
        createContext: (options: Record<string, unknown>) => Promise<LlamaRuntime['context']>;
      };

      const context = await model.createContext({
        contextSize: this.config.contextLength,
        threads: this.config.threads > 0 ? this.config.threads : undefined,
      });

      this.llamaRuntime = {
        modelPath,
        context,
        LlamaChatSession,
      };
      this.backendNotes.llama = `Loaded model: ${modelPath}`;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.backendNotes.llama = `Initialization failed: ${message}`;
      return false;
    }
  }

  private async tryInitializeRuvllm(): Promise<boolean> {
    try {
      // ESM ビルドに拡張子なし re-export のバグがあるため、CJS フォールバックを用意
      let imported: Record<string, unknown>;
      try {
        imported = (await import('@ruvector/ruvllm')) as Record<string, unknown>;
      } catch {
        const { createRequire } = await import('node:module');
        const cjsRequire = createRequire(import.meta.url);
        imported = cjsRequire('@ruvector/ruvllm') as Record<string, unknown>;
      }
      const moduleRecord =
        (imported.default as Record<string, unknown> | undefined) ?? imported;

      // モデルの自動ダウンロード（modelPath が未指定の場合）
      const ruvllmModelId = process.env.RUVLTRA_RUVLLM_MODEL ?? 'ruvltra-claude-code';
      let modelPath = this.config.modelPath;

      if (!modelPath) {
        const downloadModel = moduleRecord.downloadModel as
          | ((modelId: string) => Promise<string>)
          | undefined;
        const isModelDownloaded = moduleRecord.isModelDownloaded as
          | ((modelId: string) => boolean)
          | undefined;

        if (downloadModel) {
          const alreadyDownloaded = isModelDownloaded?.(ruvllmModelId) ?? false;
          if (!alreadyDownloaded) {
            this.logger.info(`Downloading RuvLLM model: ${ruvllmModelId}...`);
          }
          try {
            modelPath = await downloadModel(ruvllmModelId);
            this.logger.info(`RuvLLM model ready: ${modelPath}`);
          } catch (dlError) {
            const dlMsg = dlError instanceof Error ? dlError.message : String(dlError);
            this.logger.warn(`Model download failed (${ruvllmModelId}): ${dlMsg}`);
            // ダウンロード失敗でもモデルなしで初期化を試みる
          }
        }
      }

      let client: unknown = null;

      const RuvLLMClass = moduleRecord.RuvLLM as
        | (new (options: Record<string, unknown>) => unknown)
        | undefined;
      const createClient = moduleRecord.createClient as
        | ((options: Record<string, unknown>) => Promise<unknown>)
        | undefined;

      // RuvLLM コンストラクタを優先（インスタンスに .generate()/.query() がある）
      if (RuvLLMClass) {
        client = new RuvLLMClass({
          learningEnabled: this.config.sonaEnabled,
          modelPath,
          model: modelPath ?? this.config.httpModel,
        });
      } else if (createClient) {
        client = await createClient({
          model: modelPath ?? this.config.httpModel,
        });
      }

      const TrajectoryBuilder = moduleRecord.TrajectoryBuilder as
        | RuvllmRuntime['trajectoryBuilderCtor']
        | undefined;
      const SonaCoordinator = moduleRecord.SonaCoordinator as
        | (new () => RuvllmRuntime['sonaCoordinator'])
        | undefined;

      const clientObj = client as { generate?: unknown; query?: unknown } | null;
      const clientHasCallableGenerator =
        typeof clientObj?.generate === 'function' ||
        typeof clientObj?.query === 'function';
      const moduleHasCallableGenerator =
        typeof moduleRecord.generate === 'function' ||
        typeof moduleRecord.complete === 'function';

      if (!clientHasCallableGenerator && !moduleHasCallableGenerator) {
        this.backendNotes.ruvllm =
          'Initialization failed: no callable generate API found in module/client';
        return false;
      }

      this.ruvllmRuntime = {
        module: moduleRecord,
        client,
        trajectoryBuilderCtor: TrajectoryBuilder,
        sonaCoordinator: this.config.sonaEnabled && SonaCoordinator ? new SonaCoordinator() : undefined,
      };

      this.backendNotes.ruvllm = 'Native @ruvector/ruvllm backend ready';
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.backendNotes.ruvllm = `Initialization failed: ${message}`;
      return false;
    }
  }

  private resolveHttpFormat(): HttpFormat {
    if (this.config.httpFormat !== 'auto') {
      return this.config.httpFormat;
    }

    const endpoint = this.config.httpEndpoint ?? '';
    if (
      endpoint.includes('/chat/completions') ||
      endpoint.includes('/v1/completions')
    ) {
      return 'openai';
    }
    if (endpoint.includes('/completion') || endpoint.includes('/generate')) {
      return 'llama';
    }
    return 'openai';
  }

  private buildAttemptOrder(): InferenceBackend[] {
    // Always prioritize canonical order so higher-priority backends can recover automatically.
    return [...BACKEND_ORDER];
  }

  private parseHttpText(
    data: Record<string, unknown>,
    format: HttpFormat
  ): string | undefined {
    if (format === 'llama') {
      return this.extractGeneratedText(data);
    }

    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const choice = Array.isArray(choices) ? choices[0] : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const fromChat = message?.content;
    const fromCompletion = choice?.text;

    const parsed = this.extractGeneratedText(fromChat ?? fromCompletion ?? data);
    return parsed;
  }

  private extractGeneratedText(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const candidates: unknown[] = [
      record.content,
      record.text,
      record.response,
      record.completion,
      record.generated_text,
      record.output,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
      if (candidate && typeof candidate === 'object') {
        const nestedText = this.extractGeneratedText(candidate);
        if (nestedText) {
          return nestedText;
        }
      }
    }

    return undefined;
  }

  private extractNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private buildPrompt(request: GenerateRequest): string {
    const sections: string[] = [];
    sections.push(`Task: ${request.taskType}`);
    if (request.language) {
      sections.push(`Language: ${request.language}`);
    }
    if (request.filePath) {
      sections.push(`File: ${request.filePath}`);
    }
    sections.push('');
    sections.push('Instruction:');
    sections.push(request.instruction.trim());

    if (request.context) {
      sections.push('');
      sections.push('Context:');
      sections.push(request.context.trim());
    }

    sections.push('');
    sections.push('Return only the final answer with clear, practical output.');
    return sections.join('\n');
  }

  private resolveModelPath(): string | undefined {
    const configured = this.config.modelPath;
    if (configured && fs.existsSync(configured)) {
      return configured;
    }

    const candidates = [
      path.join(process.cwd(), 'models', 'ruvltra-claude-code-0.5b-q4_k_m.gguf'),
      path.join(
        os.homedir(),
        '.ruvltra',
        'models',
        'ruvltra-claude-code-0.5b-q4_k_m.gguf'
      ),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return configured;
  }

  private createRequestSignal(parent: AbortSignal | undefined, timeoutMs: number): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const onParentAbort = (): void => {
      controller.abort(this.abortReason(parent));
    };
    if (parent) {
      if (parent.aborted) {
        onParentAbort();
      } else {
        parent.addEventListener('abort', onParentAbort, { once: true });
      }
    }

    const timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`HTTP request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeoutHandle.unref?.();

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeoutHandle);
        if (parent) {
          parent.removeEventListener('abort', onParentAbort);
        }
      },
    };
  }

  private ensureHttpCircuitAllowsAttempt(): void {
    if (this.httpCircuit.state !== 'open') {
      return;
    }
    const now = Date.now();
    if ((this.httpCircuit.nextAttemptAt ?? 0) <= now) {
      this.httpCircuit.state = 'half_open';
      return;
    }
    const waitMs = Math.max(0, (this.httpCircuit.nextAttemptAt ?? 0) - now);
    throw new Error(`HTTP circuit open; retry after ${waitMs}ms`);
  }

  private recordHttpSuccess(): void {
    this.httpCircuit.state = 'closed';
    this.httpCircuit.consecutiveFailures = 0;
    this.httpCircuit.openedAt = undefined;
    this.httpCircuit.nextAttemptAt = undefined;
    this.backendNotes.http = 'HTTP backend healthy';
  }

  private recordHttpFailure(): void {
    this.httpCircuit.consecutiveFailures += 1;
    if (
      this.httpCircuit.consecutiveFailures >= this.config.httpCircuitFailureThreshold
    ) {
      this.httpCircuit.state = 'open';
      this.httpCircuit.openedAt = Date.now();
      this.httpCircuit.nextAttemptAt =
        this.httpCircuit.openedAt + this.config.httpCircuitCooldownMs;
      this.backendNotes.http =
        `Circuit open after ${this.httpCircuit.consecutiveFailures} failures`;
      return;
    }

    if (this.httpCircuit.state === 'half_open') {
      this.httpCircuit.state = 'open';
      this.httpCircuit.openedAt = Date.now();
      this.httpCircuit.nextAttemptAt =
        this.httpCircuit.openedAt + this.config.httpCircuitCooldownMs;
      this.backendNotes.http = 'Circuit reopened after half-open probe failure';
    }
  }

  private isRetryableHttpError(error: Error): boolean {
    const status = (error as Error & { statusCode?: number }).statusCode;
    if (typeof status === 'number') {
      return status === 408 || status === 429 || status >= 500;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('fetch failed')
    );
  }

  private computeRetryDelay(attempt: number): number {
    const base = Math.max(1, this.config.httpRetryBaseMs);
    const exponential = Math.min(base * 2 ** attempt, 15_000);
    const jitter = Math.floor(Math.random() * 50);
    return exponential + jitter;
  }

  private async sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await this.withAbort(delay(ms), signal);
  }

  private async withAbort<T>(
    promise: Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (!signal) {
      return promise;
    }
    if (signal.aborted) {
      throw this.abortReason(signal);
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        reject(this.abortReason(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      promise
        .then((value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        })
        .catch((error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        });
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw this.abortReason(signal);
    }
  }

  private abortReason(signal?: AbortSignal): Error {
    const reason = signal?.reason;
    if (reason instanceof Error) {
      return reason;
    }
    if (typeof reason === 'string' && reason.length > 0) {
      return new Error(reason);
    }
    return new Error('Operation aborted');
  }

  private isAbortError(error: Error): boolean {
    const normalized = `${error.name}:${error.message}`.toLowerCase();
    return (
      normalized.includes('abort') ||
      normalized.includes('aborted') ||
      normalized.includes('operation aborted')
    );
  }
}
