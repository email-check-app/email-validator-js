import { verifyEmail } from '../src';

/**
 * Real Socket Connection Tests
 *
 * Tests SMTP verification with real network connections to actual mail servers.
 * These tests make actual network calls and verify behavior with real domains.
 * NOTE: These tests are integration tests that require network connectivity.
 */
describe('0108 Socket Real', () => {
  it('should verify a valid Google email address', async () => {
    const result = await verifyEmail({
      emailAddress: 'gosquad@google.com',
      verifyMx: true,
      verifySmtp: true,
      debug: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(true);
    expect(result.validSmtp).toBe(true);
    expect(result.canConnectSmtp).toBe(true);
    expect(result.hasFullInbox).toBe(false);
    expect(result.isCatchAll).toBe(false);
    expect(result.isDeliverable).toBe(true);
    expect(result.isDisabled).toBe(false);
  });
  it('should verify a valid Google email address 2', async () => {
    const result = await verifyEmail({
      emailAddress: 'hello@cyberlabgo.com',
      verifyMx: true,
      verifySmtp: true,
      debug: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(true);
    expect(result.validSmtp).toBe(true);
    expect(result.canConnectSmtp).toBe(true);
    expect(result.hasFullInbox).toBe(false);
    expect(result.isCatchAll).toBe(false);
    expect(result.isDeliverable).toBe(true);
    expect(result.isDisabled).toBe(false);
  });

  it('should return false for non-existent hello.com email', async () => {
    const result = await verifyEmail({
      emailAddress: 'foohxxello2s8871@hello.com',
      verifyMx: true,
      verifySmtp: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(true);
    expect(result.validSmtp).toBe(false);
  });

  it('should fail when domain has no MX records', async () => {
    const result = await verifyEmail({
      emailAddress: 'email@kk.com',
      verifyMx: true,
      verifySmtp: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(false);
    expect(result.validSmtp).toBe(null); // SMTP returns null when MX records are invalid
  });

  it('returns early for malformed email address', async () => {
    const result = await verifyEmail({ emailAddress: 'bar.com' });
    expect(result.validFormat).toBe(false);
    expect(result.validMx).toBe(null);
    expect(result.validSmtp).toBe(null);
  });
  it('should handle OVH domain email verification', async () => {
    const result = await verifyEmail({
      emailAddress: 'support@ovh.com',
      debug: true,
      verifySmtp: true,
      verifyMx: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(true);
    expect(result.validSmtp).toBe(null);
  });
  it('should handle QQ domain email verification', async () => {
    const result = await verifyEmail({
      emailAddress: '10000000000000@qq.com',
      debug: true,
      verifySmtp: true,
      verifyMx: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(true);
    expect(result.validSmtp).toBe(false);
  });
});
