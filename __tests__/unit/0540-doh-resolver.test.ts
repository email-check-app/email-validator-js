/**
 * DoHResolver unit tests — exercises the DNS-over-HTTPS resolver with an
 * injected fetch so we don't hit a real network.
 */
import { describe, expect, it } from 'bun:test';
import { DoHResolver } from '../../src/serverless/verifier';

function fakeFetch(handler: (url: URL) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
    return handler(url);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/dns-json' } });
}

describe('0540 DoHResolver — resolveMx', () => {
  it('parses Cloudflare-style MX answers and sorts by priority', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() =>
        jsonResponse({
          Status: 0,
          Answer: [
            { name: 'example.com', type: 15, TTL: 300, data: '20 mx2.example.com.' },
            { name: 'example.com', type: 15, TTL: 300, data: '10 mx1.example.com.' },
            { name: 'example.com', type: 15, TTL: 300, data: '30 mx3.example.com.' },
          ],
        })
      ),
    });

    const records = await resolver.resolveMx('example.com');
    expect(records).toEqual([
      { priority: 10, exchange: 'mx1.example.com' },
      { priority: 20, exchange: 'mx2.example.com' },
      { priority: 30, exchange: 'mx3.example.com' },
    ]);
  });

  it('strips trailing dot from exchange', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() =>
        jsonResponse({ Status: 0, Answer: [{ name: 'x', type: 15, TTL: 1, data: '5 mail.x.com.' }] })
      ),
    });
    const records = await resolver.resolveMx('x.com');
    expect(records[0]).toEqual({ priority: 5, exchange: 'mail.x.com' });
  });

  it('handles missing exchange (no trailing dot)', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() =>
        jsonResponse({ Status: 0, Answer: [{ name: 'x', type: 15, TTL: 1, data: '10 mail.x.com' }] })
      ),
    });
    const records = await resolver.resolveMx('x.com');
    expect(records[0]?.exchange).toBe('mail.x.com');
  });

  it('returns empty array for NXDOMAIN (Status !== 0)', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() => jsonResponse({ Status: 3 })),
    });
    expect(await resolver.resolveMx('does-not-exist.example')).toEqual([]);
  });

  it('returns empty array when there are no Answer records', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() => jsonResponse({ Status: 0 })),
    });
    expect(await resolver.resolveMx('example.com')).toEqual([]);
  });

  it('returns empty array on non-OK HTTP response', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() => new Response('Server Error', { status: 500 })),
    });
    expect(await resolver.resolveMx('example.com')).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    const resolver = new DoHResolver({
      fetch: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(await resolver.resolveMx('example.com')).toEqual([]);
  });

  it('skips malformed MX answer rows but keeps valid ones', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() =>
        jsonResponse({
          Status: 0,
          Answer: [
            { name: 'x', type: 15, TTL: 1, data: 'totally bogus' },
            { name: 'x', type: 15, TTL: 1, data: '10 mail.x.com.' },
          ],
        })
      ),
    });
    const records = await resolver.resolveMx('x.com');
    expect(records).toEqual([{ priority: 10, exchange: 'mail.x.com' }]);
  });

  it('uses the configured endpoint', async () => {
    const captured: { url?: URL } = {};
    const resolver = new DoHResolver({
      endpoint: 'https://dns.google/resolve',
      fetch: fakeFetch((url) => {
        captured.url = url;
        return jsonResponse({ Status: 0, Answer: [] });
      }),
    });
    await resolver.resolveMx('example.com');
    expect(captured.url?.origin).toBe('https://dns.google');
    expect(captured.url?.pathname).toBe('/resolve');
    expect(captured.url?.searchParams.get('name')).toBe('example.com');
    expect(captured.url?.searchParams.get('type')).toBe('15');
  });
});

describe('0540 DoHResolver — resolveTxt', () => {
  it('strips quotes around TXT data', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() =>
        jsonResponse({
          Status: 0,
          Answer: [
            { name: 'x', type: 16, TTL: 1, data: '"v=spf1 include:_spf.google.com ~all"' },
            { name: 'x', type: 16, TTL: 1, data: '"verification=abc123"' },
          ],
        })
      ),
    });
    const records = await resolver.resolveTxt('x.com');
    expect(records).toEqual(['v=spf1 include:_spf.google.com ~all', 'verification=abc123']);
  });

  it('returns empty array for unanswered query', async () => {
    const resolver = new DoHResolver({
      fetch: fakeFetch(() => jsonResponse({ Status: 0 })),
    });
    expect(await resolver.resolveTxt('example.com')).toEqual([]);
  });
});

describe('0540 DoHResolver — timeouts', () => {
  it('aborts the request after timeoutMs', async () => {
    const resolver = new DoHResolver({
      timeoutMs: 50,
      fetch: ((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        })) as unknown as typeof fetch,
    });
    const start = Date.now();
    const result = await resolver.resolveMx('example.com');
    const duration = Date.now() - start;
    expect(result).toEqual([]);
    expect(duration).toBeGreaterThanOrEqual(40);
    expect(duration).toBeLessThan(500);
  });
});
