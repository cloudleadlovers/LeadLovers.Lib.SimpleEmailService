import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { loadConfig, resetConfigForTests } from '../../src/config.js';
import { EmailConfigError } from '../../src/errors.js';

const saved = {
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
};

function clearEnv(): void {
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
}

function restoreEnv(): void {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  resetConfigForTests();
  clearEnv();
});

afterEach(() => {
  resetConfigForTests();
  restoreEnv();
});

describe('loadConfig', () => {
  test('parses valid config', () => {
    process.env.DATABASE_URL = 'sqlserver://localhost:1433;database=x';
    process.env.REDIS_URL = 'redis://localhost:6379';
    const cfg = loadConfig();
    expect(cfg.DATABASE_URL).toBe('sqlserver://localhost:1433;database=x');
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379');
  });

  test('throws EmailConfigError on missing DATABASE_URL', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(() => loadConfig()).toThrow(EmailConfigError);
    expect(() => loadConfig()).toThrow('missing required env var DATABASE_URL');
  });

  test('throws EmailConfigError on missing REDIS_URL', () => {
    process.env.DATABASE_URL = 'sqlserver://x';
    expect(() => loadConfig()).toThrow(EmailConfigError);
    expect(() => loadConfig()).toThrow('missing required env var REDIS_URL');
  });

  test('memoizes the result', () => {
    process.env.DATABASE_URL = 'a';
    process.env.REDIS_URL = 'b';
    const first = loadConfig();
    process.env.DATABASE_URL = 'changed';
    const second = loadConfig();
    expect(second).toBe(first);
    expect(second.DATABASE_URL).toBe('a');
  });
});
