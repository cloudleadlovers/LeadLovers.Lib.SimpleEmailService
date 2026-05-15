import { z } from 'zod';
import { EmailConfigError, Messages } from './errors.js';

const ConfigSchema = z.object({
  DATABASE_URL: z.preprocess(
    (v) => (v === undefined ? '' : v),
    z.string().min(1, Messages.config.dbMissing()),
  ),
  REDIS_URL: z.preprocess(
    (v) => (v === undefined ? '' : v),
    z.string().min(1, Messages.config.redisMissing()),
  ),
});

export interface Config {
  DATABASE_URL: string;
  REDIS_URL: string;
}

let cached: Config | undefined;

export function loadConfig(): Config {
  if (cached) return cached;
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new EmailConfigError(first?.message ?? 'invalid configuration');
  }
  cached = result.data;
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
