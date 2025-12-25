// 0029: Redis Adapter Tests
//
// Tests for Redis adapter implementation

import type { IRedisClient } from '../src/adapters/redis-adapter';
import { RedisAdapter } from '../src/adapters/redis-adapter';

describe('0029: RedisAdapter', () => {
  // Mock Redis client
  const createMockRedis = (): IRedisClient => {
    const store = new Map<string, string>();

    return {
      get: async (key: string) => {
        const value = store.get(key);
        return value === undefined ? null : value;
      },
      set: async (key: string, value: string, mode?: string, duration?: number) => {
        store.set(key, value);
        if (duration) {
          // Simulate expiration (in a real test, you'd use setTimeout)
          setTimeout(() => {
            store.delete(key);
          }, duration * 1000);
        }
        return 'OK';
      },
      del: async (key: string) => {
        return store.delete(key) ? 1 : 0;
      },
      exists: async (key: string) => {
        return store.has(key) ? 1 : 0;
      },
      flushdb: async () => {
        store.clear();
        return 'OK';
      },
    };
  };

  describe('Basic Operations', () => {
    it('should store and retrieve values', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      expect(await adapter.get('key1')).toBeNull();

      await adapter.set('key1', 'value1');
      expect(await adapter.get('key1')).toBe('value1');

      await adapter.delete('key1');
      expect(await adapter.get('key1')).toBeNull();
    });

    it('should check key existence', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      expect(await adapter.has('key1')).toBe(false);

      await adapter.set('key1', 'value1');
      expect(await adapter.has('key1')).toBe(true);

      await adapter.delete('key1');
      expect(await adapter.has('key1')).toBe(false);
    });

    it('should clear all keys', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      expect(await adapter.has('key1')).toBe(true);
      expect(await adapter.has('key2')).toBe(true);

      await adapter.clear();
      expect(await adapter.has('key1')).toBe(false);
      expect(await adapter.has('key2')).toBe(false);
    });
  });

  describe('Key Prefixing', () => {
    it('should prefix keys with custom prefix', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis, {
        keyPrefix: 'test_prefix:',
      });

      await adapter.set('mykey', 'myvalue');

      // The underlying Redis should have the prefixed key
      expect(await mockRedis.exists('test_prefix:mykey')).toBe(1);
      expect(await mockRedis.exists('mykey')).toBe(0);
    });

    it('should use default prefix when none provided', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      await adapter.set('mykey', 'myvalue');

      // Should use default prefix
      expect(await mockRedis.exists('email_validator:mykey')).toBe(1);
      expect(await mockRedis.exists('mykey')).toBe(0);
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize and deserialize complex objects', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      const complexObject = {
        string: 'value',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: { key: 'value' },
      };

      await adapter.set('complex', complexObject);
      const retrieved = await adapter.get('complex');

      expect(retrieved).toEqual(complexObject);
    });

    it('should handle Date objects correctly', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      const date = new Date('2023-01-01T00:00:00Z');
      const objectWithDate = { createdAt: date };

      await adapter.set('withDate', objectWithDate);
      const retrieved = await adapter.get('withDate');

      // Date objects should be correctly serialized and deserialized
      expect(retrieved).toEqual(objectWithDate);
      expect(typeof retrieved).toBe('object');
      expect(retrieved).toHaveProperty('createdAt');
      expect((retrieved as any)?.createdAt).toBeInstanceOf(Date);
    });

    it('should handle null and undefined values', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      const objectWithNulls: {
        value: null;
        missing: undefined;
        present: string;
      } = {
        value: null,
        missing: undefined,
        present: 'value',
      };

      await adapter.set('nulls', objectWithNulls);
      const retrieved = await adapter.get('nulls');

      expect(retrieved).toEqual({
        value: null,
        missing: undefined,
        present: 'value',
      });
    });
  });

  describe('TTL Configuration', () => {
    it('should use provided TTL for set operations', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      // Set with custom TTL (we can't easily test expiration in unit tests)
      // but we can verify it doesn't throw
      await adapter.set('key', 'value', 60000); // 60 seconds

      expect(await adapter.get('key')).toBe('value');
    });

    it('should use default TTL when none provided', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis, {
        defaultTtlMs: 5000, // 5 seconds
      });

      await adapter.set('key', 'value');
      expect(await adapter.get('key')).toBe('value');
    });
  });

  describe('Custom JSON Serializer', () => {
    it('should use custom JSON serializer when provided', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis, {
        jsonSerializer: {
          stringify: (value) => {
            // Custom serialization that adds a wrapper
            return JSON.stringify({ _wrapped: true, _data: value });
          },
          parse: (value) => {
            // Custom deserialization that removes the wrapper
            const parsed = JSON.parse(value);
            return parsed._wrapped ? parsed._data : parsed;
          },
        },
      });

      const testData = { key: 'value' };
      await adapter.set('custom', testData);

      // Should correctly deserialize using custom parser
      const retrieved = await adapter.get('custom');
      expect(retrieved).toEqual(testData);

      // The raw value in Redis should be wrapped
      const rawValue = await mockRedis.get('email_validator:custom');
      const parsedRaw = JSON.parse(rawValue!);
      expect(parsedRaw._wrapped).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis get errors', async () => {
      const mockRedis = {
        get: async () => {
          throw new Error('Redis connection error');
        },
        set: async () => 'OK',
        del: async () => 0,
        exists: async () => 0,
        flushdb: async () => 'OK',
      };

      const adapter = new RedisAdapter(mockRedis);

      // Should return null on error
      expect(await adapter.get('key')).toBeNull();
    });

    it('should handle Redis set errors gracefully', async () => {
      const mockRedis = {
        get: async (): Promise<any> => null,
        set: async () => {
          throw new Error('Redis write error');
        },
        del: async () => 0,
        exists: async () => 0,
        flushdb: async () => 'OK',
      };

      const adapter = new RedisAdapter(mockRedis);

      // Should not throw on set error
      await expect(adapter.set('key', 'value')).resolves.not.toThrow();
    });

    it('should handle Redis delete errors', async () => {
      const mockRedis = {
        get: async (): Promise<any> => null,
        set: async () => 'OK',
        del: async () => {
          throw new Error('Redis delete error');
        },
        exists: async () => 0,
        flushdb: async () => 'OK',
      };

      const adapter = new RedisAdapter(mockRedis);

      // Should return false on error
      expect(await adapter.delete('key')).toBe(false);
    });

    it('should handle Redis exists errors', async () => {
      const mockRedis = {
        get: async (): Promise<any> => null,
        set: async () => 'OK',
        del: async () => 0,
        exists: async () => {
          throw new Error('Redis exists error');
        },
        flushdb: async () => 'OK',
      };

      const adapter = new RedisAdapter(mockRedis);

      // Should return false on error
      expect(await adapter.has('key')).toBe(false);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type information', async () => {
      const mockRedis = createMockRedis();

      // Test with specific type
      const stringAdapter = new RedisAdapter<string>(mockRedis);
      await stringAdapter.set('string', 'value');
      const stringValue = await stringAdapter.get('string');
      expect(typeof stringValue).toBe('string');

      // Test with array type
      const arrayAdapter = new RedisAdapter<string[]>(mockRedis);
      const testArray = ['a', 'b', 'c'];
      await arrayAdapter.set('array', testArray);
      const arrayValue = await arrayAdapter.get('array');
      expect(Array.isArray(arrayValue)).toBe(true);
      expect(arrayValue).toEqual(testArray);
    });
  });
});
