import { createClient } from 'redis';
import { loadConfig } from '../config.js';
import { getLogger } from '../utils/logger.js';

export type RedisLike = ReturnType<typeof createClient>;

let client: RedisLike | undefined;
let connectPromise: Promise<RedisLike> | undefined;

export function getRedis(): Promise<RedisLike> {
  if (connectPromise) return connectPromise;
  const cfg = loadConfig();
  const raw = createClient({ url: cfg.REDIS_URL });
  raw.on('error', (err: unknown) => {
    getLogger().error('redis error', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
  connectPromise = raw.connect().then(() => {
    client = raw;
    return raw;
  });
  connectPromise.catch(() => {
    connectPromise = undefined;
  });
  return connectPromise;
}

export async function disconnectRedis(): Promise<void> {
  const c = client;
  client = undefined;
  connectPromise = undefined;
  if (!c) return;
  try {
    await c.quit();
  } catch {
    // best-effort
  }
}

export function resetRedisForTests(): void {
  client = undefined;
  connectPromise = undefined;
}
