import { describe, test, expect } from 'bun:test';
import type {
  email as EmailApi,
  EmailSendResult,
} from '@leadlovers/simple-email-service';
import { createFetch } from '../src/server.js';

type Behavior =
  | 'success'
  | 'dedup'
  | 'invalid'
  | 'rate'
  | 'persist'
  | 'cache';

function stubEmail(behavior: Behavior): typeof EmailApi {
  return {
    send: async (): Promise<EmailSendResult> => {
      switch (behavior) {
        case 'success':
          return {
            success: true,
            id: 42n,
            queuedAt: new Date('2026-01-01T00:00:00.000Z'),
            deduplicated: false,
          };
        case 'dedup':
          return {
            success: true,
            id: 42n,
            queuedAt: new Date('2026-01-01T00:00:00.000Z'),
            deduplicated: true,
          };
        case 'invalid':
          return { success: false, code: 'validation_error', error: 'to is required' };
        case 'rate':
          return {
            success: false,
            code: 'rate_limited',
            error: 'rate limit exceeded: 60 sends per minute per project',
            retryAfterMs: 1234,
          };
        case 'persist':
          return { success: false, code: 'persistence_error', error: 'cannot reach the LeadLovers database' };
        case 'cache':
          return { success: false, code: 'cache_error', error: 'cannot connect to Redis' };
      }
    },
    disconnect: async () => {},
    setLogger: () => {},
  };
}

function post(body: unknown, headers?: Record<string, string>): Request {
  return new Request('http://gw/v1/emails/send', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

interface ResponseBody {
  success?: boolean;
  code?: string;
  error?: string;
  id?: string;
  deduplicated?: boolean;
  retryAfterMs?: number;
}

async function jsonBody(res: Response): Promise<ResponseBody> {
  return (await res.json()) as ResponseBody;
}

describe('createFetch', () => {
  test('GET /health → 200 ok', async () => {
    const fetch = createFetch({ email: stubEmail('success') });
    const res = await fetch(new Request('http://gw/health'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  test('GET /ready → 200 ok', async () => {
    const fetch = createFetch({ email: stubEmail('success') });
    const res = await fetch(new Request('http://gw/ready'));
    expect(res.status).toBe(200);
  });

  test('POST /v1/emails/send → 200 success, bigint id serialized as string', async () => {
    const fetch = createFetch({ email: stubEmail('success') });
    const res = await fetch(post({ projectId: 1, to: 'x@y.co', subject: 's', message: 'm' }));
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.success).toBe(true);
    expect(body.id).toBe('42');
    expect(body.deduplicated).toBe(false);
  });

  test('POST /v1/emails/send → 200 with deduplicated:true', async () => {
    const fetch = createFetch({ email: stubEmail('dedup') });
    const res = await fetch(post({}));
    expect(res.status).toBe(200);
    expect((await jsonBody(res)).deduplicated).toBe(true);
  });

  test('validation_error → 400', async () => {
    const fetch = createFetch({ email: stubEmail('invalid') });
    const res = await fetch(post({}));
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.success).toBe(false);
    expect(body.code).toBe('validation_error');
  });

  test('rate_limited → 429 with retryAfterMs in body', async () => {
    const fetch = createFetch({ email: stubEmail('rate') });
    const res = await fetch(post({}));
    expect(res.status).toBe(429);
    const body = await jsonBody(res);
    expect(body.code).toBe('rate_limited');
    expect(body.retryAfterMs).toBe(1234);
  });

  test('persistence_error → 502', async () => {
    const fetch = createFetch({ email: stubEmail('persist') });
    const res = await fetch(post({}));
    expect(res.status).toBe(502);
  });

  test('cache_error → 503', async () => {
    const fetch = createFetch({ email: stubEmail('cache') });
    const res = await fetch(post({}));
    expect(res.status).toBe(503);
  });

  test('invalid JSON body → 400 validation_error', async () => {
    const fetch = createFetch({ email: stubEmail('success') });
    const res = await fetch(post('not-json'));
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.code).toBe('validation_error');
    expect(body.error).toBe('invalid JSON body');
  });

  test('unknown route → 404', async () => {
    const fetch = createFetch({ email: stubEmail('success') });
    const res = await fetch(new Request('http://gw/nope'));
    expect(res.status).toBe(404);
  });

  test('wrong method on send route → 404', async () => {
    const fetch = createFetch({ email: stubEmail('success') });
    const res = await fetch(new Request('http://gw/v1/emails/send'));
    expect(res.status).toBe(404);
  });

  describe('with gatewayApiKey set', () => {
    test('missing x-internal-key → 401', async () => {
      const fetch = createFetch({ email: stubEmail('success'), gatewayApiKey: 'secret' });
      const res = await fetch(post({}));
      expect(res.status).toBe(401);
    });

    test('wrong x-internal-key → 401', async () => {
      const fetch = createFetch({ email: stubEmail('success'), gatewayApiKey: 'secret' });
      const res = await fetch(post({}, { 'x-internal-key': 'wrong' }));
      expect(res.status).toBe(401);
    });

    test('matching x-internal-key → 200', async () => {
      const fetch = createFetch({ email: stubEmail('success'), gatewayApiKey: 'secret' });
      const res = await fetch(post({}, { 'x-internal-key': 'secret' }));
      expect(res.status).toBe(200);
    });
  });
});
