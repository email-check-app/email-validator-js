import expect from 'expect';
import { verifyEmail } from '../src';

describe('0108 Socket Real', () => {
  it('should success on real email gmail', async () => {
    const result = await verifyEmail({
      emailAddress: 'gosquad@google.com',
      verifyMx: true,
      verifySmtp: true,
      debug: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(true);
    expect(result.validSmtp).toBe(true);
  });

  it('should success on invalid email hello.com', async () => {
    const result = await verifyEmail({
      emailAddress: 'foohxxello2s8871@hello.com',
      verifyMx: true,
      verifySmtp: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(true);
    expect(result.validSmtp).toBe(false);
  });

  it('should fail on invalid domain', async () => {
    const result = await verifyEmail({
      emailAddress: 'email@kk.com',
      verifyMx: true,
      verifySmtp: true,
    });
    expect(result.validFormat).toBe(true);
    expect(result.validMx).toBe(false);
    expect(result.validSmtp).toBe(null); // SMTP returns null when MX records are invalid
  });

  it('returns immediately if email is malformed invalid', async () => {
    const result = await verifyEmail({ emailAddress: 'bar.com' });
    expect(result.validFormat).toBe(false);
    expect(result.validMx).toBe(null);
    expect(result.validSmtp).toBe(null);
  });
  it('should use custom port with mapped domain: ovh.ca -> mx ovh.net', async () => {
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
  it('should use custom port with mapped domain: qq.com', async () => {
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
