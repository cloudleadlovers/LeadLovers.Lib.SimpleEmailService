import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { loadConfig, resetConfigForTests } from '../../src/config.js';
import { EmailConfigError } from '../../src/errors.js';

const saved = {
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  SES_RATE_LIMIT_PER_MINUTE: process.env.SES_RATE_LIMIT_PER_MINUTE,
};

function clearEnv(): void {
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  delete process.env.SES_RATE_LIMIT_PER_MINUTE;
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
  test('parses valid config with default rate limit', () => {
    process.env.DATABASE_URL = 'sqlserver://localhost:1433;database=x';
    process.env.REDIS_URL = 'redis://localhost:6379';
    const cfg = loadConfig();
    expect(cfg.DATABASE_URL).toBe('sqlserver://localhost:1433;database=x');
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379');
    expect(cfg.SES_RATE_LIMIT_PER_MINUTE).toBe(60);
  });

  test('parses a custom rate limit', () => {
    process.env.DATABASE_URL = 'x';
    process.env.REDIS_URL = 'y';
    process.env.SES_RATE_LIMIT_PER_MINUTE = '200';
    expect(loadConfig().SES_RATE_LIMIT_PER_MINUTE).toBe(200);
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

  test('throws EmailConfigError on non-positive rate limit', () => {
    process.env.DATABASE_URL = 'x';
    process.env.REDIS_URL = 'y';
    process.env.SES_RATE_LIMIT_PER_MINUTE = '0';
    expect(() => loadConfig()).toThrow('SES_RATE_LIMIT_PER_MINUTE must be a positive integer');
  });

  test('throws EmailConfigError on non-integer rate limit', () => {
    process.env.DATABASE_URL = 'x';
    process.env.REDIS_URL = 'y';
    process.env.SES_RATE_LIMIT_PER_MINUTE = '3.5';
    expect(() => loadConfig()).toThrow('SES_RATE_LIMIT_PER_MINUTE must be a positive integer');
  });

  test('throws EmailConfigError on non-numeric rate limit', () => {
    process.env.DATABASE_URL = 'x';
    process.env.REDIS_URL = 'y';
    process.env.SES_RATE_LIMIT_PER_MINUTE = 'abc';
    expect(() => loadConfig()).toThrow('SES_RATE_LIMIT_PER_MINUTE must be a positive integer');
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
