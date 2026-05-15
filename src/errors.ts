export const Messages = {
  validation: {
    projectIdRequired: (): string => 'projectId is required',
    projectIdNotPositive: (): string => 'projectId must be a positive integer',
    toRequired: (): string => 'to is required',
    toInvalid: (): string => 'to must be a valid email address',
    toTooLong: (): string => 'to must be at most 510 characters',
    subjectRequired: (): string => 'subject is required',
    subjectTooLong: (): string => 'subject must be at most 510 characters',
    messageRequired: (): string => 'message is required',
    messageTooLarge: (): string => 'message must be at most 1 MB',
  },
  rateLimit: (limit: number): string =>
    `rate limit exceeded: ${limit} sends per minute per project`,
  persistence: {
    P1001: (): string => 'cannot reach the LeadLovers database',
    P1002: (): string => 'database connection timed out while connecting',
    P1008: (): string => 'database operation timed out',
    P1017: (): string => 'database closed the connection',
    P2002: (): string => 'database unique constraint violation',
    P2003: (): string =>
      'database foreign key constraint violation (likely invalid projectId)',
    P2024: (): string => 'database connection pool exhausted',
    fallback: (code: string): string => `database error (Prisma ${code})`,
  },
  cache: {
    refused: (): string => 'cannot connect to Redis',
    auth: (): string => 'Redis authentication failed',
    timeout: (): string => 'Redis operation timed out',
    command: (): string => 'Redis command failed',
  },
  config: {
    dbMissing: (): string => 'missing required env var DATABASE_URL',
    dbInvalid: (reason: string): string => `invalid DATABASE_URL: ${reason}`,
    redisMissing: (): string => 'missing required env var REDIS_URL',
    redisInvalid: (reason: string): string => `invalid REDIS_URL: ${reason}`,
    rateLimitNotPositive: (): string =>
      'SES_RATE_LIMIT_PER_MINUTE must be a positive integer',
  },
} as const;

export class EmailConfigError extends Error {
  override readonly name = 'EmailConfigError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, EmailConfigError.prototype);
  }
}
