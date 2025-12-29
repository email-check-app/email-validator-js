import { isSpamEmail, isSpamEmailLocalPart, isSpamName } from '../src';

describe('Spam Detection', () => {
  describe('isSpamName', () => {
    // Known spam names from examples
    const spamNames = [
      'FalDxivcRyvFRbMUOedpn KAtCqqnzliZxRoThK',
      'QqWwEeRrTtYyUuIiOoPpAaSsDdFfGgHhJjKkLlZzXxCcVvBbNnMm QqWwEeRrTtYyUuIiOoPpAaSsDdFfGgHhJjKkLlZzXxCcVvBbNnMm',
    ];

    // Legitimate names
    const legitimateNames = [
      'John Doe',
      'Jane Smith',
      'Michael Johnson',
      'Sarah Williams',
      'David Brown',
      'Emily Davis',
      'Robert Miller',
      'Jennifer Wilson',
      'William Moore',
      'Jessica Taylor',
      'Christopher Anderson',
      'Ashley Thomas',
      'Matthew Jackson',
      'Stephanie White',
      'Andrew Harris',
      'Joshua Martin',
      'Nicole Thompson',
      'Daniel Garcia',
      'Melissa Martinez',
      'Kevin Robinson',
      'Michelle Clark',
      'Brian Rodriguez',
      'Samantha Lewis',
      'Joseph Lee',
      'Elizabeth Walker',
      'Ryan Hall',
      'Amanda Allen',
      'Eric Young',
      'Kimberly King',
      'Steven Wright',
      'Nancy Scott',
      'Jeffrey Green',
      'Laura Baker',
      'Mark Adams',
      'Rebecca Nelson',
      'Paul Hill',
      'Katherine Moore',
      'Thomas Mitchell',
      'Sharon Roberts',
      'Kenneth Carter',
      'Amy Phillips',
      'Ronald Campbell',
      'Rachel Evans',
      'Timothy Turner',
      'Deborah Torres',
      'Jason Parker',
      'Dorothy Collins',
      'Jeffrey Edwards',
      'Lisa Stewart',
      'Jeremy Morris',
      'Maria Murphy',
      'Justin Cook',
      'Kathleen Rogers',
      'Christian Morgan',
      'Janet Peterson',
      'Brian Cooper',
      'Carolyn Reed',
      'Aaron Bailey',
      'Nicole Bell',
      'Adam Gomez',
      'Mary Kelly',
      'Peter Howard',
      'Kristin Ward',
      'Nathan Cox',
      'Catherine Diaz',
      'Douglas Richardson',
      'Christine Wood',
      'Zachary Watson',
      'Debra Brooks',
      'Patrick Bennett',
      'Jacqueline Gray',
      'Katherine James',
      'Samuel Reyes',
      'Justin Cruz',
      'Anna Hughes',
      'Ryan Price',
      'Sharon Myers',
      'Joshua Long',
      'Brenda Foster',
      'Jonathon Sanders',
      'Jennifer Ross',
      'Justin Morales',
      'Laura Powell',
      'Thomas Sullivan',
      'Kristin Russell',
      'Randy Ortiz',
      'Victoria Jenkins',
      'Katherine Gutierrez',
      'Ryan Perry',
      'Christina Butler',
      'Brandon Barnes',
      'Samantha Fisher',
    ];

    describe('should detect spam names', () => {
      spamNames.forEach((name) => {
        it(`detects "${name.substring(0, 30)}..." as spam`, () => {
          expect(isSpamName(name)).toBe(true);
        });
      });
    });

    describe('should not flag legitimate names', () => {
      legitimateNames.forEach((name) => {
        it(`does not flag "${name}" as spam`, () => {
          expect(isSpamName(name)).toBe(false);
        });
      });
    });

    describe('edge cases', () => {
      it('returns false for single word names', () => {
        expect(isSpamName('Christopher')).toBe(false);
      });

      it('returns false for names with three parts', () => {
        expect(isSpamName('John Jacob Jingleheimer Schmidt')).toBe(false);
      });

      it('handles empty string', () => {
        expect(isSpamName('')).toBe(false);
      });

      it('handles non-string input', () => {
        expect(isSpamName(null as any)).toBe(false);
        expect(isSpamName(undefined as any)).toBe(false);
        expect(isSpamName(123 as any)).toBe(false);
      });

      it('handles names with punctuation', () => {
        expect(isSpamName('John Doe,')).toBe(false);
      });

      it('handles names with trailing period', () => {
        expect(isSpamName('Dr. John Doe Jr.')).toBe(false);
      });

      it('handles names with extra whitespace', () => {
        expect(isSpamName('John  Doe')).toBe(false);
      });
    });

    describe('characteristics of spam names', () => {
      it('rejects names with numbers in either part', () => {
        expect(isSpamName('John123 Doe456')).toBe(false);
      });

      it('rejects names with symbols', () => {
        expect(isSpamName('John@Doe')).toBe(false);
      });

      it('requires minimum length of 16 characters per part', () => {
        expect(isSpamName('John Doe')).toBe(false); // Both parts under 16
      });

      it('requires uppercase letters in both parts', () => {
        expect(isSpamName('alllowercase alllowercas')).toBe(false);
      });
    });
  });

  describe('isSpamEmail', () => {
    // Known spam email patterns
    const spamEmails = [
      'FalDxivcRyvFRbMUOedpn@example.com',
      'QqWwEeRrTtYyUuIiOoPpAa@example.com',
      'KAtCqqnzliZxRoThK@test.com',
      'XCVBNMLKJHGFDSAPOUYTRE@domain.org',
    ];

    // Legitimate email patterns
    const legitimateEmails = [
      'john.doe@example.com',
      'jane.smith@test.com',
      'michael.johnson@domain.org',
      'sarah.williams@company.com',
      'david.brown@email.com',
      'emily.davis@test.org',
      'bob@example.com',
      'alice@test.com',
      'short@domain.com',
      'a.b@example.com',
      'user.name@company.co.uk',
      'first.last@domain.com',
    ];

    describe('should detect spam email addresses', () => {
      spamEmails.forEach((email) => {
        it(`detects "${email}" as spam`, () => {
          expect(isSpamEmail(email)).toBe(true);
        });
      });
    });

    describe('should not flag legitimate email addresses', () => {
      legitimateEmails.forEach((email) => {
        it(`does not flag "${email}" as spam`, () => {
          expect(isSpamEmail(email)).toBe(false);
        });
      });
    });

    describe('edge cases', () => {
      it('handles email without @ symbol', () => {
        expect(isSpamEmail('notanemail')).toBe(false);
      });

      it('handles empty string', () => {
        expect(isSpamEmail('')).toBe(false);
      });

      it('handles non-string input', () => {
        expect(isSpamEmail(null as any)).toBe(false);
        expect(isSpamEmail(undefined as any)).toBe(false);
        expect(isSpamEmail(123 as any)).toBe(false);
      });

      it('handles emails with separators', () => {
        expect(isSpamEmail('john.doe.smith@example.com')).toBe(false);
      });

      it('handles emails with plus signs', () => {
        expect(isSpamEmail('john.doe+tag@example.com')).toBe(false);
      });

      it('requires minimum local part length of 16 characters', () => {
        expect(isSpamEmail('short@example.com')).toBe(false);
      });
    });
  });

  describe('isSpamEmailLocalPart', () => {
    it('is an alias for isSpamEmail', () => {
      const testEmail = 'FalDxivcRyvFRbMUOedpn@example.com';
      expect(isSpamEmailLocalPart(testEmail)).toBe(isSpamEmail(testEmail));
    });

    it('detects spam in local part regardless of domain', () => {
      expect(isSpamEmailLocalPart('FalDxivcRyvFRbMUOedpn@any-domain.com')).toBe(true);
    });

    it('does not flag legitimate emails', () => {
      expect(isSpamEmailLocalPart('john.doe@example.com')).toBe(false);
    });
  });
});
