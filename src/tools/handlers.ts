import { WorkerPool } from '../workers/worker-pool.js';
import { ToolExecutionResult, ToolName, WorkerTaskResult } from '../types.js';
import { Logger } from '../utils/logger.js';

const DEFAULT_SWARM_PERSPECTIVES = [
  'security',
  'performance',
  'quality',
  'maintainability',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class ToolInputError extends Error {}

export class ToolHandlers {
  constructor(
    private readonly workerPool: WorkerPool,
    private readonly logger: Logger
  ) {}

  async execute(name: ToolName, args: unknown): Promise<ToolExecutionResult> {
    const input = isRecord(args) ? args : {};

    switch (name) {
      case 'ruvltra_code_generate':
        return this.handleCodeGenerate(input);
      case 'ruvltra_code_review':
        return this.handleCodeReview(input);
      case 'ruvltra_code_refactor':
        return this.handleCodeRefactor(input);
      case 'ruvltra_code_explain':
        return this.handleCodeExplain(input);
      case 'ruvltra_code_test':
        return this.handleCodeTest(input);
      case 'ruvltra_code_fix':
        return this.handleCodeFix(input);
      case 'ruvltra_code_complete':
        return this.handleCodeComplete(input);
      case 'ruvltra_code_translate':
        return this.handleCodeTranslate(input);
      case 'ruvltra_parallel_generate':
        return this.handleParallelGenerate(input);
      case 'ruvltra_swarm_review':
        return this.handleSwarmReview(input);
      case 'ruvltra_status':
        return this.wrapResult({
          status: this.workerPool.getStatus(),
        });
      case 'ruvltra_sona_stats':
        return this.handleSonaStats(input);
      case 'ruvltra_scale_workers':
        return this.handleScaleWorkers(input);
      default:
        throw new ToolInputError(`Unsupported tool: ${name}`);
    }
  }

  private async handleCodeGenerate(
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const instruction = this.requiredString(input, 'instruction');
    const result = await this.runSingleTask({
      taskType: 'generate',
      instruction,
      context: this.optionalString(input, 'context'),
      language: this.optionalString(input, 'language'),
      filePath: this.optionalString(input, 'filePath'),
      maxTokens: this.optionalNumber(input, 'maxTokens'),
      temperature: this.optionalNumber(input, 'temperature'),
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      output: result.text,
      workerId: result.workerId,
      backend: result.backend,
      model: result.model,
      latencyMs: result.latencyMs,
      taskId: result.taskId,
    });
  }

  private async handleCodeReview(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const code = this.requiredString(input, 'code');
    const focus = this.optionalStringArray(input, 'focus');
    const focusList = focus.length > 0 ? focus.join(', ') : 'security, performance, quality';
    const instruction = [
      'Review the provided code and report concrete issues.',
      `Focus: ${focusList}`,
      'Format sections: Critical, High, Medium, Low, Suggested fixes.',
      '',
      code,
    ].join('\n');

    const result = await this.runSingleTask({
      taskType: 'review',
      instruction,
      language: this.optionalString(input, 'language'),
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      review: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs,
    });
  }

  private async handleCodeRefactor(
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const code = this.requiredString(input, 'code');
    const instruction = this.optionalString(input, 'instruction');
    const fullInstruction = [
      'Refactor the code while preserving behavior.',
      instruction ? `Additional goals: ${instruction}` : 'No extra constraints.',
      'Return only refactored code.',
      '',
      code,
    ].join('\n');

    const result = await this.runSingleTask({
      taskType: 'refactor',
      instruction: fullInstruction,
      language: this.optionalString(input, 'language'),
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      refactored: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs,
    });
  }

  private async handleCodeExplain(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const code = this.requiredString(input, 'code');
    const audience = this.optionalString(input, 'audience') ?? 'software engineer';
    const instruction = [
      `Explain this code for a ${audience}.`,
      'Cover purpose, control flow, important edge cases, and extension points.',
      '',
      code,
    ].join('\n');

    const result = await this.runSingleTask({
      taskType: 'explain',
      instruction,
      language: this.optionalString(input, 'language'),
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      explanation: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs,
    });
  }

  private async handleCodeTest(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const code = this.requiredString(input, 'code');
    const framework = this.optionalString(input, 'framework') ?? 'project default';
    const instruction = [
      `Create automated tests using ${framework}.`,
      'Include happy path, edge cases, and failure path tests.',
      'Return test code only.',
      '',
      code,
    ].join('\n');

    const result = await this.runSingleTask({
      taskType: 'test',
      instruction,
      language: this.optionalString(input, 'language'),
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      tests: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs,
    });
  }

  private async handleCodeFix(input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const code = this.requiredString(input, 'code');
    const error = this.requiredString(input, 'error');
    const instruction = this.optionalString(input, 'instruction');

    const fullInstruction = [
      'Fix the code based on the reported failure.',
      `Error: ${error}`,
      instruction ? `Additional guidance: ${instruction}` : '',
      'Return fixed code with a brief explanation.',
      '',
      code,
    ]
      .filter((line) => line.length > 0)
      .join('\n');

    const result = await this.runSingleTask({
      taskType: 'fix',
      instruction: fullInstruction,
      language: this.optionalString(input, 'language'),
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      fix: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs,
    });
  }

  private async handleCodeComplete(
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const prefix = this.requiredString(input, 'prefix');
    const suffix = this.optionalString(input, 'suffix');
    const instruction = [
      'Complete the missing code between prefix and suffix.',
      'Preserve style and behavior consistency.',
      '',
      'Prefix:',
      prefix,
      '',
      'Suffix:',
      suffix ?? '(none)',
    ].join('\n');

    const result = await this.runSingleTask({
      taskType: 'complete',
      instruction,
      language: this.optionalString(input, 'language'),
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      completion: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs,
    });
  }

  private async handleCodeTranslate(
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const code = this.requiredString(input, 'code');
    const targetLanguage = this.requiredString(input, 'targetLanguage');
    const sourceLanguage = this.optionalString(input, 'sourceLanguage') ?? 'unknown';

    const instruction = [
      `Translate code from ${sourceLanguage} to ${targetLanguage}.`,
      'Preserve behavior and include idiomatic style in target language.',
      'Return translated code first, then brief migration notes.',
      '',
      code,
    ].join('\n');

    const result = await this.runSingleTask({
      taskType: 'translate',
      instruction,
      language: targetLanguage,
      timeoutMs: this.optionalInteger(input, 'timeoutMs'),
    });

    return this.wrapResult({
      translated: result.text,
      workerId: result.workerId,
      backend: result.backend,
      latencyMs: result.latencyMs,
    });
  }

  private async handleParallelGenerate(
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const tasksValue = input.tasks;
    if (!Array.isArray(tasksValue) || tasksValue.length === 0) {
      throw new ToolInputError('tasks must be a non-empty array');
    }

    const tasks = tasksValue.map((item, index) => {
      if (!isRecord(item)) {
        throw new ToolInputError(`tasks[${index}] must be an object`);
      }
      return {
        filePath: this.requiredString(item, 'filePath', `tasks[${index}]`),
        instruction: this.requiredString(item, 'instruction', `tasks[${index}]`),
        context: this.optionalString(item, 'context'),
        language: this.optionalString(item, 'language'),
      };
    });

    const startedAt = Date.now();
    const results = await Promise.all(
      tasks.map(async (task) => {
        const generation = await this.workerPool.executeTask({
          taskType: 'generate',
          instruction: task.instruction,
          context: task.context,
          language: task.language,
          filePath: task.filePath,
          timeoutMs: this.optionalInteger(input, 'timeoutMs'),
        });

        return {
          filePath: task.filePath,
          content: generation.text,
          workerId: generation.workerId,
          backend: generation.backend,
          latencyMs: generation.latencyMs,
        };
      })
    );

    const totalLatencyMs = Date.now() - startedAt;
    return this.wrapResult({
      totalTasks: tasks.length,
      totalLatencyMs,
      results,
    });
  }

  private async handleSwarmReview(
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const code = this.requiredString(input, 'code');
    const maxAgents = Math.min(8, Math.max(1, this.optionalInteger(input, 'maxAgents') ?? 4));
    const userPerspectives = this.optionalStringArray(input, 'perspectives');
    const perspectives =
      userPerspectives.length > 0 ? userPerspectives.slice(0, maxAgents) : DEFAULT_SWARM_PERSPECTIVES.slice(0, maxAgents);

    const startedAt = Date.now();
    const reviews = await Promise.all(
      perspectives.map(async (perspective) => {
        const instruction = [
          `Review this code from the perspective of ${perspective}.`,
          'Provide prioritized findings and concrete remediation steps.',
          '',
          code,
        ].join('\n');

        const result = await this.workerPool.executeTask({
          taskType: 'review',
          instruction,
          language: this.optionalString(input, 'language'),
          timeoutMs: this.optionalInteger(input, 'timeoutMs'),
        });

        return {
          perspective,
          review: result.text,
          workerId: result.workerId,
          backend: result.backend,
          latencyMs: result.latencyMs,
        };
      })
    );

    return this.wrapResult({
      perspectives: reviews.length,
      totalLatencyMs: Date.now() - startedAt,
      reviews,
    });
  }

  private handleSonaStats(input: Record<string, unknown>): ToolExecutionResult {
    const workerId = this.optionalString(input, 'workerId');
    return this.wrapResult({
      sona: this.workerPool.getSonaStats(workerId),
    });
  }

  private handleScaleWorkers(input: Record<string, unknown>): ToolExecutionResult {
    const target = this.requiredInteger(input, 'target');
    this.logger.info('Manual scale request', { target });
    const status = this.workerPool.scaleWorkers(target);
    return this.wrapResult({
      status,
    });
  }

  private async runSingleTask(params: {
    taskType:
      | 'generate'
      | 'review'
      | 'refactor'
      | 'explain'
      | 'test'
      | 'fix'
      | 'complete'
      | 'translate';
    instruction: string;
    context?: string;
    language?: string;
    filePath?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<WorkerTaskResult> {
    return this.workerPool.executeTask(params);
  }

  private wrapResult(payload: unknown): ToolExecutionResult {
    if (isRecord(payload)) {
      return {
        text: JSON.stringify(payload, null, 2),
        structuredContent: payload,
      };
    }
    return {
      text: JSON.stringify({ value: payload }, null, 2),
      structuredContent: { value: payload },
    };
  }

  private requiredString(
    input: Record<string, unknown>,
    key: string,
    objectName: string = 'arguments'
  ): string {
    const value = input[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ToolInputError(`${objectName}.${key} must be a non-empty string`);
    }
    return value;
  }

  private optionalString(input: Record<string, unknown>, key: string): string | undefined {
    const value = input[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new ToolInputError(`arguments.${key} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
    const value = input[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ToolInputError(`arguments.${key} must be a number`);
    }
    return value;
  }

  private optionalInteger(input: Record<string, unknown>, key: string): number | undefined {
    const value = this.optionalNumber(input, key);
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isInteger(value)) {
      throw new ToolInputError(`arguments.${key} must be an integer`);
    }
    return value;
  }

  private requiredInteger(input: Record<string, unknown>, key: string): number {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new ToolInputError(`arguments.${key} must be an integer`);
    }
    return value;
  }

  private optionalStringArray(input: Record<string, unknown>, key: string): string[] {
    const value = input[key];
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new ToolInputError(`arguments.${key} must be an array of strings`);
    }
    const result: string[] = [];
    value.forEach((item, index) => {
      if (typeof item !== 'string') {
        throw new ToolInputError(`arguments.${key}[${index}] must be a string`);
      }
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
      }
    });
    return result;
  }
}
