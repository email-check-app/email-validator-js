import { LRUAdapter } from './adapters/lru-adapter';
import { type IRedisClient, RedisAdapter } from './adapters/redis-adapter';
import type { CacheConfig, ICache, ICacheStore } from './cache-interface';
import { DEFAULT_CACHE_SIZE, DEFAULT_CACHE_TTL } from './cache-interface';

/**
 * Cache factory object to create cache instances with different backends
 */
export const CacheFactory = {
  /**
   * Create a cache with LRU (tiny-lru) backend
   */
  createLRUCache(customTtl?: Partial<typeof DEFAULT_CACHE_TTL>): ICache {
    return {
      mx: new LRUAdapter(DEFAULT_CACHE_SIZE.mx, customTtl?.mx ?? DEFAULT_CACHE_TTL.mx),
      disposable: new LRUAdapter(DEFAULT_CACHE_SIZE.disposable, customTtl?.disposable ?? DEFAULT_CACHE_TTL.disposable),
      free: new LRUAdapter(DEFAULT_CACHE_SIZE.free, customTtl?.free ?? DEFAULT_CACHE_TTL.free),
      domainValid: new LRUAdapter(
        DEFAULT_CACHE_SIZE.domainValid,
        customTtl?.domainValid ?? DEFAULT_CACHE_TTL.domainValid
      ),
      smtp: new LRUAdapter(DEFAULT_CACHE_SIZE.smtp, customTtl?.smtp ?? DEFAULT_CACHE_TTL.smtp),
      domainSuggestion: new LRUAdapter(
        DEFAULT_CACHE_SIZE.domainSuggestion,
        customTtl?.domainSuggestion ?? DEFAULT_CACHE_TTL.domainSuggestion
      ),
      whois: new LRUAdapter(DEFAULT_CACHE_SIZE.whois, customTtl?.whois ?? DEFAULT_CACHE_TTL.whois),
    };
  },

  /**
   * Create a cache with Redis backend
   */
  createRedisCache(
    redis: IRedisClient,
    options?: {
      keyPrefix?: string;
      customTtl?: Partial<typeof DEFAULT_CACHE_TTL>;
      jsonSerializer?: {
        stringify: (value: any) => string;
        parse: (value: string) => any;
      };
    }
  ): ICache {
    const { keyPrefix = 'email_validator:', customTtl, jsonSerializer } = options ?? {};

    return {
      mx: new RedisAdapter(redis, {
        keyPrefix: `${keyPrefix}mx:`,
        defaultTtlMs: customTtl?.mx ?? DEFAULT_CACHE_TTL.mx,
        jsonSerializer,
      }),
      disposable: new RedisAdapter(redis, {
        keyPrefix: `${keyPrefix}disposable:`,
        defaultTtlMs: customTtl?.disposable ?? DEFAULT_CACHE_TTL.disposable,
        jsonSerializer,
      }),
      free: new RedisAdapter(redis, {
        keyPrefix: `${keyPrefix}free:`,
        defaultTtlMs: customTtl?.free ?? DEFAULT_CACHE_TTL.free,
        jsonSerializer,
      }),
      domainValid: new RedisAdapter(redis, {
        keyPrefix: `${keyPrefix}domain_valid:`,
        defaultTtlMs: customTtl?.domainValid ?? DEFAULT_CACHE_TTL.domainValid,
        jsonSerializer,
      }),
      smtp: new RedisAdapter(redis, {
        keyPrefix: `${keyPrefix}smtp:`,
        defaultTtlMs: customTtl?.smtp ?? DEFAULT_CACHE_TTL.smtp,
        jsonSerializer,
      }),
      domainSuggestion: new RedisAdapter(redis, {
        keyPrefix: `${keyPrefix}domain_suggestion:`,
        defaultTtlMs: customTtl?.domainSuggestion ?? DEFAULT_CACHE_TTL.domainSuggestion,
        jsonSerializer,
      }),
      whois: new RedisAdapter(redis, {
        keyPrefix: `${keyPrefix}whois:`,
        defaultTtlMs: customTtl?.whois ?? DEFAULT_CACHE_TTL.whois,
        jsonSerializer,
      }),
    };
  },

  /**
   * Create a cache with custom backend
   */
  createCustomCache(
    storeFactory: (cacheType: keyof typeof DEFAULT_CACHE_TTL, defaultTtl: number, defaultSize: number) => ICacheStore,
    customTtl?: Partial<typeof DEFAULT_CACHE_TTL>
  ): ICache {
    return {
      mx: storeFactory('mx', customTtl?.mx ?? DEFAULT_CACHE_TTL.mx, DEFAULT_CACHE_SIZE.mx),
      disposable: storeFactory(
        'disposable',
        customTtl?.disposable ?? DEFAULT_CACHE_TTL.disposable,
        DEFAULT_CACHE_SIZE.disposable
      ),
      free: storeFactory('free', customTtl?.free ?? DEFAULT_CACHE_TTL.free, DEFAULT_CACHE_SIZE.free),
      domainValid: storeFactory(
        'domainValid',
        customTtl?.domainValid ?? DEFAULT_CACHE_TTL.domainValid,
        DEFAULT_CACHE_SIZE.domainValid
      ),
      smtp: storeFactory('smtp', customTtl?.smtp ?? DEFAULT_CACHE_TTL.smtp, DEFAULT_CACHE_SIZE.smtp),
      domainSuggestion: storeFactory(
        'domainSuggestion',
        customTtl?.domainSuggestion ?? DEFAULT_CACHE_TTL.domainSuggestion,
        DEFAULT_CACHE_SIZE.domainSuggestion
      ),
      whois: storeFactory('whois', customTtl?.whois ?? DEFAULT_CACHE_TTL.whois, DEFAULT_CACHE_SIZE.whois),
    };
  },

  /**
   * Create a mixed cache with different backends for different cache types
   */
  createMixedCache(config: {
    mx?: CacheConfig;
    disposable?: CacheConfig;
    free?: CacheConfig;
    domainValid?: CacheConfig;
    smtp?: CacheConfig;
    domainSuggestion?: CacheConfig;
    whois?: CacheConfig;
  }): ICache {
    const createCache = (cacheType: keyof typeof DEFAULT_CACHE_TTL, config?: CacheConfig): ICacheStore => {
      if (config?.store) {
        return config.store;
      }

      const ttlMs = config?.ttlMs ?? DEFAULT_CACHE_TTL[cacheType];
      const maxSize = config?.maxSize ?? DEFAULT_CACHE_SIZE[cacheType];

      // Check if it's a Redis-like store
      if (config?.store && 'get' in config.store && 'set' in config.store) {
        return config.store;
      }

      // Default to LRU
      return new LRUAdapter(maxSize, ttlMs);
    };

    return {
      mx: createCache('mx', config.mx),
      disposable: createCache('disposable', config.disposable),
      free: createCache('free', config.free),
      domainValid: createCache('domainValid', config.domainValid),
      smtp: createCache('smtp', config.smtp),
      domainSuggestion: createCache('domainSuggestion', config.domainSuggestion),
      whois: createCache('whois', config.whois),
    };
  },
};
