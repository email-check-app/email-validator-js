import * as net from 'node:net';
import { isValid } from 'psl';
import { getCacheStore } from './cache';
import type { Cache } from './cache-interface';
import type { DomainAgeInfo, DomainRegistrationInfo } from './types';
import { type ParsedWhoisResult, parseWhoisData } from './whois-parser';

const whoisServers: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  info: 'whois.afilias.net',
  biz: 'whois.biz',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  uk: 'whois.nic.uk',
  de: 'whois.denic.de',
  fr: 'whois.afnic.fr',
  jp: 'whois.jprs.jp',
  au: 'whois.auda.org.au',
  ca: 'whois.cira.ca',
  eu: 'whois.eu',
  nl: 'whois.domain-registry.nl',
  ru: 'whois.tcinet.ru',
  br: 'whois.registro.br',
  cn: 'whois.cnnic.cn',
  in: 'whois.registry.in',
  me: 'whois.nic.me',
  us: 'whois.nic.us',
  tv: 'whois.nic.tv',
  cc: 'whois.nic.cc',
  ws: 'whois.website.ws',
  it: 'whois.nic.it',
  se: 'whois.iis.se',
  no: 'whois.norid.no',
  dk: 'whois.dk-hostmaster.dk',
  fi: 'whois.fi',
  es: 'whois.nic.es',
  ch: 'whois.nic.ch',
  pl: 'whois.dns.pl',
  be: 'whois.dns.be',
  at: 'whois.nic.at',
  ie: 'whois.iedr.ie',
  pt: 'whois.dns.pt',
  cz: 'whois.nic.cz',
  nz: 'whois.srs.net.nz',
  za: 'whois.registry.net.za',
  sg: 'whois.sgnic.sg',
  hk: 'whois.hkirc.hk',
  kr: 'whois.kr',
  tw: 'whois.twnic.net.tw',
  mx: 'whois.mx',
  ar: 'whois.nic.ar',
  cl: 'whois.nic.cl',
};

function queryWhoisServer(domain: string, server: string, timeout = 5000, debug = false): Promise<string> {
  const log = debug ? console.debug : (..._args: unknown[]) => {};

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let data = '';

    log(`[whois] querying ${server} for domain ${domain}`);

    const timer = setTimeout(() => {
      log(`[whois] timeout after ${timeout}ms for ${domain} at ${server}`);
      client.destroy();
      reject(new Error('WHOIS query timeout'));
    }, timeout);

    client.connect(43, server, () => {
      log(`[whois] connected to ${server}, sending query for ${domain}`);
      client.write(`${domain}\r\n`);
    });

    client.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      data += chunkStr;
      log(`[whois] received ${chunkStr.length} bytes from ${server}`);
    });

    client.on('close', () => {
      clearTimeout(timer);
      log(`[whois] connection closed, received total ${data.length} bytes from ${server}`);
      resolve(data);
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      log(`[whois] error querying ${server}: ${err.message}`);
      reject(err);
    });
  });
}

async function getWhoisData(
  domain: string,
  timeout = 5000,
  debug = false,
  cache?: Cache
): Promise<ParsedWhoisResult | null> {
  const log = debug ? console.debug : (..._args: unknown[]) => {};
  const cacheKey = `whois:${domain}`;
  const cacheStore = getCacheStore<ParsedWhoisResult>(cache, 'whois');

  log(`[whois] getting WHOIS data for ${domain}`);

  const cached = await cacheStore.get(cacheKey);
  if (cached !== null && cached !== undefined) {
    log(`[whois] using cached data for ${domain}`);
    return cached as ParsedWhoisResult;
  }

  try {
    const tld = domain.split('.').pop()?.toLowerCase();
    if (!tld) {
      throw new Error('Invalid domain');
    }

    log(`[whois] extracted TLD: ${tld} for domain: ${domain}`);

    const whoisServer = whoisServers[tld];
    if (!whoisServer) {
      log(`[whois] no specific server for TLD ${tld}, trying IANA`);
      const defaultServer = 'whois.iana.org';
      const ianaResponse = await queryWhoisServer(domain, defaultServer, timeout, debug);

      const referMatch = ianaResponse.match(/refer:\s+(\S+)/i);
      if (referMatch?.[1]) {
        const referredServer = referMatch[1];
        log(`[whois] IANA referred to ${referredServer} for ${domain}`);
        const whoisResponse = await queryWhoisServer(domain, referredServer, timeout, debug);
        const whoisData = parseWhoisData({ rawData: whoisResponse, domain });
        await cacheStore.set(cacheKey, whoisData);
        log(`[whois] successfully retrieved and cached WHOIS data from referred server for ${domain}`);
        return whoisData;
      }

      const whoisData = parseWhoisData({ rawData: ianaResponse, domain });
      await cacheStore.set(cacheKey, whoisData);
      log(`[whois] successfully retrieved and cached WHOIS data from IANA for ${domain}`);
      return whoisData;
    }

    log(`[whois] using WHOIS server ${whoisServer} for TLD ${tld}`);
    const whoisResponse = await queryWhoisServer(domain, whoisServer, timeout, debug);
    const whoisData = parseWhoisData({ rawData: whoisResponse, domain });
    await cacheStore.set(cacheKey, whoisData);
    log(`[whois] successfully retrieved and cached WHOIS data for ${domain}`);
    return whoisData;
  } catch (ignoredError) {
    log(
      `[whois] failed to get WHOIS data for ${domain}: ${ignoredError instanceof Error ? ignoredError.message : 'Unknown error'}`
    );
    return null;
  }
}

export async function getDomainAge(
  domain: string,
  timeout = 5000,
  debug = false,
  cache?: Cache
): Promise<DomainAgeInfo | null> {
  const log = debug ? console.debug : (..._args: unknown[]) => {};

  try {
    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split('@')
      .pop();
    if (!cleanDomain) {
      log(`[whois] invalid domain format: ${domain}`);
      return null;
    }

    log(`[whois] checking domain age for ${cleanDomain}`);

    // Use psl isValid to check if domain is valid
    if (!isValid(cleanDomain)) {
      log(`[whois] domain validation failed: ${cleanDomain}`);
      return null;
    }

    const whoisData = await getWhoisData(cleanDomain, timeout, debug, cache);
    if (!whoisData || !whoisData.creationDate) {
      log(`[whois] no creation date found for ${cleanDomain}`);
      return null;
    }

    const now = new Date();
    const creationDate = new Date(whoisData.creationDate);
    const ageInMilliseconds = now.getTime() - creationDate.getTime();
    const ageInDays = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24));
    const ageInYears = ageInDays / 365.25;

    log(`[whois] calculated age for ${cleanDomain}: ${ageInDays} days (${ageInYears.toFixed(2)} years)`);

    return {
      domain: cleanDomain,
      creationDate,
      ageInDays,
      ageInYears: parseFloat(ageInYears.toFixed(2)),
      expirationDate: whoisData.expirationDate ? new Date(whoisData.expirationDate) : null,
      updatedDate: whoisData.updatedDate ? new Date(whoisData.updatedDate) : null,
    };
  } catch (ignoredError) {
    log(
      `[whois] error getting domain age for ${domain}: ${ignoredError instanceof Error ? ignoredError.message : 'Unknown error'}`
    );
    return null;
  }
}

export async function getDomainRegistrationStatus(
  domain: string,
  timeout = 5000,
  debug = false,
  cache?: Cache
): Promise<DomainRegistrationInfo | null> {
  const log = debug ? console.debug : (..._args: unknown[]) => {};

  try {
    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split('@')
      .pop();
    if (!cleanDomain) {
      log(`[whois] invalid domain format: ${domain}`);
      return null;
    }

    log(`[whois] checking domain registration status for ${cleanDomain}`);

    // Use psl isValid to check if domain is valid
    if (!isValid(cleanDomain)) {
      log(`[whois] domain validation failed: ${cleanDomain}`);
      return null;
    }

    const whoisData = await getWhoisData(cleanDomain, timeout, debug, cache);

    if (!whoisData || whoisData.isAvailable) {
      log(`[whois] domain ${cleanDomain} is available or not registered`);
      return {
        domain: cleanDomain,
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

    const isRegistered = !!(whoisData.domainName || whoisData.creationDate || whoisData.registrar);
    let isExpired = false;
    let daysUntilExpiration: number | null = null;
    let expirationDate: Date | null = null;

    if (whoisData.expirationDate) {
      expirationDate = new Date(whoisData.expirationDate);
      const now = new Date();
      const expirationTime = expirationDate.getTime();
      const currentTime = now.getTime();

      isExpired = currentTime > expirationTime;
      if (!isExpired) {
        daysUntilExpiration = Math.floor((expirationTime - currentTime) / (1000 * 60 * 60 * 24));
      }
      log(`[whois] domain ${cleanDomain} expires in ${daysUntilExpiration} days`);
    }

    const statusList = whoisData.status || [];
    const formattedStatusList = statusList.map((s) => {
      const statusCode = s.split(' ')[0];
      return statusCode;
    });

    const isPendingDelete = formattedStatusList.some(
      (s) => s.toLowerCase().includes('pendingdelete') || s.toLowerCase().includes('redemption')
    );

    const isLocked = formattedStatusList.some(
      (s) =>
        s.toLowerCase().includes('clienttransferprohibited') || s.toLowerCase().includes('servertransferprohibited')
    );

    log(
      `[whois] domain ${cleanDomain} - registered: ${isRegistered}, expired: ${isExpired}, locked: ${isLocked}, pending delete: ${isPendingDelete}`
    );

    return {
      domain: cleanDomain,
      isRegistered,
      isAvailable: !isRegistered,
      status: formattedStatusList,
      registrar: whoisData.registrar || null,
      nameServers: whoisData.nameServers || [],
      expirationDate,
      isExpired,
      daysUntilExpiration,
      isPendingDelete,
      isLocked,
    };
  } catch (ignoredError) {
    log(
      `[whois] error getting domain registration status for ${domain}: ${ignoredError instanceof Error ? ignoredError.message : 'Unknown error'}`
    );
    return null;
  }
}
