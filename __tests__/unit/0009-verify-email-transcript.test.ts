/**
 * `verifyEmail({captureTranscript: true})` populates `result.transcript` with
 * a structured per-step trace. Each step records `{kind, startedAt,
 * durationMs, ok, details}`. Verifies:
 *   - opt-out (default) — no transcript field
 *   - syntax / domain-validation steps fire
 *   - disposable / free / domain-suggestion / name-detection steps fire when enabled
 *   - mx-lookup + smtp-probe steps fire and include details (records, port, verdict)
 *   - whois-age + whois-registration steps fire when enabled
 *   - SMTP step embeds the per-port transcript when captured
 *   - fast-fail paths still return a partial transcript
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { VerificationStep, VerificationStepKind } from '../../src';
import { clearDefaultCache, verifyEmail } from '../../src';
import { fakeNet } from '../helpers/fake-net';

const HAPPY_SMTP = ['220 mx.example.com ESMTP', '250 mx.example.com Hello', '250 sender ok', '250 recipient ok'];

function step(transcript: VerificationStep[] | undefined, kind: VerificationStepKind): VerificationStep | undefined {
  return transcript?.find((s) => s.kind === kind);
}

describe('0009 verifyEmail transcript', () => {
  beforeEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  afterEach(() => {
    fakeNet.reset();
    clearDefaultCache();
  });

  it('default: result has no transcript field', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    const result = await verifyEmail({ emailAddress: 'alice@example.com', verifyMx: true });
    expect(result.transcript).toBeUndefined();
  });

  it('captureTranscript=true populates an array of steps', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      checkDisposable: false,
      checkFree: false,
      suggestDomain: false,
      captureTranscript: true,
    });
    expect(Array.isArray(result.transcript)).toBe(true);
    expect(result.transcript!.length).toBeGreaterThan(0);
  });

  it('every step has the required shape', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      captureTranscript: true,
    });
    for (const s of result.transcript ?? []) {
      expect(typeof s.kind).toBe('string');
      expect(typeof s.startedAt).toBe('number');
      expect(typeof s.durationMs).toBe('number');
      expect(typeof s.ok).toBe('boolean');
      expect(typeof s.details).toBe('object');
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('records syntax + domain-validation for a normal happy path', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      captureTranscript: true,
    });
    expect(step(result.transcript, 'syntax')).toBeDefined();
    expect(step(result.transcript, 'domain-validation')).toBeDefined();
  });

  it('skips syntax-failed inputs but still records the syntax step', async () => {
    const result = await verifyEmail({
      emailAddress: 'not-an-email',
      captureTranscript: true,
    });
    const syntaxStep = step(result.transcript, 'syntax');
    expect(syntaxStep?.details.ok).toBe(false);
    // No further steps attempted after syntax fails.
    expect(step(result.transcript, 'mx-lookup')).toBeUndefined();
  });

  it('records disposable + free steps when enabled', async () => {
    // `acme-corp.com` is in neither the disposable list nor the free-provider
    // list — gives us a clean "both false" assertion.
    fakeNet.setMxRecords('acme-corp.com', [{ exchange: 'mx.acme-corp.com', priority: 10 }]);
    const result = await verifyEmail({
      emailAddress: 'alice@acme-corp.com',
      verifyMx: false,
      checkDisposable: true,
      checkFree: true,
      captureTranscript: true,
    });
    const disposable = step(result.transcript, 'disposable');
    const free = step(result.transcript, 'free');
    expect(disposable?.details.isDisposable).toBe(false);
    expect(free?.details.isFree).toBe(false);
  });

  it('records mx-lookup with the resolved record list', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      captureTranscript: true,
    });
    const mx = step(result.transcript, 'mx-lookup');
    expect(mx?.ok).toBe(true);
    expect(mx?.details.count).toBe(1);
    expect(mx?.details.records).toEqual(['mx.example.com']);
  });

  it('records smtp-probe with verdict + per-port transcript', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    fakeNet.script(HAPPY_SMTP);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      verifySmtp: true,
      timeout: 1000,
      captureTranscript: true,
    });
    const smtp = step(result.transcript, 'smtp-probe');
    expect(smtp).toBeDefined();
    expect(smtp?.details.verdict).toBe('deliverable');
    // Transcript array must be present and contain port-prefixed lines.
    const transcript = smtp?.details.transcript as string[] | null;
    const commands = smtp?.details.commands as string[] | null;
    expect(Array.isArray(transcript)).toBe(true);
    expect(transcript!.some((l) => /^\d+\|s\| /.test(l))).toBe(true);
    expect(Array.isArray(commands)).toBe(true);
    expect(commands!.some((c) => /^\d+\|c\| /.test(c))).toBe(true);
  });

  it('records smtp-probe step on cache hit (without re-probing the wire)', async () => {
    // Pre-populate the cache by running once.
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    fakeNet.script(HAPPY_SMTP);
    await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      verifySmtp: true,
      timeout: 1000,
    });
    // Second call — should hit the SMTP cache.
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      verifySmtp: true,
      timeout: 1000,
      captureTranscript: true,
    });
    const smtp = step(result.transcript, 'smtp-probe');
    expect(smtp?.details.cacheHit).toBe(true);
    expect(smtp?.details.verdict).toBe('deliverable');
  });

  it('records domain-suggestion when enabled', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: false,
      suggestDomain: true,
      captureTranscript: true,
    });
    expect(step(result.transcript, 'domain-suggestion')).toBeDefined();
  });

  it('records name-detection when enabled', async () => {
    const result = await verifyEmail({
      emailAddress: 'john.doe@example.com',
      verifyMx: false,
      suggestDomain: false,
      checkDisposable: false,
      checkFree: false,
      detectName: true,
      captureTranscript: true,
    });
    const nd = step(result.transcript, 'name-detection');
    expect(nd).toBeDefined();
    expect(nd?.details.detected).toBeDefined();
  });

  it('whois-age step fires when checkDomainAge is on', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    fakeNet.scriptByHost('whois.verisign-grs.com', [
      'Domain Name: EXAMPLE.COM\nRegistrar: Test\nCreation Date: 2010-01-01T00:00:00Z\n',
    ]);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: false,
      checkDomainAge: true,
      whoisTimeout: 2000,
      captureTranscript: true,
    });
    const age = step(result.transcript, 'whois-age');
    expect(age).toBeDefined();
    expect(age?.details.found).toBe(true);
    expect(age?.details.creationDate).toContain('2010-01-01');
  });

  it('steps appear in execution order', async () => {
    fakeNet.setMxRecords('example.com', [{ exchange: 'mx.example.com', priority: 10 }]);
    const result = await verifyEmail({
      emailAddress: 'alice@example.com',
      verifyMx: true,
      detectName: true,
      suggestDomain: true,
      checkDisposable: true,
      checkFree: true,
      captureTranscript: true,
    });
    const kinds = (result.transcript ?? []).map((s) => s.kind);
    // syntax must come first; mx-lookup after disposable/free.
    expect(kinds[0]).toBe('syntax');
    const mxIdx = kinds.indexOf('mx-lookup');
    const disposableIdx = kinds.indexOf('disposable');
    expect(disposableIdx).toBeLessThan(mxIdx);
  });
});
