/**
 * Spam detection helper for email addresses.
 * Detects artificially generated email addresses using linguistic heuristics.
 */

/**
 * Checks if an email address appears to be spam/generated.
 *
 * Spam characteristics detected:
 * - Unusually long local part (16+ characters before @)
 * - Low vowel ratio (< 35%) - real words typically have higher vowel density
 * - High uppercase ratio (> 30%) - indicating random capitalization
 * - High consonant cluster ratio - many consecutive consonants
 * - Repeated character patterns (e.g., "aaaa", "xxx")
 * - Random-looking character sequences
 *
 * @param email - The email address to validate
 * @returns true if the email appears to be spam, false otherwise
 *
 * @example
 * isSpamEmail("FalDxivcRyvFRbMU@example.com") // true
 * isSpamEmail("john.doe@example.com") // false
 */
export function isSpamEmail(email: string): boolean {
  if (typeof email !== 'string') return false;

  // Extract local part (before @)
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return false;

  const localPart = email.slice(0, atIndex);

  // Must be a minimum length to analyze
  if (localPart.length < 16) return false;

  // Remove common separators and dots for analysis
  const cleaned = localPart.replace(/[._+-]/g, '');

  // Must have enough characters after removing separators
  if (cleaned.length < 12) return false;

  // Only letters and numbers allowed in cleaned version
  if (!/^[A-Za-z0-9]+$/.test(cleaned)) return false;

  // Extract just the letters for linguistic analysis
  const lettersOnly = cleaned.replace(/[0-9]/g, '');
  if (lettersOnly.length < 10) return false;

  // Vowel ratio calculator
  function vowelRatio(str: string) {
    const vowels = (str.match(/[aeiouAEIOU]/g) || []).length;
    return vowels / str.length;
  }

  // Uppercase ratio calculator
  function uppercaseRatio(str: string) {
    const uppercase = (str.match(/[A-Z]/g) || []).length;
    return uppercase / str.length;
  }

  // Check for repeated character patterns (e.g., "aaa", "xxx", "111")
  function hasRepeatedPatterns(str: string): boolean {
    const patterns = /(.)\1{2,}/g;
    const matches = str.match(patterns);
    return matches !== null && matches.length > 0;
  }

  // Check for consonant clusters (3+ consecutive consonants)
  function hasConsonantClusters(str: string): boolean {
    const clusters = str.match(/[^aeiouAEIOU]{3,}/g);
    return clusters !== null && clusters.length > 0;
  }

  // Check for alternating case pattern (e.g., QqWwEeRrTt)
  function hasAlternatingCase(str: string): boolean {
    if (str.length < 8) return false;

    let alternatingChanges = 0;
    for (let i = 1; i < str.length; i++) {
      const prevIsUpper = str[i - 1] >= 'A' && str[i - 1] <= 'Z';
      const currIsUpper = str[i] >= 'A' && str[i] <= 'Z';

      // Check if case changed from previous character
      if (prevIsUpper !== currIsUpper) {
        alternatingChanges++;
      }
    }

    // If more than 70% of character positions show alternating case, it's suspicious
    return alternatingChanges / str.length > 0.7;
  }

  const vowelR = vowelRatio(lettersOnly);
  const upperR = uppercaseRatio(lettersOnly);

  // Check for alternating case pattern first (strong spam signal)
  if (hasAlternatingCase(lettersOnly)) return true;

  // Strong signal: low vowel ratio
  if (vowelR > 0.35) return false;

  // Must have uppercase characters (random capitalization is common in spam)
  if (upperR < 0.15) return false;

  // Check for repeated patterns
  if (hasRepeatedPatterns(localPart)) return true;

  // Check for consonant clusters
  if (hasConsonantClusters(lettersOnly)) return true;

  // Additional checks for very long local parts with low vowel ratio
  if (cleaned.length >= 20 && vowelR < 0.25) return true;

  return true;
}

/**
 * Checks if an email address local part appears to be spam/generated.
 * This is an alias for isSpamEmail with a more descriptive name.
 *
 * @param email - The email address to validate
 * @returns true if the email local part appears to be spam, false otherwise
 */
export function isSpamEmailLocalPart(email: string): boolean {
  return isSpamEmail(email);
}
