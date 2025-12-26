import expect from 'expect';
import { isDisposableEmail, isValidEmail, isValidEmailDomain } from '../src';

describe('0008 Utils', () => {
  describe('isEmail', () => {
    it('should validate a correct address', async () => {
      expect(isValidEmail('foo@bar.com')).toBe(true);
      expect(isValidEmail('email@gmail.com')).toBe(true);
      expect(isValidEmail('email+plug@gmail.com')).toBe(true);
      expect(isValidEmail('email.name+plug@gmail.com')).toBe(true);
      expect(isValidEmail('email.name+plug.moea@gmail.com')).toBe(true); // todo this is invalid
    });

    it('should return false for an invalid address', async () => {
      expect(isValidEmail('bar.com')).toBe(false);
      expect(isValidEmail('email.+plug@gmail.com')).toBe(false);
    });
  });

  describe('isValidTld', () => {
    it('should succeed', async () => {
      expect(await isValidEmailDomain('foo@bar.com')).toEqual(true);
      expect(await isValidEmailDomain('foo@google.pl')).toEqual(true);
      expect(await isValidEmailDomain('foo@google.de')).toEqual(true);
      expect(await isValidEmailDomain('foo@google.co.uk')).toEqual(true);
      expect(await isValidEmailDomain('foo@google.sc')).toEqual(true);
      expect(await isValidEmailDomain('foo@google.tw')).toEqual(true);
      expect(await isValidEmailDomain('foo@google.ma')).toEqual(true);
    });

    it('should fail', async () => {
      expect(await isValidEmailDomain('foo')).toEqual(false);
      expect(await isValidEmailDomain('foo@google.coml')).toEqual(false);
      expect(await isValidEmailDomain('foo@foo@google.comd')).toEqual(false);
      expect(await isValidEmailDomain('foo@google.comx')).toEqual(false);
      expect(await isValidEmailDomain('foo@google.xx')).toEqual(false);
      expect(await isValidEmailDomain('foo@google.aa')).toEqual(false);
    });
  });

  describe('isDisposableEmail', () => {
    it('should return true', async () => {
      expect(await isDisposableEmail({ emailOrDomain: 'foo@yopmail.com' })).toEqual(true);
      expect(await isDisposableEmail({ emailOrDomain: 'foo@trackworld.xyz' })).toEqual(true);
    });

    it('should return false', async () => {
      expect(await isDisposableEmail({ emailOrDomain: 'foo@google.com' })).toEqual(false);
      expect(await isDisposableEmail({ emailOrDomain: 'foo@gmail.com' })).toEqual(false);
      expect(await isDisposableEmail({ emailOrDomain: 'foo@yahoo.com' })).toEqual(false);
    });
  });
});
