import { describe, test, expect } from 'bun:test';
import { checkRateLimit } from '../../../src/cache/rate-limit.js';
import type { RedisLike } from '../../../src/cache/redis.js';

function fakeRedis(): RedisLike & {
  counters: Map<string, number>;
  expires: Array<{ key: string; seconds: number }>;
} {
  const counters = new Map<string, number>();
  const expires: Array<{ key: string; seconds: number }> = [];
  const stub = {
    counters,
    expires,
    async incr(k: string) {
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return n;
    },
    async expire(k: string, seconds: number) {
      expires.push({ key: k, seconds });
      return 1;
    },
  };
  return stub as unknown as RedisLike & {
    counters: typeof counters;
    expires: typeof expires;
  };
}

describe('checkRateLimit', () => {
  const t0 = new Date('2026-05-15T00:00:30.000Z');

  test('first call within the limit is allowed and sets EXPIRE 65', async () => {
    const r = fakeRedis();
    const d = await checkRateLimit(r, 1, 60, t0);
    expect(d.allowed).toBe(true);
    expect(d.retryAfterMs).toBe(0);
    expect(r.expires).toEqual([{ key: 'ses:rl:1:29646720', seconds: 65 }]);
  });

  test('only sets EXPIRE on the first call of a window', async () => {
    const r = fakeRedis();
    await checkRateLimit(r, 1, 60, t0);
    await checkRateLimit(r, 1, 60, t0);
    expect(r.expires.length).toBe(1);
  });

  test('allows exactly the limit', async () => {
    const r = fakeRedis();
    for (let i = 0; i < 60; i++) {
      const d = await checkRateLimit(r, 1, 60, t0);
      expect(d.allowed).toBe(true);
    }
  });

  test('rejects the (limit+1)-th call with retryAfterMs to window end', async () => {
    const r = fakeRedis();
    for (let i = 0; i < 60; i++) await checkRateLimit(r, 1, 60, t0);
    const d = await checkRateLimit(r, 1, 60, t0);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(30_000);
  });

  test('separate projects have separate counters', async () => {
    const r = fakeRedis();
    for (let i = 0; i < 60; i++) await checkRateLimit(r, 1, 60, t0);
    const d = await checkRateLimit(r, 2, 60, t0);
    expect(d.allowed).toBe(true);
  });

  test('new minute resets the counter', async () => {
    const r = fakeRedis();
    for (let i = 0; i < 60; i++) await checkRateLimit(r, 1, 60, t0);
    const tNext = new Date('2026-05-15T00:01:30.000Z');
    const d = await checkRateLimit(r, 1, 60, tNext);
    expect(d.allowed).toBe(true);
  });
});
