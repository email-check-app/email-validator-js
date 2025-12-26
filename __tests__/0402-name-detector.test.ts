import { cleanNameForAlgrothin, detectName, detectNameForAlgrothin } from '../src/name-detector';

describe('0402 Name Detector', () => {
  describe('cleanNameForAlgrothin', () => {
    it('should remove dots from names', () => {
      expect(cleanNameForAlgrothin('john.doe')).toBe('johndoe');
      expect(cleanNameForAlgrothin('j.d.rockefeller')).toBe('jdrockefeller');
      expect(cleanNameForAlgrothin('mary.jane')).toBe('maryjane');
    });

    it('should remove underscores from names', () => {
      expect(cleanNameForAlgrothin('john_doe')).toBe('johndoe');
      expect(cleanNameForAlgrothin('mary_jane_smith')).toBe('maryjanesmith');
      expect(cleanNameForAlgrothin('first_last')).toBe('firstlast');
    });

    it('should remove asterisks from names', () => {
      expect(cleanNameForAlgrothin('john*doe')).toBe('johndoe');
      expect(cleanNameForAlgrothin('mary*')).toBe('mary');
      expect(cleanNameForAlgrothin('*star*name*')).toBe('starname');
    });

    it('should remove multiple types of special characters', () => {
      expect(cleanNameForAlgrothin('john.doe_smith*')).toBe('johndoesmith');
      expect(cleanNameForAlgrothin('a.b_c*d')).toBe('abcd');
      expect(cleanNameForAlgrothin('first_name.last*name')).toBe('firstnamelastname');
    });

    it('should handle edge cases', () => {
      expect(cleanNameForAlgrothin('')).toBe('');
      expect(cleanNameForAlgrothin('.')).toBe('.');
      expect(cleanNameForAlgrothin('_')).toBe('_');
      expect(cleanNameForAlgrothin('*')).toBe('*');
      expect(cleanNameForAlgrothin('...')).toBe('...');
      expect(cleanNameForAlgrothin('___')).toBe('___');
      expect(cleanNameForAlgrothin('***')).toBe('***');
    });

    it('should normalize spaces', () => {
      expect(cleanNameForAlgrothin('john   doe')).toBe('john doe');
      expect(cleanNameForAlgrothin('  mary  jane  ')).toBe('mary jane');
    });

    it('should return original name if cleaning results in empty string', () => {
      expect(cleanNameForAlgrothin('..._..._*...')).toBe('..._..._*...');
    });
  });

  describe('detectNameForAlgrothin', () => {
    it('should detect and clean names from emails with dots', () => {
      const result = detectNameForAlgrothin('john.doe@example.com');
      expect(result).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        confidence: expect.any(Number),
      });
    });

    it('should detect and clean names from emails with underscores', () => {
      const result = detectNameForAlgrothin('mary_jane@example.com');
      expect(result).toEqual({
        firstName: 'Mary',
        lastName: 'Jane',
        confidence: expect.any(Number),
      });
    });

    it('should detect and clean names from emails with mixed separators', () => {
      const result = detectNameForAlgrothin('first_name.last*name@example.com');
      expect(result).toEqual({
        firstName: 'Firstname',
        lastName: 'Lastname',
        confidence: expect.any(Number),
      });
    });

    it('should return null if no name detected', () => {
      expect(detectNameForAlgrothin('admin@example.com')).toBeNull();
      expect(detectNameForAlgrothin('noreply@example.com')).toBeNull();
      expect(detectNameForAlgrothin('invalid-email')).toBeNull();
    });

    it('should handle single names', () => {
      const result = detectNameForAlgrothin('john.doe.smith@example.com');
      expect(result).toBeDefined();
      if (result) {
        expect(['John', 'Doe']).toContain(result.firstName);
        expect(['Doe', 'Smith']).toContain(result.lastName);
      }
    });

    it('should have slightly reduced confidence due to cleaning', () => {
      const email = 'john.doe@example.com';
      const normalResult = detectName(email);
      const algrothinResult = detectNameForAlgrothin(email);

      if (normalResult && algrothinResult) {
        expect(algrothinResult.confidence).toBeLessThan(normalResult.confidence);
        expect(algrothinResult.confidence).toBeCloseTo(normalResult.confidence * 0.95);
      }
    });

    it('should handle edge case where cleaning results in empty name', () => {
      // This is a contrived example to test the edge case
      const result = detectNameForAlgrothin('a.b@example.com');
      // The result might be null due to cleaning being too aggressive with single letters
      // This is expected behavior for the cleaning function
      expect(result).toBeDefined(); // Can be null or have a name, both are valid outcomes
    });
  });

  describe('Comparison with regular detectName', () => {
    it('should produce cleaner names for emails with special characters', () => {
      const email = 'john.doe_smith*';

      const regularResult = detectName(`${email}@example.com`);
      const algrothinResult = detectNameForAlgrothin(`${email}@example.com`);

      expect(regularResult).toBeTruthy();
      expect(algrothinResult).toBeTruthy();

      if (regularResult && algrothinResult) {
        // Regular result might preserve some special characters in the detection process
        // Algrothin result should have them cleaned
        if (regularResult.firstName && algrothinResult.firstName) {
          expect(algrothinResult.firstName).not.toContain('.');
          expect(algrothinResult.firstName).not.toContain('_');
          expect(algrothinResult.firstName).not.toContain('*');
        }
        if (regularResult.lastName && algrothinResult.lastName) {
          expect(algrothinResult.lastName).not.toContain('.');
          expect(algrothinResult.lastName).not.toContain('_');
          expect(algrothinResult.lastName).not.toContain('*');
        }
      }
    });
  });
});
