/**
 * WHOIS lookup — TCP query against a TLD-specific WHOIS server, then parse.
 *
 * Two public surfaces:
 *   - `getDomainAge`: extracts creation date and computes age.
 *   - `getDomainRegistrationStatus`: extracts registrar / status / expiry.
 *
 * Both share the same `getWhoisData` retrieval pipeline:
 *   1. Strip URL/email noise from the domain (`cleanDomain`).
 *   2. Validate via `psl`.
 *   3. Look up the TLD-specific server (or fall back through IANA's referral).
 *   4. TCP-query port 43 (`queryWhoisServer`).
 *   5. Cache the parsed result.
 */
import * as net from 'node:net';
import { isValid } from 'psl';
import { getCacheStore } from './cache';
import type { Cache } from './cache-interface';
import whoisServersJson from './data/whois-servers.json';
import type { DomainAgeInfo, DomainRegistrationInfo } from './types';
import { type ParsedWhoisResult, parseWhoisData } from './whois-parser';

type Logger = (...args: unknown[]) => void;
const noopLog: Logger = () => {};

const WHOIS_PORT = 43;
const IANA_FALLBACK_SERVER = 'whois.iana.org';
const whoisServers = whoisServersJson as Record<string, string>;

/** Strip protocol, path, and email-prefix noise — return just the host. */
function cleanDomain(input: string): string | null {
  const stripped = input
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.split('@')
    .pop();
  return stripped || null;
}

/** TCP query the WHOIS server on port 43 with a timeout. */
function queryWhoisServer(domain: string, server: string, timeout: number, log: Logger): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let data = '';

    log(`[whois] querying ${server} for ${domain}`);

    const timer = setTimeout(() => {
      log(`[whois] timeout after ${timeout}ms — ${domain} @ ${server}`);
      client.destroy();
      reject(new Error('WHOIS query timeout'));
    }, timeout);

    client.connect(WHOIS_PORT, server, () => {
      log(`[whois] connected to ${server}, sending query`);
      client.write(`${domain}\r\n`);
    });

    client.on('data', (chunk) => {
      data += chunk.toString();
    });

    client.on('close', () => {
      clearTimeout(timer);
      log(`[whois] received ${data.length} bytes from ${server}`);
      resolve(data);
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      log(`[whois] error from ${server}: ${err.message}`);
      reject(err);
    });
  });
}

/** Pick the TLD-specific server, or fall back through IANA's referral. */
async function fetchAndParse(domain: string, timeout: number, log: Logger): Promise<ParsedWhoisResult> {
  const tld = domain.split('.').pop()?.toLowerCase();
  if (!tld) throw new Error('Invalid domain');

  const direct = whoisServers[tld];
  if (direct) {
    log(`[whois] using ${direct} for .${tld}`);
    const raw = await queryWhoisServer(domain, direct, timeout, log);
    return parseWhoisData({ rawData: raw, domain });
  }

  log(`[whois] no server for .${tld}, asking IANA`);
  const ianaResponse = await queryWhoisServer(domain, IANA_FALLBACK_SERVER, timeout, log);
  const referredServer = ianaResponse.match(/refer:\s+(\S+)/i)?.[1];
  if (referredServer) {
    log(`[whois] IANA referred us to ${referredServer}`);
    const raw = await queryWhoisServer(domain, referredServer, timeout, log);
    return parseWhoisData({ rawData: raw, domain });
  }
  return parseWhoisData({ rawData: ianaResponse, domain });
}

async function getWhoisData(
  domain: string,
  timeout: number,
  log: Logger,
  cache?: Cache
): Promise<ParsedWhoisResult | null> {
  const cacheKey = `whois:${domain}`;
  const cacheStore = getCacheStore<ParsedWhoisResult>(cache, 'whois');

  const cached = await cacheStore.get(cacheKey);
  if (cached) {
    log(`[whois] cache hit for ${domain}`);
    return cached as ParsedWhoisResult;
  }

  try {
    const data = await fetchAndParse(domain, timeout, log);
    await cacheStore.set(cacheKey, data);
    return data;
  } catch (error) {
    log(`[whois] failed for ${domain}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** Validate domain shape + parse + cache. Returns null on any failure. */
async function loadWhoisFor(
  domain: string,
  timeout: number,
  log: Logger,
  cache?: Cache
): Promise<{ host: string; data: ParsedWhoisResult } | null> {
  const host = cleanDomain(domain);
  if (!host) {
    log(`[whois] invalid domain shape: ${domain}`);
    return null;
  }
  if (!isValid(host)) {
    log(`[whois] psl rejected: ${host}`);
    return null;
  }
  const data = await getWhoisData(host, timeout, log, cache);
  return data ? { host, data } : null;
}

export async function getDomainAge(
  domain: string,
  timeout = 5000,
  debug = false,
  cache?: Cache
): Promise<DomainAgeInfo | null> {
  const log: Logger = debug ? console.debug : noopLog;
  const loaded = await loadWhoisFor(domain, timeout, log, cache);
  if (!loaded?.data.creationDate) return null;

  const { host, data } = loaded;
  // Type-narrowed by the guard above — destructuring widens it back, so re-check.
  const rawCreation = data.creationDate;
  if (!rawCreation) return null;
  const creationDate = new Date(rawCreation);
  const ageInDays = Math.floor((Date.now() - creationDate.getTime()) / 86_400_000);
  const ageInYears = parseFloat((ageInDays / 365.25).toFixed(2));
  log(`[whois] ${host} age: ${ageInDays} days (${ageInYears}y)`);

  return {
    domain: host,
    creationDate,
    ageInDays,
    ageInYears,
    expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
    updatedDate: data.updatedDate ? new Date(data.updatedDate) : null,
  };
}

export async function getDomainRegistrationStatus(
  domain: string,
  timeout = 5000,
  debug = false,
  cache?: Cache
): Promise<DomainRegistrationInfo | null> {
  const log: Logger = debug ? console.debug : noopLog;
  const loaded = await loadWhoisFor(domain, timeout, log, cache);
  if (!loaded) return null;

  const { host, data } = loaded;
  if (data.isAvailable) {
    log(`[whois] ${host} is available / not registered`);
    return availableResult(host);
  }

  const isRegistered = Boolean(data.domainName || data.creationDate || data.registrar);
  const expirationDate = data.expirationDate ? new Date(data.expirationDate) : null;
  const isExpired = expirationDate ? Date.now() > expirationDate.getTime() : false;
  const daysUntilExpiration =
    expirationDate && !isExpired ? Math.floor((expirationDate.getTime() - Date.now()) / 86_400_000) : null;

  // Status codes look like "clientTransferProhibited https://..." — keep just the code.
  const statusCodes = (data.status ?? []).map((s) => s.split(' ')[0] ?? '');
  const isPendingDelete = statusCodes.some((s) => /pendingdelete|redemption/i.test(s));
  const isLocked = statusCodes.some((s) => /(client|server)transferprohibited/i.test(s));

  log(
    `[whois] ${host} — registered=${isRegistered} expired=${isExpired} locked=${isLocked} pendingDelete=${isPendingDelete}`
  );

  return {
    domain: host,
    isRegistered,
    isAvailable: !isRegistered,
    status: statusCodes,
    registrar: data.registrar ?? null,
    nameServers: data.nameServers ?? [],
    expirationDate,
    isExpired,
    daysUntilExpiration,
    isPendingDelete,
    isLocked,
  };
}

function availableResult(domain: string): DomainRegistrationInfo {
  return {
    domain,
    isRegistered: false,
    isAvailable: true,
    status: [],
    registrar: null,
    nameServers: [],
    expirationDate: null,
    isExpired: false,
    daysUntilExpiration: null,
    isPendingDelete: false,
    isLocked: false,
  };
}
