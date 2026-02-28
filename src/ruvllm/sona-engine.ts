import fs from 'node:fs';
import path from 'node:path';
import { SonaPatternSummary, SonaStats, TaskType } from '../types.js';
import { Logger } from '../utils/logger.js';

interface PatternState {
  key: string;
  score: number;
  importance: number;
  hits: number;
  successes: number;
  lastSeenAt: number;
}

interface RecordInput {
  taskType: TaskType;
  instruction: string;
  response: string;
  success: boolean;
  latencyMs: number;
  language?: string;
  filePath?: string;
  promptTokens?: number;
  completionTokens?: number;
}

const CONSOLIDATE_INTERVAL = 20;
const MAX_HINTS = 3;
const MAX_PATTERNS = 600;

interface PersistedSonaState {
  version: 1;
  interactions: number;
  successes: number;
  consolidations: number;
  lastConsolidatedAt?: number;
  patterns: Array<{
    key: string;
    score: number;
    importance: number;
    hits: number;
    successes: number;
    lastSeenAt: number;
  }>;
}

interface SonaEngineOptions {
  workerId: string;
  enabled: boolean;
  stateFilePath?: string;
  persistInterval: number;
  logger?: Logger;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function extractKeywords(input: string): string[] {
  const words = input
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length >= 4);
  return Array.from(new Set(words)).slice(0, 6);
}

export class SonaEngine {
  private readonly patterns = new Map<string, PatternState>();
  private interactions = 0;
  private successes = 0;
  private consolidations = 0;
  private lastConsolidatedAt: number | undefined;
  private readonly stateFilePath?: string;
  private readonly persistInterval: number;
  private readonly logger: Logger;

  constructor(private readonly options: SonaEngineOptions) {
    this.stateFilePath = options.stateFilePath;
    this.persistInterval = Math.max(1, options.persistInterval);
    this.logger = options.logger ?? new Logger('error', `sona:${options.workerId}`);
    this.loadStateFromDisk();
  }

  enhanceInstruction(
    instruction: string,
    taskType: TaskType,
    language?: string
  ): string {
    if (!this.options.enabled) {
      return instruction;
    }

    const hints = this.selectHints(taskType, language);
    if (hints.length === 0) {
      return instruction;
    }

    const hintLines = hints.map((hint, index) => `${index + 1}. ${hint}`).join('\n');
    return [
      'Apply these learned project preferences before answering:',
      hintLines,
      '',
      instruction,
    ].join('\n');
  }

  recordInteraction(input: RecordInput): void {
    if (!this.options.enabled) {
      return;
    }

    this.interactions += 1;
    if (input.success) {
      this.successes += 1;
    }

    const keys = this.extractPatternKeys(input);
    const quality = this.calculateQuality(input);
    for (const key of keys) {
      this.updatePattern(key, quality, input.success);
    }

    if (this.interactions % CONSOLIDATE_INTERVAL === 0) {
      this.consolidate();
    }
    if (this.interactions % this.persistInterval === 0) {
      this.flush();
    }
  }

  getStats(): SonaStats {
    const topPatterns = this.getTopPatternSummaries(5);
    return {
      workerId: this.options.workerId,
      enabled: this.options.enabled,
      interactions: this.interactions,
      successRate:
        this.interactions === 0
          ? 0
          : Number((this.successes / this.interactions).toFixed(4)),
      patternsLearned: this.patterns.size,
      protectedPatterns: Array.from(this.patterns.values()).filter(
        (pattern) => pattern.importance >= 0.6
      ).length,
      consolidations: this.consolidations,
      lastConsolidatedAt: this.lastConsolidatedAt
        ? new Date(this.lastConsolidatedAt).toISOString()
        : undefined,
      topPatterns,
    };
  }

  flush(): void {
    if (!this.options.enabled || !this.stateFilePath) {
      return;
    }
    try {
      const payload: PersistedSonaState = {
        version: 1,
        interactions: this.interactions,
        successes: this.successes,
        consolidations: this.consolidations,
        lastConsolidatedAt: this.lastConsolidatedAt,
        patterns: Array.from(this.patterns.values()).map((pattern) => ({
          key: pattern.key,
          score: pattern.score,
          importance: pattern.importance,
          hits: pattern.hits,
          successes: pattern.successes,
          lastSeenAt: pattern.lastSeenAt,
        })),
      };

      const parentDir = path.dirname(this.stateFilePath);
      fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(this.stateFilePath, JSON.stringify(payload), 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to persist SONA state', { error: message });
    }
  }

  private extractPatternKeys(input: RecordInput): string[] {
    const keys = new Set<string>();
    keys.add(`task:${input.taskType}`);
    keys.add('task:general');

    if (input.language) {
      keys.add(`lang:${input.language.toLowerCase()}`);
    }

    if (input.filePath) {
      const extension = this.extractFileExtension(input.filePath);
      if (extension) {
        keys.add(`fileext:${extension.toLowerCase()}`);
      }
    }

    for (const keyword of extractKeywords(input.instruction)) {
      keys.add(`kw:${keyword}`);
    }

    if (input.response.includes('try') && input.response.includes('catch')) {
      keys.add('pattern:error-handling');
    }
    if (input.response.includes('interface ') || input.response.includes('type ')) {
      keys.add('pattern:typed-api');
    }

    return Array.from(keys);
  }

  private calculateQuality(input: RecordInput): number {
    const base = input.success ? 0.8 : 0.2;
    const latencyPenalty = Math.min(input.latencyMs / 12_000, 0.4);
    const tokenBonus =
      input.completionTokens !== undefined
        ? Math.min(input.completionTokens / 1_600, 0.15)
        : 0;
    const promptPenalty =
      input.promptTokens !== undefined ? Math.min(input.promptTokens / 8_000, 0.08) : 0;
    return clamp(base + tokenBonus - latencyPenalty - promptPenalty, 0.05, 1);
  }

  private updatePattern(key: string, quality: number, success: boolean): void {
    const now = Date.now();
    const pattern = this.patterns.get(key) ?? {
      key,
      score: 0.5,
      importance: 0.2,
      hits: 0,
      successes: 0,
      lastSeenAt: now,
    };

    pattern.hits += 1;
    pattern.successes += success ? 1 : 0;
    pattern.lastSeenAt = now;

    // EWC-like memory protection: highly important patterns learn more slowly.
    const plasticity = Math.max(0.05, 1 - pattern.importance);
    const alpha = 0.28 * plasticity;
    pattern.score = pattern.score * (1 - alpha) + quality * alpha;

    const stabilityGain = success ? 0.06 : 0.01;
    pattern.importance = clamp(pattern.importance * 0.97 + stabilityGain, 0.05, 0.99);

    this.patterns.set(key, pattern);
  }

  private consolidate(): void {
    this.consolidations += 1;
    this.lastConsolidatedAt = Date.now();

    const now = Date.now();
    for (const [key, pattern] of this.patterns) {
      const ageMinutes = (now - pattern.lastSeenAt) / 60_000;
      const valueScore = pattern.score * 0.65 + pattern.importance * 0.35;

      if (pattern.hits <= 1 && ageMinutes > 30) {
        this.patterns.delete(key);
        continue;
      }

      if (valueScore < 0.22 && ageMinutes > 10) {
        this.patterns.delete(key);
      }
    }

    // Keep memory bounded under sustained workloads.
    if (this.patterns.size > MAX_PATTERNS) {
      const candidates = Array.from(this.patterns.values())
        .sort((a, b) => {
          const left = a.score * 0.7 + a.importance * 0.3;
          const right = b.score * 0.7 + b.importance * 0.3;
          return left - right;
        })
        .slice(0, this.patterns.size - MAX_PATTERNS);
      for (const pattern of candidates) {
        this.patterns.delete(pattern.key);
      }
    }

    this.flush();
  }

  private selectHints(taskType: TaskType, language?: string): string[] {
    const candidates = Array.from(this.patterns.values()).filter((pattern) => {
      if (pattern.key === `task:${taskType}`) {
        return true;
      }
      if (pattern.key === 'task:general') {
        return true;
      }
      if (language && pattern.key === `lang:${language.toLowerCase()}`) {
        return true;
      }
      return pattern.key.startsWith('kw:') || pattern.key.startsWith('pattern:');
    });

    candidates.sort((a, b) => {
      const left = a.score * 0.7 + a.importance * 0.3;
      const right = b.score * 0.7 + b.importance * 0.3;
      return right - left;
    });

    return candidates.slice(0, MAX_HINTS).map((pattern) => this.patternToHint(pattern));
  }

  private patternToHint(pattern: PatternState): string {
    if (pattern.key.startsWith('task:')) {
      return `Optimize for ${pattern.key.slice(5)} tasks with concise, directly usable output.`;
    }
    if (pattern.key.startsWith('lang:')) {
      return `Follow idiomatic ${pattern.key.slice(5)} project conventions.`;
    }
    if (pattern.key.startsWith('kw:')) {
      return `Respect prior preference around "${pattern.key.slice(3)}".`;
    }
    if (pattern.key.startsWith('pattern:error-handling')) {
      return 'Include defensive error handling for risky branches.';
    }
    if (pattern.key.startsWith('pattern:typed-api')) {
      return 'Keep API contracts explicit with strong typing.';
    }
    if (pattern.key.startsWith('fileext:')) {
      return `Match formatting and structure patterns for *.${pattern.key.slice(8)} files.`;
    }
    return `Reuse proven project style from pattern ${pattern.key}.`;
  }

  private extractFileExtension(filePath: string): string | undefined {
    const segments = filePath.split('.');
    if (segments.length < 2) {
      return undefined;
    }
    return segments[segments.length - 1];
  }

  private getTopPatternSummaries(limit: number): SonaPatternSummary[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => {
        const left = a.score * 0.7 + a.importance * 0.3;
        const right = b.score * 0.7 + b.importance * 0.3;
        return right - left;
      })
      .slice(0, limit)
      .map((pattern) => ({
        key: pattern.key,
        score: Number(pattern.score.toFixed(4)),
        importance: Number(pattern.importance.toFixed(4)),
        hits: pattern.hits,
      }));
  }

  private loadStateFromDisk(): void {
    if (!this.options.enabled || !this.stateFilePath) {
      return;
    }
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return;
      }
      const raw = fs.readFileSync(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedSonaState;
      if (parsed.version !== 1 || !Array.isArray(parsed.patterns)) {
        return;
      }

      this.interactions = Math.max(0, parsed.interactions ?? 0);
      this.successes = Math.max(0, parsed.successes ?? 0);
      this.consolidations = Math.max(0, parsed.consolidations ?? 0);
      this.lastConsolidatedAt = parsed.lastConsolidatedAt;

      for (const pattern of parsed.patterns) {
        if (
          typeof pattern.key !== 'string' ||
          typeof pattern.score !== 'number' ||
          typeof pattern.importance !== 'number' ||
          typeof pattern.hits !== 'number' ||
          typeof pattern.successes !== 'number' ||
          typeof pattern.lastSeenAt !== 'number'
        ) {
          continue;
        }
        this.patterns.set(pattern.key, {
          key: pattern.key,
          score: clamp(pattern.score, 0.01, 1),
          importance: clamp(pattern.importance, 0.01, 0.99),
          hits: Math.max(0, Math.floor(pattern.hits)),
          successes: Math.max(0, Math.floor(pattern.successes)),
          lastSeenAt: Math.max(0, Math.floor(pattern.lastSeenAt)),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to load SONA state', { error: message });
    }
  }
}
