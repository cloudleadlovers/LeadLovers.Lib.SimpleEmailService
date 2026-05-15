import { describe, test, expect } from 'bun:test';
import {
  computeIdempotencyHash,
  idempotencyCacheKey,
  getCached,
  setCachedNX,
} from '../../src/cache/idempotency.js';
import type { RedisLike } from '../../src/cache/redis.js';

interface SetOptions {
  condition?: string;
  expiration?: { type: string; value: number };
}

function fakeRedis(): RedisLike & { store: Map<string, string>; setOpts: SetOptions[] } {
  const store = new Map<string, string>();
  const setOpts: SetOptions[] = [];
  const stub = {
    store,
    setOpts,
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async set(k: string, v: string, opts: SetOptions) {
      setOpts.push(opts);
      if (opts?.condition === 'NX' && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
  };
  return stub as unknown as RedisLike & { store: typeof store; setOpts: typeof setOpts };
}

describe('computeIdempotencyHash', () => {
  test('deterministic for the same inputs', () => {
    expect(computeIdempotencyHash(1, 'a@b.co', 's')).toBe(
      computeIdempotencyHash(1, 'a@b.co', 's'),
    );
  });
  test('changes when projectId differs', () => {
    expect(computeIdempotencyHash(1, 'a@b.co', 's')).not.toBe(
      computeIdempotencyHash(2, 'a@b.co', 's'),
    );
  });
  test('changes when to differs', () => {
    expect(computeIdempotencyHash(1, 'a@b.co', 's')).not.toBe(
      computeIdempotencyHash(1, 'c@b.co', 's'),
    );
  });
  test('changes when subject differs', () => {
    expect(computeIdempotencyHash(1, 'a@b.co', 's')).not.toBe(
      computeIdempotencyHash(1, 'a@b.co', 't'),
    );
  });
});

describe('idempotencyCacheKey', () => {
  test('prefixes ses:idem:', () => {
    expect(idempotencyCacheKey('abc')).toBe('ses:idem:abc');
  });
});

describe('getCached / setCachedNX', () => {
  test('miss returns null', async () => {
    const r = fakeRedis();
    expect(await getCached(r, 'h')).toBeNull();
  });

  test('hit returns the cached id (bigint) and queuedAt (Date)', async () => {
    const r = fakeRedis();
    const id = 42n;
    const queuedAt = new Date('2026-05-15T12:00:00.000Z');
    await setCachedNX(r, 'h', { id, queuedAt });
    const hit = await getCached(r, 'h');
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe(42n);
    expect(hit?.queuedAt.getTime()).toBe(queuedAt.getTime());
  });

  test('NX prevents overwrite (first writer wins)', async () => {
    const r = fakeRedis();
    await setCachedNX(r, 'h', { id: 1n, queuedAt: new Date(1000) });
    await setCachedNX(r, 'h', { id: 2n, queuedAt: new Date(2000) });
    expect((await getCached(r, 'h'))?.id).toBe(1n);
  });

  test('SET passes EX 600 NX options', async () => {
    const r = fakeRedis();
    await setCachedNX(r, 'h', { id: 1n, queuedAt: new Date(0) });
    expect(r.setOpts[0]).toEqual({
      expiration: { type: 'EX', value: 600 },
      condition: 'NX',
    });
  });
});
