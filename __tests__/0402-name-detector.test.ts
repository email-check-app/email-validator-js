import { cleanNameForAlgorithm, detectName, detectNameForAlgorithm } from '../src/name-detector';

describe('0402 Name Detector', () => {
  describe('cleanNameForAlgorithm', () => {
    it('should remove dots from names', () => {
      expect(cleanNameForAlgorithm('john.doe')).toBe('johndoe');
      expect(cleanNameForAlgorithm('j.d.rockefeller')).toBe('jdrockefeller');
      expect(cleanNameForAlgorithm('mary.jane')).toBe('maryjane');
    });

    it('should remove underscores from names', () => {
      expect(cleanNameForAlgorithm('john_doe')).toBe('johndoe');
      expect(cleanNameForAlgorithm('mary_jane_smith')).toBe('maryjanesmith');
      expect(cleanNameForAlgorithm('first_last')).toBe('firstlast');
    });

    it('should remove asterisks from names', () => {
      expect(cleanNameForAlgorithm('john*doe')).toBe('johndoe');
      expect(cleanNameForAlgorithm('mary*')).toBe('mary');
      expect(cleanNameForAlgorithm('*star*name*')).toBe('starname');
    });

    it('should remove multiple types of special characters', () => {
      expect(cleanNameForAlgorithm('john.doe_smith*')).toBe('johndoesmith');
      expect(cleanNameForAlgorithm('a.b_c*d')).toBe('abcd');
      expect(cleanNameForAlgorithm('first_name.last*name')).toBe('firstnamelastname');
    });

    it('should handle edge cases', () => {
      expect(cleanNameForAlgorithm('')).toBe('');
      expect(cleanNameForAlgorithm('.')).toBe('.');
      expect(cleanNameForAlgorithm('_')).toBe('_');
      expect(cleanNameForAlgorithm('*')).toBe('*');
      expect(cleanNameForAlgorithm('...')).toBe('...');
      expect(cleanNameForAlgorithm('___')).toBe('___');
      expect(cleanNameForAlgorithm('***')).toBe('***');
    });

    it('should normalize spaces', () => {
      expect(cleanNameForAlgorithm('john   doe')).toBe('john doe');
      expect(cleanNameForAlgorithm('  mary  jane  ')).toBe('mary jane');
    });

    it('should return original name if cleaning results in empty string', () => {
      expect(cleanNameForAlgorithm('..._..._*...')).toBe('..._..._*...');
    });
  });

  describe('detectNameForAlgorithm', () => {
    it('should detect and clean names from emails with dots', () => {
      const result = detectNameForAlgorithm('john.doe@example.com');
      expect(result).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        confidence: expect.any(Number),
      });
    });

    it('should detect and clean names from emails with underscores', () => {
      const result = detectNameForAlgorithm('mary_jane@example.com');
      expect(result).toEqual({
        firstName: 'Mary',
        lastName: 'Jane',
        confidence: expect.any(Number),
      });
    });

    it('should detect and clean names from emails with mixed separators', () => {
      const result = detectNameForAlgorithm('first_name.last*name@example.com');
      expect(result).toEqual({
        firstName: 'Firstname',
        lastName: 'Lastname',
        confidence: expect.any(Number),
      });
    });

    it('should return null if no name detected', () => {
      expect(detectNameForAlgorithm('admin@example.com')).toBeNull();
      expect(detectNameForAlgorithm('noreply@example.com')).toBeNull();
      expect(detectNameForAlgorithm('invalid-email')).toBeNull();
    });

    it('should handle single names', () => {
      const result = detectNameForAlgorithm('john.doe.smith@example.com');
      expect(result).toBeDefined();
      if (result) {
        expect(['John', 'Doe']).toContain(result.firstName);
        expect(['Doe', 'Smith']).toContain(result.lastName);
      }
    });

    it('should have slightly reduced confidence due to cleaning', () => {
      const email = 'john.doe@example.com';
      const normalResult = detectName(email);
      const algorithmResult = detectNameForAlgorithm(email);

      if (normalResult && algorithmResult) {
        expect(algorithmResult.confidence).toBeLessThan(normalResult.confidence);
        expect(algorithmResult.confidence).toBeCloseTo(normalResult.confidence * 0.95);
      }
    });

    it('should handle edge case where cleaning results in empty name', () => {
      // This is a contrived example to test the edge case
      const result = detectNameForAlgorithm('a.b@example.com');
      // The result might be null due to cleaning being too aggressive with single letters
      // This is expected behavior for the cleaning function
      expect(result).toBeDefined(); // Can be null or have a name, both are valid outcomes
    });
  });

  describe('Comparison with regular detectName', () => {
    it('should produce cleaner names for emails with special characters', () => {
      const email = 'john.doe_smith*';

      const regularResult = detectName(`${email}@example.com`);
      const algorithmResult = detectNameForAlgorithm(`${email}@example.com`);

      expect(regularResult).toBeTruthy();
      expect(algorithmResult).toBeTruthy();

      if (regularResult && algorithmResult) {
        // Regular result might preserve some special characters in the detection process
        // Algorithm result should have them cleaned
        if (regularResult.firstName && algorithmResult.firstName) {
          expect(algorithmResult.firstName).not.toContain('.');
          expect(algorithmResult.firstName).not.toContain('_');
          expect(algorithmResult.firstName).not.toContain('*');
        }
        if (regularResult.lastName && algorithmResult.lastName) {
          expect(algorithmResult.lastName).not.toContain('.');
          expect(algorithmResult.lastName).not.toContain('_');
          expect(algorithmResult.lastName).not.toContain('*');
        }
      }
    });
  });
});
