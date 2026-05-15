import { describe, test, expect, afterAll, beforeAll } from 'bun:test';
import { email } from '../../src/index.js';

const dbUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const gated = dbUrl && redisUrl ? describe : describe.skip;

if (dbUrl) process.env.DATABASE_URL = dbUrl;
if (redisUrl) process.env.REDIS_URL = redisUrl;

const TEST_LIMIT = 5;

gated('send (integration) — rate limit', () => {
  beforeAll(() => {
    process.env.SES_RATE_LIMIT_PER_MINUTE = String(TEST_LIMIT);
  });

  afterAll(async () => {
    delete process.env.SES_RATE_LIMIT_PER_MINUTE;
    await email.disconnect();
  });

  test(`returns rate_limited on the ${TEST_LIMIT + 1}-th send within a minute`, async () => {
    const projectId = 9_999_900 + Math.floor(Math.random() * 1000);
    const stamp = Date.now();

    for (let i = 0; i < TEST_LIMIT; i++) {
      const r = await email.send({
        projectId,
        to: `rl-${stamp}-${i}@example.com`,
        subject: `rl-${stamp}-${i}`,
        message: 'rl',
      });
      expect(r.success).toBe(true);
    }

    const over = await email.send({
      projectId,
      to: `rl-${stamp}-over@example.com`,
      subject: `rl-${stamp}-over`,
      message: 'rl',
    });
    expect(over.success).toBe(false);
    if (!over.success) {
      expect(over.code).toBe('rate_limited');
      expect(over.retryAfterMs).toBeGreaterThan(0);
      expect(over.error).toContain(`${TEST_LIMIT} sends per minute per project`);
    }
  });
});
