import type { Logger } from '@leadlovers/simple-email-service';

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const consoleLogger: Logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
