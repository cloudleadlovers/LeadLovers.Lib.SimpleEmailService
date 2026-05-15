import type { email as EmailApi, EmailSendInput, EmailSendResult } from '@leadlovers/simple-email-service';

export interface ServerDeps {
  email: typeof EmailApi;
  gatewayApiKey?: string;
}

export type FetchHandler = (req: Request) => Promise<Response> | Response;

export function createFetch({ email, gatewayApiKey }: ServerDeps): FetchHandler {
  const requireKey = Boolean(gatewayApiKey && gatewayApiKey.length > 0);

  return async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/ready')) {
      return new Response('ok', { status: 200 });
    }

    if (req.method === 'POST' && url.pathname === '/v1/emails/send') {
      if (requireKey && req.headers.get('x-internal-key') !== gatewayApiKey) {
        return json(
          { success: false, code: 'unauthorized', error: 'invalid gateway key' },
          401,
        );
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json(
          { success: false, code: 'validation_error', error: 'invalid JSON body' },
          400,
        );
      }

      const result = await email.send(body as EmailSendInput);
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
