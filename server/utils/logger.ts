/**
 * server/utils/logger.ts
 *
 * Structured, levelled logger. Outputs JSON lines in production so log
 * aggregators (Datadog, Loki, etc.) can parse them. Outputs coloured
 * human-readable lines in development.
 *
 * Usage:
 *   import { logger } from './utils/logger.js';
 *   logger.info('Job started', { jobId: '123', type: 'webhook.process' });
 *   logger.error('Job failed', error, { jobId: '123' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

const LEVEL_COLOURS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

function formatDev(entry: LogEntry): string {
  const colour = LEVEL_COLOURS[entry.level];
  const level  = entry.level.toUpperCase().padEnd(5);
  const time   = entry.timestamp.substring(11, 23); // HH:MM:SS.mmm

  let line = `${colour}${level}${RESET} [${time}] ${entry.message}`;

  if (entry.context && Object.keys(entry.context).length > 0) {
    line += '  ' + JSON.stringify(entry.context);
  }
  if (entry.error) {
    line += `\n  ${entry.error.name}: ${entry.error.message}`;
    if (entry.error.stack) {
      // Only the first 3 stack frames to keep output manageable
      const frames = entry.error.stack.split('\n').slice(1, 4).join('\n  ');
      line += `\n  ${frames}`;
    }
  }
  return line;
}

function formatProd(entry: LogEntry): string {
  return JSON.stringify(entry);
}

// ── Core ──────────────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

// Set minimum log level via LOG_LEVEL env var (default: debug in dev, info in prod)
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ??
  (isProd ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function serializeError(err: unknown): LogEntry['error'] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name:    err.name,
      message: err.message,
      stack:   err.stack,
      code:    (err as any).code,
    };
  }
  return { name: 'UnknownError', message: String(err) };
}

function write(
  level: LogLevel,
  message: string,
  errorOrContext?: unknown,
  context?: Record<string, unknown>
): void {
  if (!shouldLog(level)) return;

  // Overloads:
  //   logger.info(msg, context?)
  //   logger.error(msg, error, context?)
  let resolvedError: unknown;
  let resolvedContext: Record<string, unknown> | undefined;

  if (level === 'error') {
    resolvedError   = errorOrContext;
    resolvedContext = context;
  } else {
    resolvedContext = errorOrContext as Record<string, unknown> | undefined;
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(resolvedContext ? { context: resolvedContext } : {}),
    ...(resolvedError   ? { error: serializeError(resolvedError) } : {}),
  };

  const line = isProd ? formatProd(entry) : formatDev(entry);

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    write('debug', message, context);
  },

  info(message: string, context?: Record<string, unknown>): void {
    write('info', message, context);
  },

  warn(message: string, context?: Record<string, unknown>): void {
    write('warn', message, context);
  },

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    write('error', message, error, context);
  },

  /** Returns a child logger that automatically injects fixed context fields */
  child(baseContext: Record<string, unknown>): typeof logger {
    return {
      debug: (msg, ctx) => logger.debug(msg, { ...baseContext, ...ctx }),
      info:  (msg, ctx) => logger.info(msg,  { ...baseContext, ...ctx }),
      warn:  (msg, ctx) => logger.warn(msg,  { ...baseContext, ...ctx }),
      error: (msg, err, ctx) => logger.error(msg, err, { ...baseContext, ...ctx }),
      child: (ctx) => logger.child({ ...baseContext, ...ctx }),
    };
  },
};
