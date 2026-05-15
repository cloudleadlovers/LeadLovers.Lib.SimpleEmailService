import { send } from './send.js';
import { disconnectPrisma } from './db/prisma.js';
import { disconnectRedis } from './cache/redis.js';
import { setLogger as setLoggerImpl, type Logger } from './utils/logger.js';

export const email = {
  send,
  async disconnect(): Promise<void> {
    await Promise.all([disconnectPrisma(), disconnectRedis()]);
  },
  setLogger(logger: Logger): void {
    setLoggerImpl(logger);
  },
};
