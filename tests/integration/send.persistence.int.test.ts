import { describe, test, expect, afterAll } from 'bun:test';
import { email } from '../../src/index.js';

const dbUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const gated = dbUrl && redisUrl ? describe : describe.skip;

if (dbUrl) process.env.DATABASE_URL = dbUrl;
if (redisUrl) process.env.REDIS_URL = redisUrl;

gated('send (integration) — persistence', () => {
  afterAll(async () => {
    await email.disconnect();
  });

  test('happy path returns id as bigint and queuedAt as Date', async () => {
    const r = await email.send({
      projectId: 1,
      to: `persist-${Date.now()}@example.com`,
      subject: `persist-${Date.now()}`,
      message: 'persistence test body',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.id).toBe('bigint');
      expect(r.id).toBeGreaterThan(0n);
      expect(r.queuedAt).toBeInstanceOf(Date);
    }
  });
});
