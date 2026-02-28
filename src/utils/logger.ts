import { LogLevel } from '../types.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly scope: string = 'core'
  ) {}

  child(scope: string): Logger {
    return new Logger(this.level, scope);
  }

  debug(message: string, ...meta: unknown[]): void {
    this.write('debug', message, meta);
  }

  info(message: string, ...meta: unknown[]): void {
    this.write('info', message, meta);
  }

  warn(message: string, ...meta: unknown[]): void {
    this.write('warn', message, meta);
  }

  error(message: string, ...meta: unknown[]): void {
    this.write('error', message, meta);
  }

  private write(level: LogLevel, message: string, meta: unknown[]): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    if (meta.length === 0) {
      console.error(`[RuvLTRA][${level.toUpperCase()}][${this.scope}] ${message}`);
      return;
    }

    console.error(
      `[RuvLTRA][${level.toUpperCase()}][${this.scope}] ${message}`,
      ...meta
    );
  }
}
