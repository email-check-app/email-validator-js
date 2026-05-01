/**
 * Shared fake `node:net` / `node:tls` for the SMTP test suite.
 *
 * Bun's `mock.module` replaces a module spec globally. Two test files each
 * registering their own mock for the same spec creates a race — the later
 * registration wins, silently breaking the earlier file's assertions. So we
 * define ONE mock here and have every test file import it.
 *
 * Usage:
 *
 *   import { fakeNet } from './helpers/fake-net';
 *
 *   beforeEach(() => fakeNet.reset());
 *
 *   test('valid mailbox', async () => {
 *     fakeNet.script(['220 hi', '250 ok', ...]);
 *     // optionally:
 *     // fakeNet.setConnectError('ECONNREFUSED');
 *     // fakeNet.scriptByPort(587, [...]);
 *     ...
 *   });
 */

import { mock } from 'bun:test';
import { EventEmitter } from 'node:events';

interface FakeSocket {
  _client: EventEmitter;
  written: string[];
  setTimeout: (ms: number, cb?: () => void) => void;
  destroy: () => void;
  end: () => void;
  write: (data: string | Buffer) => boolean;
  on: (ev: string, cb: (...args: unknown[]) => void) => FakeSocket;
}

interface ConnectInfo {
  host?: string;
  port?: number;
  isTls: boolean;
}

interface MxRecord {
  exchange: string;
  priority: number;
}

const state = {
  script: [] as string[],
  scriptByPort: new Map<number, string[]>(),
  scriptByHost: new Map<string, string[]>(),
  connectError: null as string | null,
  connectErrorByPort: new Map<number, string>(),
  unresponsivePorts: new Set<number>(),
  connects: [] as ConnectInfo[],
  writes: [] as Array<{ host?: string; port?: number; data: string }>,
  mxByDomain: new Map<string, MxRecord[]>(),
  mxError: null as Error | null,
  mxErrorByDomain: new Map<string, Error>(),
  mxCalls: [] as string[],
};

function makeFakeSocket(meta: { host?: string; port?: number }): FakeSocket {
  const emitter = new EventEmitter();
  const sock: FakeSocket = {
    _client: emitter,
    written: [],
    setTimeout: () => {},
    destroy: () => emitter.emit('close'),
    end: () => emitter.emit('close'),
    write: (data) => {
      const text = typeof data === 'string' ? data : data.toString();
      sock.written.push(text);
      state.writes.push({ host: meta.host, port: meta.port, data: text });
      return true;
    },
    on: (ev, cb) => {
      emitter.on(ev, cb);
      return sock;
    },
  };
  return sock;
}

function scriptFor(host: string | undefined, port: number | undefined): string[] {
  if (host !== undefined && state.scriptByHost.has(host)) return state.scriptByHost.get(host)!;
  if (port !== undefined && state.scriptByPort.has(port)) return state.scriptByPort.get(port)!;
  return state.script;
}

function scheduleScript(sock: FakeSocket, host: string | undefined, port: number | undefined) {
  if (port !== undefined && state.unresponsivePorts.has(port)) return;
  // Snapshot at scheduling time so a per-test reset() doesn't race.
  const snapshot = scriptFor(host, port).slice();
  for (const line of snapshot) {
    queueMicrotask(() => sock._client.emit('data', Buffer.from(`${line}\r\n`)));
  }
  // Auto-close after the script drains so consumers (whois etc.) that wait for
  // 'close' to resolve don't hang. Schedule after the data emits.
  if (snapshot.length > 0 && state.scriptByHost.has(host ?? '')) {
    queueMicrotask(() => queueMicrotask(() => sock._client.emit('close')));
  }
}

function emitConnectError(sock: FakeSocket, code: string) {
  const err = new Error(code) as Error & { code: string };
  err.code = code;
  queueMicrotask(() => sock._client.emit('error', err));
}

mock.module('node:net', () => ({
  default: {
    connect: (opts: { host?: string; port?: number }, cb?: () => void) => {
      state.connects.push({ host: opts.host, port: opts.port, isTls: false });
      const sock = makeFakeSocket(opts);
      const portSpecificError = opts.port !== undefined ? state.connectErrorByPort.get(opts.port) : undefined;
      const err = portSpecificError ?? state.connectError;
      if (err) {
        emitConnectError(sock, err);
        return sock;
      }
      queueMicrotask(() => {
        cb?.();
        scheduleScript(sock, opts.host, opts.port);
      });
      return sock;
    },
    isIP: (host: string): number => {
      // Match Node's net.isIP exactly: 0 not-IP, 4 IPv4, 6 IPv6.
      // Tests that depend on real IP detection still go through this.
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return 4;
      if (/^[0-9a-fA-F:]+$/.test(host) && host.includes(':')) return 6;
      return 0;
    },
  },
  connect: (opts: { host?: string; port?: number }, cb?: () => void) => {
    state.connects.push({ host: opts.host, port: opts.port, isTls: false });
    const sock = makeFakeSocket(opts);
    const portSpecificError = opts.port !== undefined ? state.connectErrorByPort.get(opts.port) : undefined;
    const err = portSpecificError ?? state.connectError;
    if (err) {
      emitConnectError(sock, err);
      return sock;
    }
    queueMicrotask(() => {
      cb?.();
      scheduleScript(sock, opts.host, opts.port);
    });
    return sock;
  },
  isIP: (host: string): number => {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return 4;
    if (/^[0-9a-fA-F:]+$/.test(host) && host.includes(':')) return 6;
    return 0;
  },
  // `new net.Socket()` shape — `whois.ts` uses this style. Returns a fake
  // socket whose `connect(port, host, cb)` method records the connect and
  // triggers the per-host or per-port script.
  Socket: class FakeSocketCtor {
    private sock = makeFakeSocket({});
    connect(port: number, host: string, cb?: () => void) {
      state.connects.push({ host, port, isTls: false });
      this.sock = makeFakeSocket({ host, port });
      const portSpecificError = state.connectErrorByPort.get(port);
      const err = portSpecificError ?? state.connectError;
      if (err) {
        emitConnectError(this.sock, err);
        return this;
      }
      queueMicrotask(() => {
        cb?.();
        scheduleScript(this.sock, host, port);
      });
      return this;
    }
    write(data: string | Buffer): boolean {
      return this.sock.write(data);
    }
    on(ev: string, cb: (...args: unknown[]) => void) {
      this.sock.on(ev, cb);
      return this;
    }
    destroy() {
      this.sock.destroy();
      return this;
    }
    end() {
      this.sock.end();
      return this;
    }
    setTimeout(_ms: number, _cb?: () => void) {
      return this;
    }
  },
}));

async function fakeResolveMx(domain: string): Promise<MxRecord[]> {
  state.mxCalls.push(domain);
  const perDomainErr = state.mxErrorByDomain.get(domain);
  if (perDomainErr) throw perDomainErr;
  if (state.mxError) throw state.mxError;
  return state.mxByDomain.get(domain) ?? [];
}

mock.module('node:dns', () => ({
  default: { promises: { resolveMx: fakeResolveMx } },
  promises: { resolveMx: fakeResolveMx },
}));
mock.module('dns', () => ({
  default: { promises: { resolveMx: fakeResolveMx } },
  promises: { resolveMx: fakeResolveMx },
}));

mock.module('node:tls', () => ({
  default: {
    connect: (opts: { port?: number; host?: string }, cb?: () => void) => {
      state.connects.push({ host: opts.host, port: opts.port, isTls: true });
      const sock = makeFakeSocket(opts);
      queueMicrotask(() => {
        cb?.();
        scheduleScript(sock, opts.host, opts.port);
      });
      return sock;
    },
  },
  connect: (opts: { port?: number; host?: string }, cb?: () => void) => {
    state.connects.push({ host: opts.host, port: opts.port, isTls: true });
    const sock = makeFakeSocket(opts);
    queueMicrotask(() => {
      cb?.();
      scheduleScript(sock, opts.host, opts.port);
    });
    return sock;
  },
}));

export const fakeNet = {
  /** Lines the server will emit on every connection (one frame per line). */
  script(lines: string[]) {
    state.script = lines;
  },
  /** Override script for a specific port — useful for multi-port tests. */
  scriptByPort(port: number, lines: string[]) {
    state.scriptByPort.set(port, lines);
  },
  /** Override script for a specific host — useful for multi-server tests (e.g. WHOIS). */
  scriptByHost(host: string, lines: string[]) {
    state.scriptByHost.set(host, lines);
  },
  /** All `socket.write(data)` calls in order, with the host/port that owned the socket. */
  get writes(): readonly { host?: string; port?: number; data: string }[] {
    return state.writes;
  },
  /** Make every connect attempt error with the given code (e.g. ECONNREFUSED). */
  setConnectError(err: string | null) {
    state.connectError = err;
  },
  /** Per-port connect error — overrides `setConnectError` for that port only. */
  setConnectErrorForPort(port: number, err: string) {
    state.connectErrorByPort.set(port, err);
  },
  /** Mark ports as silent — connects succeed but no data is ever sent. */
  setUnresponsivePorts(ports: number[]) {
    state.unresponsivePorts = new Set(ports);
  },
  /** Recorded connection attempts in order. */
  get connects(): readonly ConnectInfo[] {
    return state.connects;
  },
  /** Configure MX records returned by `dns.promises.resolveMx(domain)`. */
  setMxRecords(domain: string, records: MxRecord[]) {
    state.mxByDomain.set(domain, records);
  },
  /** Make every `resolveMx` call reject with this error. */
  setMxError(err: Error | null) {
    state.mxError = err;
  },
  /** Make `resolveMx` reject for one specific domain. */
  setMxErrorForDomain(domain: string, err: Error) {
    state.mxErrorByDomain.set(domain, err);
  },
  /** Domains looked up via `dns.promises.resolveMx`, in call order. */
  get mxCalls(): readonly string[] {
    return state.mxCalls;
  },
  reset() {
    state.script = [];
    state.scriptByPort.clear();
    state.scriptByHost.clear();
    state.connectError = null;
    state.connectErrorByPort.clear();
    state.unresponsivePorts.clear();
    state.connects = [];
    state.writes = [];
    state.mxByDomain.clear();
    state.mxError = null;
    state.mxErrorByDomain.clear();
    state.mxCalls = [];
  },
};
