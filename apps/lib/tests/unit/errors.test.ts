import { describe, test, expect } from 'bun:test';
import { Messages, EmailConfigError } from '../../src/errors.js';

describe('Messages catalog', () => {
  describe('validation', () => {
    test('projectIdRequired', () => {
      expect(Messages.validation.projectIdRequired()).toBe('projectId is required');
    });
    test('projectIdNotPositive', () => {
      expect(Messages.validation.projectIdNotPositive()).toBe(
        'projectId must be a positive integer',
      );
    });
    test('toRequired', () => {
      expect(Messages.validation.toRequired()).toBe('to is required');
    });
    test('toInvalid', () => {
      expect(Messages.validation.toInvalid()).toBe('to must be a valid email address');
    });
    test('toTooLong', () => {
      expect(Messages.validation.toTooLong()).toBe('to must be at most 510 characters');
    });
    test('subjectRequired', () => {
      expect(Messages.validation.subjectRequired()).toBe('subject is required');
    });
    test('subjectTooLong', () => {
      expect(Messages.validation.subjectTooLong()).toBe(
        'subject must be at most 510 characters',
      );
    });
    test('messageRequired', () => {
      expect(Messages.validation.messageRequired()).toBe('message is required');
    });
    test('messageTooLarge', () => {
      expect(Messages.validation.messageTooLarge()).toBe('message must be at most 1 MB');
    });
  });

  test('rateLimit interpolates the active limit', () => {
    expect(Messages.rateLimit(60)).toBe('rate limit exceeded: 60 sends per minute per project');
    expect(Messages.rateLimit(200)).toBe('rate limit exceeded: 200 sends per minute per project');
  });

  describe('persistence', () => {
    test('P1001', () => expect(Messages.persistence.P1001()).toBe('cannot reach the LeadLovers database'));
    test('P1002', () => expect(Messages.persistence.P1002()).toBe('database connection timed out while connecting'));
    test('P1008', () => expect(Messages.persistence.P1008()).toBe('database operation timed out'));
    test('P1017', () => expect(Messages.persistence.P1017()).toBe('database closed the connection'));
    test('P2002', () => expect(Messages.persistence.P2002()).toBe('database unique constraint violation'));
    test('P2003', () =>
      expect(Messages.persistence.P2003()).toBe(
        'database foreign key constraint violation (likely invalid projectId)',
      ));
    test('P2024', () => expect(Messages.persistence.P2024()).toBe('database connection pool exhausted'));
    test('fallback interpolates the Prisma code', () => {
      expect(Messages.persistence.fallback('P9999')).toBe('database error (Prisma P9999)');
    });
  });

  describe('cache', () => {
    test('refused', () => expect(Messages.cache.refused()).toBe('cannot connect to Redis'));
    test('auth', () => expect(Messages.cache.auth()).toBe('Redis authentication failed'));
    test('timeout', () => expect(Messages.cache.timeout()).toBe('Redis operation timed out'));
    test('command', () => expect(Messages.cache.command()).toBe('Redis command failed'));
  });

  describe('config', () => {
    test('dbMissing', () => expect(Messages.config.dbMissing()).toBe('missing required env var DATABASE_URL'));
    test('dbInvalid interpolates reason', () =>
      expect(Messages.config.dbInvalid('bad url')).toBe('invalid DATABASE_URL: bad url'));
    test('redisMissing', () => expect(Messages.config.redisMissing()).toBe('missing required env var REDIS_URL'));
    test('redisInvalid interpolates reason', () =>
      expect(Messages.config.redisInvalid('refused')).toBe('invalid REDIS_URL: refused'));
  });
});

describe('EmailConfigError', () => {
  test('is an Error subclass with name EmailConfigError', () => {
    const e = new EmailConfigError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(EmailConfigError);
    expect(e.name).toBe('EmailConfigError');
    expect(e.message).toBe('boom');
  });
});
