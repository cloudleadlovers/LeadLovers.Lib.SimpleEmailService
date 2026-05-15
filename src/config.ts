import { z } from 'zod';
import { EmailConfigError, Messages } from './errors.js';

const DEFAULT_RATE_LIMIT = 60;

const ConfigSchema = z.object({
  DATABASE_URL: z
    .preprocess(
      (v) => (v === undefined ? '' : v),
      z.string().min(1, Messages.config.dbMissing()),
    ),
  REDIS_URL: z
    .preprocess(
      (v) => (v === undefined ? '' : v),
      z.string().min(1, Messages.config.redisMissing()),
    ),
  SES_RATE_LIMIT_PER_MINUTE: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return DEFAULT_RATE_LIMIT;
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) {
        ctx.addIssue({
          code: 'custom',
          message: Messages.config.rateLimitNotPositive(),
        });
        return z.NEVER;
      }
      return n;
    }),
});

export interface Config {
  DATABASE_URL: string;
  REDIS_URL: string;
  SES_RATE_LIMIT_PER_MINUTE: number;
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
