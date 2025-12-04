import { promises as dnsPromises } from 'node:dns';
import { mxCacheStore } from './cache';
import type { ICache } from './cache-interface';

export async function resolveMxRecords(domain: string, cache?: ICache | null): Promise<string[]> {
  // Check cache first
  const cacheStore = mxCacheStore(cache);
  const cached = await cacheStore.get(domain);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  try {
    const records: { exchange: string; priority: number }[] = await dnsPromises.resolveMx(domain);
    records.sort((a, b) => {
      if (a.priority < b.priority) {
        return -1;
      }
      if (a.priority > b.priority) {
        return 1;
      }
      return 0;
    });

    const exchanges = records.map((record) => record.exchange);

    // Cache the result
    await cacheStore.set(domain, exchanges);

    return exchanges;
  } catch (error) {
    // Cache negative results for shorter time
    await cacheStore.set(domain, []);
    throw error;
  }
}
