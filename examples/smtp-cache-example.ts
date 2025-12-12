// Example of using custom cache with SMTP verification

import { getDefaultCache } from '../src/cache';
import { verifyMailboxSMTP } from '../src/smtp';
import type { ICache } from '../src/types';

// Example custom cache implementation
class CustomMemoryCache implements ICache {
  private stores = new Map<string, Map<string, any>>();

  private getStore(name: string): Map<string, any> {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }
    return this.stores.get(name)!;
  }

  // Cache stores
  mx = {
    get: (key: string) => Promise.resolve(this.getStore('mx').get(key)),
    set: (key: string, value: string[]) => {
      this.getStore('mx').set(key, value);
    },
    delete: (key: string) => this.getStore('mx').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('mx').has(key)),
    clear: () => this.getStore('mx').clear(),
    size: () => this.getStore('mx').size,
  };

  disposable = {
    get: (key: string) => Promise.resolve(this.getStore('disposable').get(key)),
    set: (key: string, value: boolean) => {
      this.getStore('disposable').set(key, value);
    },
    delete: (key: string) => this.getStore('disposable').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('disposable').has(key)),
    clear: () => this.getStore('disposable').clear(),
    size: () => this.getStore('disposable').size,
  };

  free = {
    get: (key: string) => Promise.resolve(this.getStore('free').get(key)),
    set: (key: string, value: boolean) => {
      this.getStore('free').set(key, value);
    },
    delete: (key: string) => this.getStore('free').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('free').has(key)),
    clear: () => this.getStore('free').clear(),
    size: () => this.getStore('free').size,
  };

  domainValid = {
    get: (key: string) => Promise.resolve(this.getStore('domainValid').get(key)),
    set: (key: string, value: boolean) => {
      this.getStore('domainValid').set(key, value);
    },
    delete: (key: string) => this.getStore('domainValid').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('domainValid').has(key)),
    clear: () => this.getStore('domainValid').clear(),
    size: () => this.getStore('domainValid').size,
  };

  smtp = {
    get: (key: string) => Promise.resolve(this.getStore('smtp').get(key)),
    set: (key: string, value: boolean | null) => {
      this.getStore('smtp').set(key, value);
    },
    delete: (key: string) => this.getStore('smtp').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('smtp').has(key)),
    clear: () => this.getStore('smtp').clear(),
    size: () => this.getStore('smtp').size,
  };

  // SMTP port cache - stores successful port per MX host
  smtpPort = {
    get: (key: string) => Promise.resolve(this.getStore('smtpPort').get(key)),
    set: (key: string, value: number) => {
      console.log(`[CustomCache] Caching port ${value} for host ${key}`);
      this.getStore('smtpPort').set(key, value);
    },
    delete: (key: string) => this.getStore('smtpPort').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('smtpPort').has(key)),
    clear: () => {
      console.log('[CustomCache] Clearing SMTP port cache');
      this.getStore('smtpPort').clear();
    },
    size: () => this.getStore('smtpPort').size,
  };

  domainSuggestion = {
    get: (key: string) => Promise.resolve(this.getStore('domainSuggestion').get(key)),
    set: (key: string, value: any) => {
      this.getStore('domainSuggestion').set(key, value);
    },
    delete: (key: string) => this.getStore('domainSuggestion').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('domainSuggestion').has(key)),
    clear: () => this.getStore('domainSuggestion').clear(),
    size: () => this.getStore('domainSuggestion').size,
  };

  whois = {
    get: (key: string) => Promise.resolve(this.getStore('whois').get(key)),
    set: (key: string, value: any) => {
      this.getStore('whois').set(key, value);
    },
    delete: (key: string) => this.getStore('whois').delete(key),
    has: (key: string) => Promise.resolve(this.getStore('whois').has(key)),
    clear: () => this.getStore('whois').clear(),
    size: () => this.getStore('whois').size,
  };

  // Helper to see cache state
  getCacheStats() {
    return {
      smtpPortSize: this.smtpPort.size?.() || 0,
      smtpPortEntries: Array.from(this.getStore('smtpPort').entries()),
    };
  }
}

// Example usage
async function demonstrateCustomCache() {
  const customCache = new CustomMemoryCache();
  const defaultCache = getDefaultCache();

  console.log('=== SMTP Verification with Custom Cache ===\n');

  // First verification - will try all ports and cache the successful one
  console.log('1. First verification (will cache successful port):');
  const start1 = Date.now();
  const result1 = await verifyMailboxSMTP({
    local: 'test',
    domain: 'gmail.com',
    mxRecords: ['gmail-smtp-in.l.google.com'],
    options: {
      ports: [25, 587, 465],
      timeout: 5000,
      cache: customCache, // Pass the custom cache instance
      debug: true,
    },
  });
  const time1 = Date.now() - start1;
  console.log(`Result: ${result1}, Time: ${time1}ms\n`);
  console.log('Cache stats after first verification:', customCache.getCacheStats());

  // Second verification - should use cached port
  console.log('\n2. Second verification (should use cached port):');
  const start2 = Date.now();
  const result2 = await verifyMailboxSMTP({
    local: 'test2',
    domain: 'gmail.com',
    mxRecords: ['gmail-smtp-in.l.google.com'],
    options: {
      ports: [25, 587, 465],
      timeout: 5000,
      cache: customCache, // Same cache instance
      debug: true,
    },
  });
  const time2 = Date.now() - start2;
  console.log(`Result: ${result2}, Time: ${time2}ms`);

  if (time1 > 0) {
    const improvement = Math.round(((time1 - time2) / time1) * 100);
    console.log(`Performance improvement: ${improvement}%\n`);
  }

  // Different domain - will test ports again
  console.log('3. Different domain (will test ports again):');
  const start3 = Date.now();
  const result3 = await verifyMailboxSMTP({
    local: 'test',
    domain: 'outlook.com',
    mxRecords: ['outlook-com.olc.protection.outlook.com'],
    options: {
      ports: [25, 587, 465],
      timeout: 5000,
      cache: customCache,
      debug: true,
    },
  });
  const time3 = Date.now() - start3;
  console.log(`Result: ${result3}, Time: ${time3}ms\n`);
  console.log('Final cache stats:', customCache.getCacheStats());
}

// Example using default cache
async function demonstrateDefaultCache() {
  const defaultCache = getDefaultCache();

  console.log('\n=== SMTP Verification with Default Cache ===\n');

  // Using default cache - automatically caches ports
  console.log('1. First verification with default cache:');
  const result1 = await verifyMailboxSMTP({
    local: 'test',
    domain: 'gmail.com',
    mxRecords: ['gmail-smtp-in.l.google.com'],
    options: {
      ports: [25, 587, 465],
      timeout: 5000,
      cache: defaultCache, // Use default cache
      debug: true,
    },
  });
  console.log(`Result: ${result1}`);

  // Second verification - should use cached port
  console.log('\n2. Second verification (should use cached port):');
  const result2 = await verifyMailboxSMTP({
    local: 'test2',
    domain: 'gmail.com',
    mxRecords: ['gmail-smtp-in.l.google.com'],
    options: {
      ports: [25, 587, 465],
      timeout: 5000,
      cache: defaultCache, // Same cache instance
      debug: true,
    },
  });
  console.log(`Result: ${result2}`);

  // Example with no caching
  console.log('\n3. Verification without caching:');
  const result3 = await verifyMailboxSMTP({
    local: 'test3',
    domain: 'gmail.com',
    mxRecords: ['gmail-smtp-in.l.google.com'],
    options: {
      ports: [25, 587, 465],
      timeout: 5000,
      cache: null, // No caching
      debug: true,
    },
  });
  console.log(`Result: ${result3}`);
}

// Run the demonstrations
if (require.main === module) {
  demonstrateCustomCache()
    .then(() => demonstrateDefaultCache())
    .catch(console.error);
}

export { CustomMemoryCache, demonstrateCustomCache, demonstrateDefaultCache };
