/**
 * Lightweight client-side logging abstraction for SketchGit.
 *
 * P036 – replaces bare console.warn / console.error calls in lib/sketchgit/
 * with a level-aware, structured logger that is dependency-free and
 * tree-shakeable. In production the default level ('warn') suppresses
 * debug/info noise. Set window.__SKETCHGIT_LOG_LEVEL__ to override at runtime.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

let activeLevel: LogLevel = 'warn';

/** Change the active log level at runtime (e.g. from browser DevTools). */
export function setLogLevel(level: LogLevel): void {
  activeLevel = level;
}

/** Get the current active log level. */
export function getLogLevel(): LogLevel {
  return activeLevel;
}

type ErrorHook = (fields: Record<string, unknown>, msg: string) => void;
let errorHook: ErrorHook | null = null;

/** Register a hook that is called on every `logger.error()` invocation. */
export function onError(hook: ErrorHook): void {
  errorHook = hook;
}

function log(
  level: LogLevel,
  consoleFn: (...args: unknown[]) => void,
  fieldsOrMsg: Record<string, unknown> | string,
  msg?: string,
): void {
  if (LEVELS[level] < LEVELS[activeLevel]) return;
  const fields = typeof fieldsOrMsg === 'string' ? {} : fieldsOrMsg;
  const message = typeof fieldsOrMsg === 'string' ? fieldsOrMsg : (msg ?? '');
  consoleFn(`[sketchgit:${level}]`, message, fields);
  if (level === 'error' && errorHook) errorHook(fields, message);
}

export interface Logger {
  debug(msg: string): void;
  debug(fields: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(fields: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(fields: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(fields: Record<string, unknown>, msg: string): void;
}

export const logger: Logger = {
  debug: (fieldsOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('debug', console.debug, fieldsOrMsg, msg),
  info: (fieldsOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('info', console.info, fieldsOrMsg, msg),
  warn: (fieldsOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('warn', console.warn, fieldsOrMsg, msg),
  error: (fieldsOrMsg: Record<string, unknown> | string, msg?: string) =>
    log('error', console.error, fieldsOrMsg, msg),
};
