const integrationTestGlobs = [
  '<rootDir>/__tests__/0100-smtp-basic.test.ts',
  '<rootDir>/__tests__/0101-smtp-ports.test.ts',
  '<rootDir>/__tests__/0102-smtp-tls.test.ts',
  '<rootDir>/__tests__/0103-smtp-sequences.test.ts',
  '<rootDir>/__tests__/0104-smtp-errors.test.ts',
  '<rootDir>/__tests__/0107-socket-mock.test.ts',
  '<rootDir>/__tests__/0108-socket-real.test.ts',
  '<rootDir>/__tests__/0302-whois.test.ts',
];

const integrationIgnorePatterns = [
  '/__tests__/0100-smtp-basic.test.ts',
  '/__tests__/0101-smtp-ports.test.ts',
  '/__tests__/0102-smtp-tls.test.ts',
  '/__tests__/0103-smtp-sequences.test.ts',
  '/__tests__/0104-smtp-errors.test.ts',
  '/__tests__/0107-socket-mock.test.ts',
  '/__tests__/0108-socket-real.test.ts',
  '/__tests__/0302-whois.test.ts',
];

module.exports = {
  integrationTestGlobs,
  integrationIgnorePatterns,
};
