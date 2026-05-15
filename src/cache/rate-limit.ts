import type { RedisLike } from './redis.js';

const WINDOW_TTL_SECONDS = 65;

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

export async function checkRateLimit(
  redis: RedisLike,
  projectId: number,
  limit: number,
  now: Date = new Date(),
): Promise<RateLimitDecision> {
  const unixMinute = Math.floor(now.getTime() / 60_000);
  const key = `ses:rl:${projectId}:${unixMinute}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_TTL_SECONDS);
  }
  if (count > limit) {
    const windowEndMs = (unixMinute + 1) * 60_000;
    return {
      allowed: false,
      retryAfterMs: Math.max(1, windowEndMs - now.getTime()),
    };
  }
  return { allowed: true, retryAfterMs: 0 };
}
