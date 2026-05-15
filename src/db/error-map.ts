import { Messages } from '../errors.js';

interface PrismaLikeError {
  code?: string;
  message?: string;
}

export function mapPrismaError(err: unknown): string {
  const code = (err as PrismaLikeError | null | undefined)?.code;
  if (!code) {
    return err instanceof Error ? err.message : 'unknown database error';
  }
  switch (code) {
    case 'P1001':
      return Messages.persistence.P1001();
    case 'P1002':
      return Messages.persistence.P1002();
    case 'P1008':
      return Messages.persistence.P1008();
    case 'P1017':
      return Messages.persistence.P1017();
    case 'P2002':
      return Messages.persistence.P2002();
    case 'P2003':
      return Messages.persistence.P2003();
    case 'P2024':
      return Messages.persistence.P2024();
    default:
      return Messages.persistence.fallback(code);
  }
}
