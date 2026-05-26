import { mapRedisError } from './cache/error-map.js';
import {
  computeIdempotencyHash,
  getCached,
  setCachedNX,
} from './cache/idempotency.js';
import { checkRateLimit, RATE_LIMIT_PER_MINUTE } from './cache/rate-limit.js';
import { getRedis } from './cache/redis.js';
import { mapPrismaError } from './db/error-map.js';
import { getPrisma } from './db/prisma.js';
import { Messages } from './errors.js';
import { EmailSendInputSchema, type EmailSendInput } from './schema.js';
import type { EmailSendResult, EmailSendSuccess } from './types.js';
import { getLogger } from './utils/logger.js';

export async function send(input: EmailSendInput): Promise<EmailSendResult> {
  const parsed = EmailSendInputSchema.safeParse(input);
  if (!parsed.success) {
    const error = parsed.error.issues.map((i) => i.message).join('; ');
    getLogger().info('send: validation failed', { error });
    return { success: false, code: 'validation_error', error };
  }
  const { projectId, to, subject, message } = parsed.data;
  const ctx = { projectId, to, subject };

  const prisma = getPrisma();

  let redis;
  try {
    redis = await getRedis();
  } catch (err) {
    getLogger().error('send: redis connect failed', {
      ...ctx,
      ...errorMeta(err),
    });
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
    getLogger().error('send: idempotency lookup failed', {
      ...ctx,
      hash,
      ...errorMeta(err),
    });
    return { success: false, code: 'cache_error', error: mapRedisError(err) };
  }

  let decision;
  try {
    decision = await checkRateLimit(redis, projectId, RATE_LIMIT_PER_MINUTE);
  } catch (err) {
    getLogger().error('send: rate limit check failed', {
      ...ctx,
      ...errorMeta(err),
    });
    return { success: false, code: 'cache_error', error: mapRedisError(err) };
  }
  if (!decision.allowed) {
    getLogger().warn('send: rate limited', {
      ...ctx,
      retryAfterMs: decision.retryAfterMs,
    });
    return {
      success: false,
      code: 'rate_limited',
      error: Messages.rateLimit(RATE_LIMIT_PER_MINUTE),
      retryAfterMs: decision.retryAfterMs,
    };
  }

  let row;
  try {
    const inserted = await prisma.$queryRaw<
      Array<{ EmailCodi: bigint; EmailDataCada: Date }>
    >`
      INSERT INTO dinfo..EmailSequence (ProjCodi, EmailPara, EmailAssunto, EmailMsg, EmailDataCada, EmailDataEnviar, StatCodi, EmailHtml, EmailTentativas, EmailPrioridade, EmailTipoEnvi)
      OUTPUT INSERTED.EmailCodi, INSERTED.EmailDataCada
      VALUES (${projectId}, ${to}, ${subject}, ${message}, GETDATE(), GETDATE(), 1, 1, 0, -1, 1)
    `;
    const head = inserted[0];
    if (!head) {
      throw new Error('insert returned no rows');
    }
    row = { id: head.EmailCodi, createdAt: head.EmailDataCada };
  } catch (err) {
    getLogger().error('send: prisma create failed', {
      ...ctx,
      ...errorMeta(err),
    });
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
    getLogger().warn('send: idempotency cache write failed', {
      ...ctx,
      hash,
      ...errorMeta(err),
    });
  }

  return success;
}

function errorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & { code?: string };
    return {
      error: err.message,
      name: err.name,
      code: e.code,
      stack: err.stack,
    };
  }
  return { error: String(err) };
}
