import expect from 'expect';
import { verifyEmail } from '../src';

describe('verifyEmailRealTest', () => {
  it('should success on real email gmail', async () => {
    const result = await verifyEmail({
      emailAddress: 'foo@google.com',
      verifyMx: true,
      verifySmtp: true,
    });
    expect(result.format.valid).toBe(true);
    expect(result.domain.valid).toBe(true);
    expect(result.smtp.valid).toBe(true);
  });

  it('should success on invalid email hello.com', async () => {
    const result = await verifyEmail({
      emailAddress: 'foohxxello2s8871@hello.com',
      verifyMx: true,
      verifySmtp: true,
    });
    expect(result.format.valid).toBe(true);
    expect(result.domain.valid).toBe(true);
    expect(result.smtp.valid).toBe(false);
  });

  it('should fail on invalid domain', async () => {
    const result = await verifyEmail({
      emailAddress: 'email@kk.com',
      verifyMx: true,
      verifySmtp: true,
    });
    expect(result.format.valid).toBe(true);
    expect(result.domain.valid).toBe(false);
    expect(result.smtp.valid).toBe(null); // SMTP returns null when MX records are invalid
  });

  it('returns immediately if email is malformed invalid', async () => {
    const result = await verifyEmail({ emailAddress: 'bar.com' });
    expect(result.format.valid).toBe(false);
    expect(result.domain.valid).toBe(null);
    expect(result.smtp.valid).toBe(null);
  });
  it('should use custom port with mapped domain: ova.ca', async () => {
    const result = await verifyEmail({
      emailAddress: 'support@ovh.com',
      debug: true,
      verifySmtp: true,
      verifyMx: true,
    });
    expect(result.format.valid).toBe(true);
    expect(result.domain.valid).toBe(true);
    expect(result.smtp.valid).toBe(null);
  });
  it('should use custom port with mapped domain: qq.com', async () => {
    const result = await verifyEmail({
      emailAddress: '10000000000000@qq.com',
      debug: true,
      verifySmtp: true,
      verifyMx: true,
    });
    expect(result.format.valid).toBe(true);
    expect(result.domain.valid).toBe(true);
    expect(result.smtp.valid).toBe(null);
  });
});
