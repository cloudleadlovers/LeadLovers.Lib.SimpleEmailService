import { send } from './send.js';
import { disconnectPrisma } from './prisma.js';
import { disconnectRedis } from './redis.js';
import { setLogger as setLoggerImpl, type Logger } from './logger.js';

export const email = {
  send,
  async disconnect(): Promise<void> {
    await Promise.all([disconnectPrisma(), disconnectRedis()]);
  },
  setLogger(logger: Logger): void {
    setLoggerImpl(logger);
  },
};
