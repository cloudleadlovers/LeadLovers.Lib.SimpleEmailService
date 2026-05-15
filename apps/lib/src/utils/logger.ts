export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const noop: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

let current: Logger = noop;

export function setLogger(logger: Logger): void {
  current = logger;
}

export function getLogger(): Logger {
  return current;
}

export function resetLoggerForTests(): void {
  current = noop;
}
