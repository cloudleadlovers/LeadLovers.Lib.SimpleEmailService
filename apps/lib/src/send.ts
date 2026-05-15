import { EmailSendInputSchema, type EmailSendInput } from './schema.js';
import type { EmailSendResult, EmailSendSuccess } from './types.js';
import { getPrisma } from './db/prisma.js';
import { getRedis } from './cache/redis.js';
import { mapPrismaError } from './db/error-map.js';
import { mapRedisError } from './cache/error-map.js';
import { loadConfig } from './config.js';
import {
  computeIdempotencyHash,
  getCached,
  setCachedNX,
} from './cache/idempotency.js';
import { checkRateLimit } from './cache/rate-limit.js';
import { Messages } from './errors.js';
import { getLogger } from './utils/logger.js';

export async function send(input: EmailSendInput): Promise<EmailSendResult> {
  const parsed = EmailSendInputSchema.safeParse(input);
  if (!parsed.success) {
    const error = parsed.error.issues.map((i) => i.message).join('; ');
    return { success: false, code: 'validation_error', error };
  }
  const { projectId, to, subject, message } = parsed.data;

  const cfg = loadConfig();
  const prisma = getPrisma();

  let redis;
  try {
    redis = await getRedis();
  } catch (err) {
    return { success: false, code: 'cache_error', error: mapRedisError(err) };
  }

  const hash = computeIdempotencyHash(projectId, to, subject);
  try {
    const hit = await getCached(redis, hash);
    if (hit) {
      return {
        success: true,
        id: hit.id,
        queuedAt: hit.queuedAt,
        deduplicated: true,
      };
    }
  } catch (err) {
    return { success: false, code: 'cache_error', error: mapRedisError(err) };
  }

  let decision;
  try {
    decision = await checkRateLimit(redis, projectId, cfg.SES_RATE_LIMIT_PER_MINUTE);
  } catch (err) {
    return { success: false, code: 'cache_error', error: mapRedisError(err) };
  }
  if (!decision.allowed) {
    return {
      success: false,
      code: 'rate_limited',
      error: Messages.rateLimit(cfg.SES_RATE_LIMIT_PER_MINUTE),
      retryAfterMs: decision.retryAfterMs,
    };
  }

  let row;
  try {
    row = await prisma.emails.create({
      data: { projectId, to, subject, body: message },
    });
  } catch (err) {
    return {
      success: false,
      code: 'persistence_error',
      error: mapPrismaError(err),
    };
  }

  const success: EmailSendSuccess = {
    success: true,
    id: row.id,
    queuedAt: row.createdAt,
    deduplicated: false,
  };

  try {
    await setCachedNX(redis, hash, { id: row.id, queuedAt: row.createdAt });
  } catch (err) {
    getLogger().warn('idempotency cache write failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return success;
}
