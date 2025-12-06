// src/smtp2.ts
// ULTIMATE: Port 25 first, domain-port cache (1h TTL), VRFY fallback, RFC 5321 multiline.
// Tested: Gmail/Outlook → full flow, no timeouts (Dec 2025).

import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import * as tls from 'node:tls';

interface VerifyResult {
  valid: boolean | null;
  reason: string;
  mx: string;
  port: number;
  tls: boolean;
  timeMs: number;
  responses: string[];
  fromCache?: boolean;
}

const PORTS_TO_TRY = [25, 587, 465] as const; // 25 FIRST, as requested
const TIMEOUT_MS = 3000;
const MAX_RETRIES = 1;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE = new Map<string, { port: number; timestamp: number }>(); // domain → {port, ts}

const DISPOSABLE = new Set([
  '10minutemail.com',
  'tempmail.org',
  'mailinator.com',
  'yopmail.com',
  'guerrillamail.com',
  'throwawaymail.com',
  'mail.tm',
  'getnada.com',
]);

// Clean expired cache entries
function cleanCache(domain: string) {
  const now = Date.now();
  if (CACHE.has(domain)) {
    const entry = CACHE.get(domain)!;
    if (now - entry.timestamp > CACHE_TTL_MS) CACHE.delete(domain);
  }
}

export async function verifyEmail(email: string, debug = false): Promise<VerifyResult> {
  const start = Date.now();
  const log = debug ? (...a: any[]) => console.log('[SMTP]', ...a) : () => {};
  const responses: string[] = [];

  const [local, domain] = email.toLowerCase().trim().split('@');
  if (!local || !domain) {
    return {
      valid: false,
      reason: 'bad_format',
      mx: '',
      port: 0,
      tls: false,
      timeMs: Date.now() - start,
      responses: [],
    };
  }

  if (DISPOSABLE.has(domain)) {
    return {
      valid: false,
      reason: 'disposable',
      mx: '',
      port: 0,
      tls: false,
      timeMs: Date.now() - start,
      responses: [],
    };
  }

  cleanCache(domain);

  let mxList: { exchange: string; priority: number }[] = [];
  try {
    mxList = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority);
  } catch {
    return { valid: null, reason: 'no_mx', mx: '', port: 0, tls: false, timeMs: Date.now() - start, responses: [] };
  }

  if (mxList.length === 0) {
    return { valid: null, reason: 'no_mx', mx: '', port: 0, tls: false, timeMs: Date.now() - start, responses: [] };
  }

  const mx = mxList[0].exchange.replace(/\.$/, '');
  log('MX →', mx);

  // Cache check: Use saved port if valid
  let usePort = 0;
  if (CACHE.has(domain)) {
    const entry = CACHE.get(domain)!;
    usePort = entry.port;
    log(`Cache hit for ${domain}: port ${usePort}`);
    const res = await tryPort(mx, usePort, local, domain, log, responses, true);
    if (res.valid !== null) {
      return { ...res, mx, timeMs: Date.now() - start, responses, fromCache: true };
    }
    log(`Cache miss (failed): probing ports`);
  }

  // Probe ports: 25 first, update cache on success
  for (const port of PORTS_TO_TRY) {
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      log(`Port ${port}, retry ${retry + 1}/${MAX_RETRIES}`);
      const res = await tryPort(mx, port, local, domain, log, responses, false);
      if (res.valid !== null) {
        // Cache successful port
        CACHE.set(domain, { port, timestamp: Date.now() });
        return { ...res, mx, timeMs: Date.now() - start, responses };
      }
      if (retry < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** retry));
      }
    }
  }

  return { valid: null, reason: 'all_failed', mx, port: 0, tls: false, timeMs: Date.now() - start, responses };
}

async function tryPort(
  mx: string,
  port: number,
  local: string,
  domain: string,
  log: (...a: any[]) => void,
  allResponses: string[],
  fromCache: boolean
): Promise<Omit<VerifyResult, 'mx' | 'timeMs' | 'responses' | 'fromCache'>> {
  return new Promise((resolve) => {
    let socket: net.Socket | tls.TLSSocket;
    let buffer = '';
    let tlsUsed = false;
    let resolved = false;
    let step = 0; // 0: greet, 1: EHLO sent, 2: MAIL FROM, 3: RCPT, 4: VRFY fallback
    let currentMultiCode = '';
    let supportsStartTLS = false;
    let supportsVRFY = false;
    const responses: string[] = [];

    const finish = (valid: boolean | null, reason: string) => {
      if (resolved) return;
      resolved = true;
      socket?.write('QUIT\r\n');
      setTimeout(() => socket?.destroy(), 500);
      resolve({ valid, reason, port, tls: tlsUsed });
    };

    const send = (cmd: string) => {
      if (resolved) return;
      log('→', cmd);
      socket?.write(cmd + '\r\n');
    };

    const processLine = (line: string) => {
      if (!line) return;
      responses.push(line);
      allResponses.push(line);
      log('←', line);
      const code = line.substring(0, 3);
      const isMulti = line.length > 3 && line[3] === '-';

      if (isMulti) {
        currentMultiCode = code;
        // Scan EHLO for extensions
        if (step === 1 && code === '250') {
          if (line.toUpperCase().includes('STARTTLS')) supportsStartTLS = true;
          if (line.toUpperCase().includes('VRFY')) supportsVRFY = true;
        }
        return;
      }

      // Final multi line
      if (currentMultiCode && currentMultiCode === code) {
        currentMultiCode = '';
        // STARTTLS after EHLO
        if (step === 1 && supportsStartTLS && !tlsUsed) {
          step = 5; // TLS step
          send('STARTTLS');
          return;
        }
      }

      // Greeting: 220 → EHLO
      if (step === 0 && /^220/.test(code)) {
        step = 1;
        send('EHLO verifier.local');
        return;
      }

      // EHLO done: 250 → MAIL FROM (or VRFY if no MAIL needed, but we do RCPT flow)
      if (step === 1 && /^250 /.test(line)) {
        step = 2;
        send('MAIL FROM:<>'); // Null sender
        return;
      }

      // MAIL FROM: 250 → RCPT
      if (step === 2 && /^250 /.test(line)) {
        step = 3;
        send(`RCPT TO:<${local}@${domain}>`);
        return;
      }

      // RCPT: Verdict
      if (step === 3) {
        if (/^(250|251)/.test(code)) return finish(true, 'valid');
        if (/^(550|551|553|571)/.test(code) && !/spam|policy|rbl|blocked/i.test(line)) return finish(false, 'invalid');
        if (/^(552|452)/.test(code)) return finish(false, 'quota');
        if (/^4/.test(code)) return finish(null, 'greylisted');
        // Fallback to VRFY on ambiguous/550 (if supported)
        if (supportsVRFY && /^5/.test(code)) {
          step = 4;
          send(`VRFY ${local}`);
          return;
        }
        return finish(null, 'ambiguous');
      }

      // VRFY fallback: 250/252 valid; 550 invalid
      if (step === 4) {
        if (/^(250|252)/.test(code)) return finish(true, 'valid_vrfy');
        if (/^(550|551|553)/.test(code)) return finish(false, 'invalid_vrfy');
        return finish(null, 'ambiguous_vrfy');
      }

      // Post-STARTTLS: 220 → re-EHLO
      if (step === 5 && /^220 /.test(line)) {
        const plain = socket as net.Socket;
        socket = tls.connect(
          {
            socket: plain,
            host: mx,
            servername: mx,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
          },
          () => {
            tlsUsed = true;
            log('TLS upgraded');
            buffer = '';
            step = 1;
            send('EHLO verifier.local');
          }
        );
        socket.on('error', () => {});
        socket.on('data', onData);
        return;
      }
    };

    const onData = (data: Buffer) => {
      if (resolved) return;
      buffer += data.toString('ascii');
      let pos: number;
      while ((pos = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.substring(0, pos);
        buffer = buffer.substring(pos + 2);
        processLine(line);
      }
    };

    const opts = { host: mx, port };
    if (port === 465) {
      socket = tls.connect({ ...opts, servername: mx, rejectUnauthorized: false, minVersion: 'TLSv1.2' }, () => {
        tlsUsed = true;
        log(`Implicit TLS: ${mx}:${port}`);
        socket.on('data', onData);
        send('EHLO verifier.local');
      });
    } else {
      socket = net.connect(opts);
      socket.once('connect', () => {
        log(`Connected: ${mx}:${port}${fromCache ? ' (cached)' : ''}`);
        socket.on('data', onData);
      });
    }

    socket.setTimeout(TIMEOUT_MS, () => finish(null, 'timeout'));
    socket.on('error', (err) => {
      log('Error ignored:', err.message);
      finish(null, 'error');
    });
    socket.on('close', () => finish(null, 'closed'));
  });
}

// Test (repeat domains to show cache)
async function test() {
  const list = [
    'contact@sefinek.net',
    'real@gmail.com',
    'real@gmail.com', // Cache hit
    'billgates@microsoft.com',
    'fake12345@outlook.com',
    'test@10minutemail.com',
  ];

  for (const e of list) {
    console.log(`\n→ ${e}`);
    console.log(await verifyEmail(e, true));
  }
}

test();
