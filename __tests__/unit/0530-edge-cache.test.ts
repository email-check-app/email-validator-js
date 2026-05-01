/**
 * Direct tests for `EdgeCache` — the per-isolate LRU/TTL used by the
 * serverless verifier. The previous implementation evicted entries one-at-a-
 * time on every set above max; the refactor batches the eviction (drops ~10%
 * in one pass). These tests pin down both the size cap and the TTL behavior.
 */
import { describe, expect, it } from 'bun:test';
import { EdgeCache } from '../../src/serverless/verifier';

describe('0530 EdgeCache', () => {
  it('returns undefined for missing keys', () => {
    const cache = new EdgeCache<string>();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns the value for a set key', () => {
    const cache = new EdgeCache<string>();
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });

  it('reports the current size', () => {
    const cache = new EdgeCache<string>();
    expect(cache.size()).toBe(0);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size()).toBe(2);
  });

  it('clear() empties the cache', () => {
    const cache = new EdgeCache<string>();
    cache.set('a', '1');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('expires values past TTL', async () => {
    // 10ms TTL — short enough to test fast, long enough to set then check.
    const cache = new EdgeCache<string>(10, 10);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    await new Promise((r) => setTimeout(r, 25));
    expect(cache.get('k')).toBeUndefined();
  });

  it('purges expired entries when reading them', async () => {
    const cache = new EdgeCache<string>(10, 10);
    cache.set('k', 'v');
    expect(cache.size()).toBe(1);
    await new Promise((r) => setTimeout(r, 25));
    cache.get('k'); // get triggers the purge
    expect(cache.size()).toBe(0);
  });

  it('evicts ~10% of oldest entries when max size is exceeded', () => {
    const max = 10;
    const cache = new EdgeCache<string>(max, 60_000);
    for (let i = 0; i < max; i++) cache.set(`k${i}`, `v${i}`);
    expect(cache.size()).toBe(max);

    // Adding one more triggers batched eviction (drop ~max*0.1 = 1 entry).
    cache.set('overflow', 'new');
    // Size after eviction + new insert: max - drops + 1.
    // drops = max(1, floor(0.1 * max)) = 1 for max=10.
    expect(cache.size()).toBe(max);
    // Oldest entry must be gone, newest must be present.
    expect(cache.get('k0')).toBeUndefined();
    expect(cache.get('overflow')).toBe('new');
  });

  it('drops 10% in one pass for larger caches', () => {
    const max = 100;
    const cache = new EdgeCache<string>(max, 60_000);
    for (let i = 0; i < max; i++) cache.set(`k${i}`, `v${i}`);
    cache.set('overflow', 'new');
    // After eviction (drops 10 entries) + 1 insert: 100 - 10 + 1 = 91.
    expect(cache.size()).toBe(91);
    // First 10 entries gone.
    for (let i = 0; i < 10; i++) expect(cache.get(`k${i}`)).toBeUndefined();
    // Entry 10 still present.
    expect(cache.get('k10')).toBe('v10');
  });

  it('overwrites in place when re-setting an existing key', () => {
    const cache = new EdgeCache<string>(10, 60_000);
    cache.set('k', 'v1');
    cache.set('k', 'v2');
    expect(cache.size()).toBe(1);
    expect(cache.get('k')).toBe('v2');
  });
});
