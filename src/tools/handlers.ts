import { WorkerPool } from '../workers/worker-pool.js';
import { ToolExecutionResult, ToolName, WorkerTaskResult } from '../types.js';
import { Logger } from '../utils/logger.js';

const DEFAULT_SWARM_PERSPECTIVES = [
  'security',
  'performance',
  'quality',
  'maintainability',
];
const MAX_INSTRUCTION_CHARS = 10_000;
const MAX_CONTEXT_CHARS = 16_000;
const CODE_ONLY_INSTRUCTION_RE =
  /(code only|only code|return only .*code|output only .*code|no markdown|without markdown|no explanation|without explanation|no code fence|without code fence|コードのみ|説明なし|説明不要|コードフェンスなし|```なし|関数本体のみ|本体のみ)/i;
const FUNCTION_BODY_ONLY_RE =
  /(function body only|only function body|return function body only|関数本体のみ|本体のみ)/i;

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
    const normalizedOutput = this.applyOutputConstraints(result.text, instruction);

    return this.wrapResult({
      output: normalizedOutput,
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
    const normalizedOutput = this.applyOutputConstraints(result.text, fullInstruction);

    return this.wrapResult({
      refactored: normalizedOutput,
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
    const normalizedOutput = this.applyOutputConstraints(result.text, instruction);

    return this.wrapResult({
      tests: normalizedOutput,
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
    const normalizedOutput = this.applyOutputConstraints(result.text, fullInstruction);

    return this.wrapResult({
      fix: normalizedOutput,
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
    const normalizedOutput = this.applyOutputConstraints(result.text, instruction);

    return this.wrapResult({
      completion: normalizedOutput,
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
    const normalizedOutput = this.applyOutputConstraints(result.text, instruction);

    return this.wrapResult({
      translated: normalizedOutput,
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
        const generation = await this.runSingleTask({
          taskType: 'generate',
          instruction: task.instruction,
          context: task.context,
          language: task.language,
          filePath: task.filePath,
          timeoutMs: this.optionalInteger(input, 'timeoutMs'),
        });
        const normalizedContent = this.applyOutputConstraints(
          generation.text,
          task.instruction
        );

        return {
          filePath: task.filePath,
          content: normalizedContent,
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
    const prepared = this.prepareModelInput(params);
    return this.workerPool.executeTask({
      ...params,
      instruction: prepared.instruction,
      context: prepared.context,
    });
  }

  private prepareModelInput(params: {
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
  }): { instruction: string; context?: string } {
    const instruction = this.limitText(params.instruction.trim(), MAX_INSTRUCTION_CHARS);
    const context =
      params.context !== undefined
        ? this.limitText(params.context.trim(), MAX_CONTEXT_CHARS)
        : undefined;

    const languageHint = this.inferLanguageHint([instruction, context].filter(Boolean).join('\n'));
    const envelope = [
      `ExecutionProfile: ${params.taskType}`,
      'ReasoningPolicy: compact, deterministic, implementation-first.',
      languageHint === 'english'
        ? 'InputLanguageHint: likely English.'
        : 'InputLanguageHint: likely non-English. Translate internally to concise English before solving.',
      'OutputPolicy: do not mention internal translation, profiles, or hidden steps.',
      '',
      'UserInstruction:',
      instruction,
    ].join('\n');

    const preparedContext =
      context && context.length > 0
        ? ['NormalizedContext:', context].join('\n')
        : undefined;

    return {
      instruction: envelope,
      context: preparedContext,
    };
  }

  private applyOutputConstraints(output: string, instruction: string): string {
    if (!CODE_ONLY_INSTRUCTION_RE.test(instruction)) {
      return output;
    }

    let normalized = output.trim();
    const fenced = this.extractFirstFencedCodeBlock(normalized);
    if (fenced) {
      normalized = fenced.trim();
    } else {
      normalized = this.stripFenceMarkers(normalized).trim();
      const likelyCode = this.extractLikelyCodeSnippet(normalized);
      if (likelyCode) {
        normalized = likelyCode.trim();
      }
    }

    if (FUNCTION_BODY_ONLY_RE.test(instruction)) {
      const bodyOnly = this.extractFunctionBody(normalized);
      if (bodyOnly) {
        normalized = bodyOnly.trim();
      }
    }

    return normalized;
  }

  private extractFirstFencedCodeBlock(text: string): string | undefined {
    const match = text.match(/```[^\n]*\n([\s\S]*?)```/);
    return match?.[1];
  }

  private stripFenceMarkers(text: string): string {
    return text.replace(/```[^\n]*\n?/g, '').replace(/```/g, '');
  }

  private extractLikelyCodeSnippet(text: string): string | undefined {
    const lines = text.split(/\r?\n/);
    let firstCodeLine = -1;
    let lastCodeLine = -1;

    lines.forEach((line, index) => {
      if (this.isCodeLikeLine(line.trim())) {
        if (firstCodeLine === -1) {
          firstCodeLine = index;
        }
        lastCodeLine = index;
      }
    });

    if (firstCodeLine === -1 || lastCodeLine === -1) {
      return undefined;
    }

    const candidate = lines.slice(firstCodeLine, lastCodeLine + 1);
    const filtered = candidate.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return true;
      }
      if (this.isCodeLikeLine(trimmed)) {
        return true;
      }
      return !this.isLikelyProseLine(trimmed);
    });

    const joined = filtered.join('\n').trim();
    return joined.length > 0 ? joined : undefined;
  }

  private isCodeLikeLine(line: string): boolean {
    if (line.length === 0) {
      return false;
    }
    if (/^(function|const|let|var|class|interface|type|enum|import|export|if|for|while|switch|return|async|await|try|catch|finally|public|private|protected|def|fn)\b/.test(line)) {
      return true;
    }
    if (/^(\/\/|\/\*|\*|#)/.test(line)) {
      return true;
    }
    if (/[{}()[\];=<>]/.test(line) || line.includes('=>')) {
      return true;
    }
    return false;
  }

  private isLikelyProseLine(line: string): boolean {
    if (line.length === 0) {
      return false;
    }
    if (this.isCodeLikeLine(line)) {
      return false;
    }
    const words = line.split(/\s+/).filter((word) => word.length > 0).length;
    return words >= 5;
  }

  private extractFunctionBody(text: string): string | undefined {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).trim();
    }

    const openIndex = trimmed.indexOf('{');
    if (openIndex < 0) {
      return undefined;
    }

    let depth = 0;
    let closeIndex = -1;
    for (let index = openIndex; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          closeIndex = index;
          break;
        }
      }
    }

    if (closeIndex <= openIndex) {
      return undefined;
    }

    return trimmed.slice(openIndex + 1, closeIndex).trim();
  }

  private limitText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }

    const headLength = Math.floor(maxChars * 0.7);
    const tailLength = maxChars - headLength;
    const head = text.slice(0, headLength).trimEnd();
    const tail = text.slice(-tailLength).trimStart();
    return `${head}\n\n[...truncated...]\n\n${tail}`;
  }

  private inferLanguageHint(text: string): 'english' | 'non_english' {
    if (text.length === 0) {
      return 'english';
    }

    const asciiMatches = text.match(/[A-Za-z0-9\s.,:;!?'"`~!@#$%^&*()_+\-=[\]{}|\\/<>]/g);
    const asciiCount = asciiMatches ? asciiMatches.length : 0;
    const ratio = asciiCount / text.length;
    return ratio >= 0.9 ? 'english' : 'non_english';
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
