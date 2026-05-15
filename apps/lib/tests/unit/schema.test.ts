import { describe, test, expect } from 'bun:test';
import { EmailSendInputSchema } from '../../src/schema.js';

function issues(input: unknown): string[] {
  const r = EmailSendInputSchema.safeParse(input);
  if (r.success) return [];
  return r.error.issues.map((i) => i.message);
}

const valid = {
  projectId: 1,
  to: 'user@example.com',
  subject: 'hi',
  message: 'body',
};

describe('EmailSendInputSchema', () => {
  test('accepts a valid payload', () => {
    const r = EmailSendInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  describe('projectId', () => {
    test('missing → projectId is required', () => {
      const { projectId, ...rest } = valid;
      void projectId;
      expect(issues(rest)).toContain('projectId is required');
    });
    test('zero → projectId must be a positive integer', () => {
      expect(issues({ ...valid, projectId: 0 })).toContain('projectId must be a positive integer');
    });
    test('negative → projectId must be a positive integer', () => {
      expect(issues({ ...valid, projectId: -5 })).toContain('projectId must be a positive integer');
    });
    test('non-integer → projectId must be a positive integer', () => {
      expect(issues({ ...valid, projectId: 1.5 })).toContain('projectId must be a positive integer');
    });
    test('string → projectId is required (type mismatch)', () => {
      expect(issues({ ...valid, projectId: 'x' })).toContain('projectId is required');
    });
  });

  describe('to', () => {
    test('missing → to is required', () => {
      const { to, ...rest } = valid;
      void to;
      expect(issues(rest)).toContain('to is required');
    });
    test('empty string → to is required', () => {
      expect(issues({ ...valid, to: '' })).toContain('to is required');
    });
    test('not an email → to must be a valid email address', () => {
      expect(issues({ ...valid, to: 'not-an-email' })).toContain('to must be a valid email address');
    });
    test('over 510 chars → to must be at most 510 characters', () => {
      const localPart = 'a'.repeat(500);
      const longEmail = `${localPart}@example.com`;
      expect(longEmail.length).toBeGreaterThan(510);
      expect(issues({ ...valid, to: longEmail })).toContain('to must be at most 510 characters');
    });
  });

  describe('subject', () => {
    test('missing → subject is required', () => {
      const { subject, ...rest } = valid;
      void subject;
      expect(issues(rest)).toContain('subject is required');
    });
    test('empty string → subject is required', () => {
      expect(issues({ ...valid, subject: '' })).toContain('subject is required');
    });
    test('over 510 chars → subject must be at most 510 characters', () => {
      expect(issues({ ...valid, subject: 'x'.repeat(511) })).toContain(
        'subject must be at most 510 characters',
      );
    });
  });

  describe('message', () => {
    test('missing → message is required', () => {
      const { message, ...rest } = valid;
      void message;
      expect(issues(rest)).toContain('message is required');
    });
    test('empty string → message is required', () => {
      expect(issues({ ...valid, message: '' })).toContain('message is required');
    });
    test('over 1 MB → message must be at most 1 MB', () => {
      expect(issues({ ...valid, message: 'a'.repeat(1024 * 1024 + 1) })).toContain(
        'message must be at most 1 MB',
      );
    });
  });
});
