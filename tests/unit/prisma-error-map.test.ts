import { describe, test, expect } from 'bun:test';
import { mapPrismaError } from '../../src/db/error-map.js';

describe('mapPrismaError', () => {
  test('P1001 → cannot reach the LeadLovers database', () => {
    expect(mapPrismaError({ code: 'P1001' })).toBe('cannot reach the LeadLovers database');
  });
  test('P1002 → database connection timed out while connecting', () => {
    expect(mapPrismaError({ code: 'P1002' })).toBe('database connection timed out while connecting');
  });
  test('P1008 → database operation timed out', () => {
    expect(mapPrismaError({ code: 'P1008' })).toBe('database operation timed out');
  });
  test('P1017 → database closed the connection', () => {
    expect(mapPrismaError({ code: 'P1017' })).toBe('database closed the connection');
  });
  test('P2002 → database unique constraint violation', () => {
    expect(mapPrismaError({ code: 'P2002' })).toBe('database unique constraint violation');
  });
  test('P2003 → database foreign key constraint violation (likely invalid projectId)', () => {
    expect(mapPrismaError({ code: 'P2003' })).toBe(
      'database foreign key constraint violation (likely invalid projectId)',
    );
  });
  test('P2024 → database connection pool exhausted', () => {
    expect(mapPrismaError({ code: 'P2024' })).toBe('database connection pool exhausted');
  });
  test('unknown Prisma code → fallback with code interpolated', () => {
    expect(mapPrismaError({ code: 'P9999' })).toBe('database error (Prisma P9999)');
  });
  test('non-Prisma Error → returns its message', () => {
    expect(mapPrismaError(new Error('boom'))).toBe('boom');
  });
  test('non-Error value → unknown database error', () => {
    expect(mapPrismaError('weird')).toBe('unknown database error');
  });
  test('null → unknown database error', () => {
    expect(mapPrismaError(null)).toBe('unknown database error');
  });
});
