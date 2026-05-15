import { describe, test, expect, afterAll } from 'bun:test';
import { email } from '../../src/index.js';

const dbUrl = process.env.TEST_DATABASE_URL;
const gated = dbUrl ? describe : describe.skip;

if (dbUrl) {
  process.env.DATABASE_URL = dbUrl;
  if (process.env.TEST_REDIS_URL) {
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
  } else {
    process.env.REDIS_URL ??= 'redis://localhost:6379';
  }
}

gated('send (integration) — happy path', () => {
  afterAll(async () => {
    await email.disconnect();
  });

  test('inserts a row and returns { success: true, id, queuedAt, deduplicated: false }', async () => {
    const result = await email.send({
      projectId: 1,
      to: `it-${Date.now()}@example.com`,
      subject: `it-${Date.now()}`,
      message: 'integration test body',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.id).toBe('bigint');
      expect(result.queuedAt).toBeInstanceOf(Date);
      expect(result.deduplicated).toBe(false);
    }
  });
});
