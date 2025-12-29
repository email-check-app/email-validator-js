import { isSpamName } from '../src/is-spam-name';

describe('0503 isSpamName - LEGITIMATE names (should return FALSE)', () => {
  const legitNames = [
    // Common real names
    'John Doe',
    'Maria Gonzalez',
    'Wei Zhang',
    'Fatima Ali',
    'Alexander Hamilton',
    'Emma Watson',
    'Liam Neeson',
    'Sofia Rodriguez',

    // Longer real-sounding names
    'Christopher Lee',
    'Elizabeth Taylor',
    'Muhammad Khan',
    'Olivia Williams',

    // Names with mixed case but real words
    'McDonald',
    'Van Der Berg',
    "O'Connor",
    'Da Silva',

    // All uppercase or lowercase real names
    'BRAD PITT',
    'angelina jolie',
    'TOM CRUISE',

    // Names with apostrophes or hyphens (our function ignores them → still false because of other rules)
    "O'Reilly",
    'Jean-Paul Sartre',

    // Too short parts
    'Abc Defghijklmnopqrst',
    'Short Longbutverylongnamehere',

    // High vowel count (common in real names)
    'AeIoU ExampleName',
    'Audio Visual',

    // Contains numbers or symbols
    'User123 Admin',
    'test@example.com',
    'John.Doe!',
    'Spammer_2025',

    // Single part or more than two
    'JustOnePart',
    'Three Parts Here Now',
    '   ',
    '',

    // All lowercase, no uppercase
    'lowercase onlynamehere longpartalso',

    // All uppercase but short or high vowels
    'NASA HQ',
    'BBC NEWS',
  ];

  legitNames.forEach((name) => {
    test(`should NOT flag legitimate name: "${name}"`, () => {
      expect(isSpamName(name)).toBe(false);
    });
  });

  // Additional explicit edge cases
  test('should return false for names with numbers', () => {
    expect(isSpamName('User123 SpamBot2025')).toBe(false);
  });

  test('should return false for single long string', () => {
    expect(isSpamName('VeryLongSingleStringWithoutSpace')).toBe(false);
  });

  test('should return false for three parts', () => {
    expect(isSpamName('First Middle Last')).toBe(false);
  });

  test('should return false for high vowel ratio names', () => {
    expect(isSpamName('Audio Engineering Institute')).toBe(false);
  });
});

describe('isSpamName - SPAM names (should return TRUE)', () => {
  const spamNames = [
    'FalDxivcRyvFRbMUOedpn KAtCqqnzliZxRoThK',
    'SfLIYzfGPmgGrJmmqdCtz ogORauQoxHEQEsrWS',
    'vmRoNglTdqXMWCVBQTb JrUptXFbfxqDoXCFgns',
    'BokryNhKYPVbNTvtOF sgniCBMoHHDXwDqCgfW',
    'jDnxVCcKXcAndhjtdiKeW MgWbHPumVWkAGDmtbgeN',
    'ekoKUkLyxqhpccslBlOzeoWj uSmmPLQoxnXwYQzYJbLZyH',
    'OKOtZUbZOemKFGYtymz wXtFBSOCzMPhTyGMrE',
    'nJkYUkPGBoqDSEhrWYjIi QEtpFloPQQwAlVCTpaMB',
    'VrdSyXRYNBwRvaKPLlEEK mowVfuZmZzBApxkdJRXJGm',
    'XzPqLmNbVcRtYhJkQwErT fGhIjKlMnOpAsDfGwBxC', // similar future variant
    'AbCdEfGhIjKlMnOpQrStUv WyXzAbCdEfGhIjKlMnOpQ', // high consonants, mixed case

    // Additional spam cases from real data
    'alcgvrprXwsTeaKi WMnjMpGRqwrTlDOX',
    'XwstCbfUJWtBclurw TywKwBRduJsrczqeEwLFy',
    'LRKPCQcRVxXpQtfrdiFIu QbiFUbikPwxvwmniOu',
    'WuWXBiOXCzgJqqsvLS QlIYFhlrrsJhCjBYmPszd',
    'rSABvSkjxahmykAgxnGjccMj lSsmdZDQuZEVkgDKmekbiQP',
    'QSDiukQSPokKIoZDk VuIFZlIaFpEqOlyHMgEgeec',
    'yZkqZrIWURbdTFegvaloAItG lkDrMMVdncACAoIiRviktwvM',
    'gRpNQGrbxeEaRQCDI dBjZSqKGLvueufVQkOMlrOI',
    'UzJlJnUmqNGJwncCC HUbEPPQPdRBYSEjfcC',
    'THyaKNMvfuhPCPeVS CuHUhBijbDsWOMDeAxzYJNSW',
    'fPhVaojxbXcOqsPDa FjjYBECxmmOuJOcZilvjlQ',
    'GtOJeTbvYvSqsbQeiP HUmLifyCQhVzhZYE',
    'OVdvHaTULoECfghJjYFqBVGj nkgEPVUZpwKttATmVtwO',
    'dwgmDaYwJisUXmTUmlekTQ FLCOBDyJSCfArrJKrLjRsHcS',
    'icIMJbcUhbBsvjqPiOJo kNBBADnCXCPQatgTb',
    'YaPVXRObLjRZnhsRFXvOLtzt PBmuiWCLOyrxzOwlccOcg',
    'qPIXdKAfwxLmateYvdEcm NMKBizvQsRopdxqCE',
    'bARPHCeJrqceYrrMbm OiwffrmJqcdvJFVAY',
    'eiDpVWmiAgnqWapwiqNjHvcr wHPfwuOTvpoODnFPIEzx',
    'XpHVJffbfzAKOULZirJlVTD hQoFznAZbEsYSPIWbSVk',
    'ndFrdZqvnfVQnKhAUg YpAKlpSYWPElvwafoKylxJvr',
    'CZzSschqvprNZqyBTGweZK RwlzplwgfBLgPkdXg',
    'BggCaHVrohVNacwHSx RzStMiGqWmxseosvp',
    'odBtWxslJdQzpvUTv ZQwbdQnRoPLgFzeFXonSGggy',
    'QKJYSPjtjeCtTjuAtfNLZ svnYPFeLJVtUQqwPqoa',
    'YXlpOaQPzRaPWebpaxiJEWT lpxqzCmdubloMGixKN',
    'wQlLBMHXXTcTJTKf fgJQAIPTCtXBTssmh',
    'MlCTrIjUZILAzmQbkqu TJasvcbhmUUrKztvcsenYmX',
    'WKEFLzcqJaCCBpkzmhvxTSrj MFtkrJrjAYQfXEMUOC',
    'mAumlmKJzQPsyZxuaACqxPP JiAhKEQGwfUpvApZfbmRRg',
    'HVczBWEZSzBOdhiawx DEURensdbxaeKVhHmVyMyw',
    'vxoCInZHuHWjwzIdJvydCFR ioAcOrQilkpZfyAsaEx',
    'wpxFAKMbAvhPQBAt LayfqLAYyTmqOLvwpudxzDt',
    'OLnbozMnRplrNZNaoAuL gLViRdAIxldJEmFpq',
    'JMiNbuFigMUraBROO GBxWbTQFqWRMuWFjwGiNXR',
    'rKLzpGmUlxyMNEvvskWJtUn dPxMszTzCiqytwpH',
    'mVuaJuhgEOQlBCSeQxvFZ vmvLiZPuPPoYErUX',
  ];

  spamNames.forEach((name) => {
    test(`should detect "${name}" as spam`, () => {
      expect(isSpamName(name)).toBe(true);
    });
  });

  // Edge cases that are still spam-like
  test('should detect spam with trailing punctuation', () => {
    expect(isSpamName('nJkYUkPGBoqDSEhrWYjIi QEtpFloPQQwAlVCTpaMB,')).toBe(true);
    expect(isSpamName('OKOtZUbZOemKFGYtymz wXtFBSOCzMPhTyGMrE.')).toBe(true);
  });

  test('should detect spam with multiple spaces', () => {
    expect(isSpamName('OKOtZUbZOemKFGYtymz   wXtFBSOCzMPhTyGMrE')).toBe(true);
  });
});
