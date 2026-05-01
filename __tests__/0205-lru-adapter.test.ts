/**
 * LRUAdapter contract tests. The behavior under test is the wrapper around
 * `tiny-lru`, including the documented limitations:
 *   - per-entry ttlMs is silently ignored (tiny-lru limitation)
 *   - get() returns null (not undefined) for misses to match CacheStore contract
 */
import { describe, expect, it } from 'bun:test';
import { LRUAdapter } from '../src';

describe('0205 LRUAdapter — basic contract', () => {
  it('get() returns null for missing keys', async () => {
    const cache = new LRUAdapter<string>();
    expect(cache.get('missing')).toBeNull();
  });

  it('returns the value after set()', async () => {
    const cache = new LRUAdapter<string>();
    await cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });

  it('size() reflects entry count', async () => {
    const cache = new LRUAdapter<string>();
    expect(cache.size()).toBe(0);
    await cache.set('a', '1');
    await cache.set('b', '2');
    expect(cache.size()).toBe(2);
  });

  it('has() reports presence correctly', async () => {
    const cache = new LRUAdapter<string>();
    await cache.set('k', 'v');
    expect(await cache.has('k')).toBe(true);
    expect(await cache.has('missing')).toBe(false);
  });

  it('delete() removes the key', async () => {
    const cache = new LRUAdapter<string>();
    await cache.set('k', 'v');
    await cache.delete('k');
    expect(cache.get('k')).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it('clear() empties the cache', async () => {
    const cache = new LRUAdapter<string>();
    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeNull();
  });
});

describe('0205 LRUAdapter — silently ignored ttlMs', () => {
  it('accepts an explicit ttlMs argument without throwing', async () => {
    // Documented limitation: tiny-lru does not support per-entry TTL, so the
    // ttlMs argument is intentionally dropped on the floor. This test pins
    // down the contract — callers can pass it without crashing.
    const cache = new LRUAdapter<string>(10, 60_000);
    await expect(cache.set('k', 'v', 5_000)).resolves.toBeUndefined();
    expect(cache.get('k')).toBe('v');
  });
});

describe('0205 LRUAdapter — eviction', () => {
  it('drops the oldest entry when max size is exceeded', async () => {
    // tiny-lru evicts oldest on overflow; verify we observe that through the adapter.
    const cache = new LRUAdapter<string>(3, 60_000);
    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.set('c', '3');
    expect(cache.size()).toBe(3);
    await cache.set('d', '4');
    // Adapter must hold at most max entries; the oldest goes first.
    expect(cache.size()).toBeLessThanOrEqual(3);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe('4');
  });

  it('does not double-count when re-setting an existing key', async () => {
    // Regression guard: re-setting must overwrite in place, not grow the cache.
    const cache = new LRUAdapter<string>(3, 60_000);
    await cache.set('k', 'v1');
    await cache.set('k', 'v2');
    await cache.set('k', 'v3');
    expect(cache.size()).toBe(1);
    expect(cache.get('k')).toBe('v3');
  });
});
