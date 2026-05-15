import { describe, test, expect, afterAll } from 'bun:test';
import { email } from '../../src/index.js';

const dbUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const gated = dbUrl && redisUrl ? describe : describe.skip;

if (dbUrl) process.env.DATABASE_URL = dbUrl;
if (redisUrl) process.env.REDIS_URL = redisUrl;

gated('send (integration) — idempotency', () => {
  afterAll(async () => {
    await email.disconnect();
  });

  test('second send with same projectId/to/subject within 10 min is deduplicated', async () => {
    const to = `dedup-${Date.now()}@example.com`;
    const subject = `dedup-${Date.now()}`;
    const first = await email.send({ projectId: 1, to, subject, message: 'first' });
    expect(first.success).toBe(true);
    if (!first.success) return;

    const second = await email.send({
      projectId: 1,
      to,
      subject,
      message: 'second body should be ignored',
    });
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.deduplicated).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.queuedAt.getTime()).toBe(first.queuedAt.getTime());
  });

  test('changing subject breaks the dedup window', async () => {
    const to = `dedup2-${Date.now()}@example.com`;
    const first = await email.send({ projectId: 1, to, subject: 'a', message: 'm' });
    const second = await email.send({ projectId: 1, to, subject: 'b', message: 'm' });
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(second.deduplicated).toBe(false);
      expect(second.id).not.toBe(first.id);
    }
  });
});
