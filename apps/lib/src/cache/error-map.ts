import { Messages } from '../errors.js';

interface RedisLikeError {
  code?: string;
  message?: string;
}

export function mapRedisError(err: unknown): string {
  if (!err || typeof err !== 'object') return Messages.cache.command();
  const e = err as RedisLikeError;
  const msg = (e.message ?? '').toLowerCase();
  const code = e.code ?? '';
  if (code === 'ECONNREFUSED' || msg.includes('econnrefused') || msg.includes('connection refused')) {
    return Messages.cache.refused();
  }
  if (msg.includes('noauth') || msg.includes('wrongpass') || msg.includes('authentication')) {
    return Messages.cache.auth();
  }
  if (code === 'ETIMEDOUT' || msg.includes('timed out') || msg.includes('timeout')) {
    return Messages.cache.timeout();
  }
  return Messages.cache.command();
}
