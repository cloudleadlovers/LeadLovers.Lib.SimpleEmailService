import type {
  email as EmailApi,
  EmailSendInput,
  EmailSendResult,
  Logger,
} from '@leadlovers/simple-email-service';

export interface ServerDeps {
  email: typeof EmailApi;
  gatewayApiKey?: string;
  logger?: Logger;
}

export type FetchHandler = (req: Request) => Promise<Response> | Response;

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function createFetch({ email, gatewayApiKey, logger }: ServerDeps): FetchHandler {
  const log = logger ?? noopLogger;
  const requireKey = Boolean(gatewayApiKey && gatewayApiKey.length > 0);

  return async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/ready')) {
      return new Response('ok', { status: 200 });
    }

    if (req.method === 'POST' && url.pathname === '/v1/emails/send') {
      if (requireKey && req.headers.get('x-internal-key') !== gatewayApiKey) {
        log.warn('gateway auth failed', { path: url.pathname });
        return json(
          { success: false, code: 'unauthorized', error: 'invalid gateway key' },
          401,
        );
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch (err) {
        log.warn('invalid JSON body', errorMeta(err));
        return json(
          { success: false, code: 'validation_error', error: 'invalid JSON body' },
          400,
        );
      }

      let result: EmailSendResult;
      try {
        result = await email.send(body as EmailSendInput);
      } catch (err) {
        log.error('email.send threw unexpectedly', {
          ...errorMeta(err),
          input: summarizeInput(body),
        });
        return json(
          {
            success: false,
            code: 'internal_error',
            error: err instanceof Error ? err.message : String(err),
          },
          500,
        );
      }

      if (!result.success) {
        log.error('email.send failed', {
          code: result.code,
          error: result.error,
          input: summarizeInput(body),
        });
      } else {
        log.info('email.send ok', {
          id: result.id.toString(),
          deduplicated: result.deduplicated,
        });
      }
      return json(result, httpStatusFor(result));
    }

    return new Response('Not Found', { status: 404 });
  };
}

function httpStatusFor(result: EmailSendResult): number {
  if (result.success) return 200;
  switch (result.code) {
    case 'validation_error':
      return 400;
    case 'rate_limited':
      return 429;
    case 'persistence_error':
      return 502;
    case 'cache_error':
      return 503;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, bigintReplacer), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function errorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & { code?: string };
    return {
      error: err.message,
      name: err.name,
      code: e.code,
      stack: err.stack,
    };
  }
  return { error: String(err) };
}

interface InputShape {
  projectId?: unknown;
  to?: unknown;
  subject?: unknown;
}

function summarizeInput(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return { body: String(body) };
  const b = body as InputShape;
  return {
    projectId: b.projectId,
    to: typeof b.to === 'string' ? b.to : undefined,
    subject: typeof b.subject === 'string' ? b.subject : undefined,
  };
}
