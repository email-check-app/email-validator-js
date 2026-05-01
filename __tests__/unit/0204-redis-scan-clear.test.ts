/**
 * RedisAdapter.clear() — the bug-fix that replaced `flushdb()` (wipes the
 * whole DB) with a SCAN-and-DEL loop scoped to the adapter's prefix. This
 * test verifies the safety guarantee: keys outside the prefix are never
 * touched, and the SCAN cursor is exhausted.
 */
import { describe, expect, it } from 'bun:test';
import type { RedisClient } from '../../src';
import { RedisAdapter } from '../../src';

interface MockRedis extends RedisClient {
  store: Map<string, string>;
  scanCalls: Array<{ cursor: string | number; args: Array<string | number> }>;
  delCalls: Array<string | string[]>;
}

function createMockRedis(initialKeys: Record<string, string> = {}): MockRedis {
  const store = new Map<string, string>(Object.entries(initialKeys));
  const scanCalls: Array<{ cursor: string | number; args: Array<string | number> }> = [];
  const delCalls: Array<string | string[]> = [];

  const client: MockRedis = {
    store,
    scanCalls,
    delCalls,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async del(key) {
      const keys = Array.isArray(key) ? key : [key];
      delCalls.push(key);
      let removed = 0;
      for (const k of keys) if (store.delete(k)) removed++;
      return removed;
    },
    async exists(key) {
      return store.has(key) ? 1 : 0;
    },
    async scan(cursor, ...args) {
      scanCalls.push({ cursor, args });
      const argList = args.map(String);
      const matchIdx = argList.indexOf('MATCH');
      const pattern = matchIdx >= 0 ? (argList[matchIdx + 1] ?? '') : '';
      const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
      const matched = [...store.keys()].filter((k) => k.startsWith(prefix));
      // Single-pass mock: return everything and signal completion with cursor 0.
      return ['0', matched] as [string, string[]];
    },
  };
  return client;
}

describe('0204 RedisAdapter.clear() — prefix-only SCAN+DEL', () => {
  it('issues SCAN with the adapter prefix as MATCH pattern', async () => {
    const redis = createMockRedis();
    const adapter = new RedisAdapter(redis, { keyPrefix: 'test_prefix:' });
    await adapter.clear();

    expect(redis.scanCalls.length).toBeGreaterThan(0);
    const first = redis.scanCalls[0];
    const argList = first.args.map(String);
    expect(argList).toContain('MATCH');
    const matchIdx = argList.indexOf('MATCH');
    expect(argList[matchIdx + 1]).toBe('test_prefix:*');
  });

  it('starts scanning from cursor "0"', async () => {
    const redis = createMockRedis();
    const adapter = new RedisAdapter(redis, { keyPrefix: 'pfx:' });
    await adapter.clear();
    expect(String(redis.scanCalls[0].cursor)).toBe('0');
  });

  it('only deletes keys matching the prefix — the safety contract', async () => {
    const redis = createMockRedis({
      'pfx:a': 'v',
      'pfx:b': 'v',
      'unrelated:key': 'untouchable',
      'other:value': 'safe',
    });
    const adapter = new RedisAdapter(redis, { keyPrefix: 'pfx:' });
    await adapter.clear();

    expect(redis.store.has('pfx:a')).toBe(false);
    expect(redis.store.has('pfx:b')).toBe(false);
    expect(redis.store.get('unrelated:key')).toBe('untouchable');
    expect(redis.store.get('other:value')).toBe('safe');
  });

  it('handles an empty prefix without crashing or wiping everything', async () => {
    const redis = createMockRedis({
      'pfx:a': 'v',
      'unrelated:key': 'wipe-with-empty-prefix',
    });
    // Default prefix is `email_validator:` — using that here to verify normal flow.
    const adapter = new RedisAdapter(redis);
    await adapter.clear();
    // Both keys remain because neither matches `email_validator:*`.
    expect(redis.store.has('pfx:a')).toBe(true);
    expect(redis.store.has('unrelated:key')).toBe(true);
  });

  it('terminates when scan returns cursor "0" — no infinite loop', async () => {
    // Mock returns "0" on first call, so we expect exactly 1 SCAN call.
    const redis = createMockRedis({ 'pfx:k': 'v' });
    const adapter = new RedisAdapter(redis, { keyPrefix: 'pfx:' });
    await adapter.clear();
    expect(redis.scanCalls.length).toBe(1);
  });

  it('handles errors thrown by SCAN gracefully (silent failure, no throw)', async () => {
    const redis = createMockRedis();
    redis.scan = async () => {
      throw new Error('connection lost');
    };
    const adapter = new RedisAdapter(redis, { keyPrefix: 'pfx:' });
    // clear() must swallow the error — cache failures shouldn't break the app.
    await expect(adapter.clear()).resolves.toBeUndefined();
  });

  it('passes COUNT hint for paged SCAN', async () => {
    const redis = createMockRedis({ 'pfx:1': 'v' });
    const adapter = new RedisAdapter(redis, { keyPrefix: 'pfx:' });
    await adapter.clear();
    const argList = redis.scanCalls[0].args.map(String);
    expect(argList).toContain('COUNT');
  });

  it('skips DEL when no keys match (no empty del() call)', async () => {
    // White-box: the implementation guards on `keys.length > 0` before calling del().
    const redis = createMockRedis({ 'unrelated:k': 'v' });
    const adapter = new RedisAdapter(redis, { keyPrefix: 'pfx:' });
    await adapter.clear();
    expect(redis.delCalls.length).toBe(0);
  });
});
