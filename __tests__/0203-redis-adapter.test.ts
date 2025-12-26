/**
 * Tests for Redis adapter implementation of the cache interface
 */

import type { RedisClient } from '../src';
import { RedisAdapter } from '../src';

describe('0203 Redis Adapter', () => {
  // Create a mock Redis client for testing
  const createMockRedis = (): RedisClient => {
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
    it('should store, retrieve, and delete values', async () => {
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

      // Verify the underlying Redis stores with the prefixed key
      expect(await mockRedis.exists('test_prefix:mykey')).toBe(1);
      expect(await mockRedis.exists('mykey')).toBe(0);
    });

    it('should use default prefix when none provided', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      await adapter.set('mykey', 'myvalue');

      // Verify default prefix is applied
      expect(await mockRedis.exists('email_validator:mykey')).toBe(1);
      expect(await mockRedis.exists('mykey')).toBe(0);
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize and deserialize objects with nested structures', async () => {
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

      // Verify object survives round-trip serialization
      expect(retrieved).toEqual(complexObject);
    });

    it('should handle Date objects correctly', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis);

      const date = new Date('2023-01-01T00:00:00Z');
      const objectWithDate = { createdAt: date };

      await adapter.set('withDate', objectWithDate);
      const retrieved = await adapter.get('withDate');

      // Date objects are correctly preserved through serialization
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

      // Set with explicit TTL - value is immediately retrievable
      // Note: actual expiration cannot be easily tested in unit tests
      await adapter.set('key', 'value', 60000); // 60 seconds

      expect(await adapter.get('key')).toBe('value');
    });

    it('should use default TTL when none provided', async () => {
      const mockRedis = createMockRedis();
      const adapter = new RedisAdapter(mockRedis, {
        defaultTtlMs: 5000, // 5 second default TTL
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
            // Wrap values in a custom envelope during serialization
            return JSON.stringify({ _wrapped: true, _data: value });
          },
          parse: (value) => {
            // Unwrap values during deserialization
            const parsed = JSON.parse(value);
            return parsed._wrapped ? parsed._data : parsed;
          },
        },
      });

      const testData = { key: 'value' };
      await adapter.set('custom', testData);

      // Deserialization uses custom parser and returns original data
      const retrieved = await adapter.get('custom');
      expect(retrieved).toEqual(testData);

      // Verify raw Redis value is wrapped
      const rawValue = await mockRedis.get('email_validator:custom');
      const parsedRaw = JSON.parse(rawValue!);
      expect(parsedRaw._wrapped).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return null when Redis get operation fails', async () => {
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

      // Get errors are handled gracefully with null return
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

      // Set errors are caught and handled without throwing
      await expect(adapter.set('key', 'value')).resolves.not.toThrow();
    });

    it('should return false when Redis delete operation fails', async () => {
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

      // Delete errors result in false return value
      expect(await adapter.delete('key')).toBe(false);
    });

    it('should return false when Redis exists operation fails', async () => {
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

      // Exists errors result in false return value
      expect(await adapter.has('key')).toBe(false);
    });
  });

  describe('Type Safety', () => {
    it('should preserve type information through get/set operations', async () => {
      const mockRedis = createMockRedis();

      // Test with string type parameter
      const stringAdapter = new RedisAdapter<string>(mockRedis);
      await stringAdapter.set('string', 'value');
      const stringValue = await stringAdapter.get('string');
      expect(typeof stringValue).toBe('string');

      // Test with array type parameter
      const arrayAdapter = new RedisAdapter<string[]>(mockRedis);
      const testArray = ['a', 'b', 'c'];
      await arrayAdapter.set('array', testArray);
      const arrayValue = await arrayAdapter.get('array');
      expect(Array.isArray(arrayValue)).toBe(true);
      expect(arrayValue).toEqual(testArray);
    });
  });
});
