import { createHash } from 'node:crypto';
import type { RedisLike } from './redis.js';

const TTL_SECONDS = 600;

interface CachedPayload {
  id: string;
  queuedAt: string;
}

export interface IdempotencyValue {
  id: bigint;
  queuedAt: Date;
}

export function computeIdempotencyHash(
  projectId: number,
  to: string,
  subject: string,
): string {
  return createHash('sha256').update(`${projectId}|${to}|${subject}`).digest('hex');
}

export function idempotencyCacheKey(hash: string): string {
  return `ses:idem:${hash}`;
}

export async function getCached(
  redis: RedisLike,
  hash: string,
): Promise<IdempotencyValue | null> {
  const raw = await redis.get(idempotencyCacheKey(hash));
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as CachedPayload;
  return {
    id: BigInt(parsed.id),
    queuedAt: new Date(parsed.queuedAt),
  };
}

export async function setCachedNX(
  redis: RedisLike,
  hash: string,
  value: IdempotencyValue,
): Promise<void> {
  const payload: CachedPayload = {
    id: value.id.toString(),
    queuedAt: value.queuedAt.toISOString(),
  };
  await redis.set(idempotencyCacheKey(hash), JSON.stringify(payload), {
    expiration: { type: 'EX', value: TTL_SECONDS },
    condition: 'NX',
  });
}
