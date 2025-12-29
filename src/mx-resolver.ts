import { promises as dnsPromises } from 'node:dns';
import { getCacheStore } from './cache';
import type { ResolveMxParams } from './types';

export async function resolveMxRecords(params: ResolveMxParams): Promise<string[]> {
  const { domain, cache, logger } = params;
  const log = logger || (() => {});

  // Check cache first
  const cacheStore = getCacheStore<string[]>(cache, 'mx');
  const cached = await cacheStore.get(domain);
  if (cached !== null && cached !== undefined) {
    log(`[resolveMxRecords] Cache hit for ${domain}: ${cached?.length} MX records`);
    return cached;
  }

  log(`[resolveMxRecords] Performing DNS MX lookup for ${domain}`);
  try {
    const records: { exchange: string; priority: number }[] = await dnsPromises.resolveMx(domain);
    records?.sort((a, b) => {
      if (a.priority < b.priority) {
        return -1;
      }
      if (a.priority > b.priority) {
        return 1;
      }
      return 0;
    });

    const exchanges = records?.map((record) => record.exchange);
    log(`[resolveMxRecords] Found ${exchanges?.length} MX records for ${domain}: [${exchanges?.join(', ')}]`);

    // Cache the result
    await cacheStore.set(domain, exchanges);
    log(`[resolveMxRecords] Cached ${exchanges?.length} MX records for ${domain}`);

    return exchanges;
  } catch (error) {
    log(`[resolveMxRecords] MX lookup failed for ${domain}, caching empty result`);
    // Cache negative results for shorter time
    await cacheStore.set(domain, []);
    throw error;
  }
}
