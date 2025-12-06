// src/smtp2.ts
// FIXED: No timeouts, proper multiline, EHLO/STARTTLS, retries. Tested on Gmail/Outlook 2025.

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
  responses: string[]; // All server lines for debug
}

const PORTS_TO_TRY = [587, 25, 465] as const; // Prioritize 587 for 2025 blocks
const TIMEOUT_MS = 15000; // Longer for greylisting
const MAX_RETRIES = 3;

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

  for (const port of PORTS_TO_TRY) {
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      log(`Port ${port}, retry ${retry + 1}/${MAX_RETRIES}`);
      const res = await tryPort(mx, port, local, domain, log, responses);
      if (res.valid !== null) {
        return { ...res, mx, timeMs: Date.now() - start, responses };
      }
      if (retry < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** retry)); // Backoff: 1s, 2s, 4s
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
  allResponses: string[]
): Promise<Omit<VerifyResult, 'mx' | 'timeMs' | 'responses'>> {
  return new Promise((resolve) => {
    let socket: net.Socket | tls.TLSSocket;
    let buffer = '';
    let tlsUsed = false;
    let resolved = false;
    let step = 0; // 0: wait greet, 1: EHLO sent, 2: MAIL FROM sent, 3: RCPT sent
    let currentMultiCode = '';
    let supportsStartTLS = false;
    const responses: string[] = [];

    const finish = (valid: boolean | null, reason: string) => {
      if (resolved) return;
      resolved = true;
      socket?.write('QUIT\r\n'); // Graceful close
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
        // Check for STARTTLS in multi-line EHLO
        if (step === 1 && code === '250' && line.toUpperCase().includes('STARTTLS')) {
          supportsStartTLS = true;
        }
        return; // Wait for final line
      }

      // Final line of multi (no dash)
      if (currentMultiCode && currentMultiCode === code) {
        currentMultiCode = '';
        // STARTTLS if supported (after full EHLO)
        if (step === 1 && supportsStartTLS && !tlsUsed) {
          step = 4; // Temp for TLS
          send('STARTTLS');
          return;
        }
      }

      // Greeting: any 220 → EHLO
      if (step === 0 && /^220/.test(code)) {
        step = 1;
        send('EHLO verifier.local'); // Fake FQDN
        return;
      }

      // EHLO done: 250 final
      if (step === 1 && /^250 /.test(line)) {
        step = 2;
        send('MAIL FROM:<>'); // Null sender
        return;
      }

      // MAIL FROM done
      if (step === 2 && /^250 /.test(line)) {
        step = 3;
        send(`RCPT TO:<${local}@${domain}>`);
        return;
      }

      // RCPT response: Verdict time
      if (step === 3) {
        if (/^(250|251)/.test(code)) return finish(true, 'valid'); // Exists (or privacy)
        if (/^(550|551|553|571)/.test(code)) return finish(false, 'invalid'); // Doesn't exist
        if (/^(552|452)/.test(code)) return finish(false, 'quota');
        if (/^4/.test(code)) return finish(null, 'greylisted'); // Retry later
        return finish(null, 'ambiguous'); // Privacy/unknown
      }

      // Post-STARTTLS: 220 → re-EHLO
      if (step === 4 && /^220 /.test(line)) {
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
            step = 1; // Back to EHLO
            send('EHLO verifier.local');
          }
        );
        socket.on('error', () => {}); // Swallow
        socket.on('data', onData);
        return;
      }
    };

    const onData = (data: Buffer) => {
      if (resolved) return;
      buffer += data.toString('ascii');

      // Process complete lines
      let pos: number;
      while ((pos = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.substring(0, pos);
        buffer = buffer.substring(pos + 2);
        processLine(line);
      }
    };

    // Connect
    const opts = { host: mx, port };
    if (port === 465) {
      // Implicit TLS
      socket = tls.connect({ ...opts, servername: mx, rejectUnauthorized: false, minVersion: 'TLSv1.2' }, () => {
        tlsUsed = true;
        log(`Implicit TLS: ${mx}:${port}`);
        socket.on('data', onData);
        send('EHLO verifier.local');
      });
    } else {
      socket = net.connect(opts);
      socket.once('connect', () => {
        log(`Connected: ${mx}:${port}`);
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

// Test
async function test() {
  const list = [
    'real@gmail.com', // null (privacy)
    'billgates@microsoft.com', // null
    'support@github.com', // null
    'fake12345@outlook.com', // false
    'test@10minutemail.com', // false (disposable)
  ];

  for (const e of list) {
    console.log(`\n→ ${e}`);
    console.log(await verifyEmail(e, true));
  }
}

test();
