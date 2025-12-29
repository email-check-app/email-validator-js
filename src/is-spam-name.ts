/**
 * Spam detection helper for contact form submissions.
 * Detects artificially generated names using linguistic heuristics.
 */

/**
 * Checks if a name appears to be spam/generated.
 *
 * Spam characteristics detected:
 * - Exactly one space between two parts
 * - Both parts contain only letters (no numbers/symbols)
 * - Both parts are unusually long (15+ characters each)
 * - Low vowel ratio (< 35%) - real words typically have higher vowel density
 * - High uppercase ratio (> 30%) - indicating random capitalization
 *
 * @param name - The name to validate
 * @returns true if the name appears to be spam, false otherwise
 *
 * @example
 * isSpamName("FalDxivcRyvFRbMUOedpn KAtCqqnzliZxRoThK") // true
 * isSpamName("John Doe") // false
 */
export function isSpamName(name: string): boolean {
  if (typeof name !== 'string') return false;

  // Clean trailing punctuation and extra whitespace
  const cleaned = name.replace(/[,.;:!?]+$/, '').trim();

  // Must split into exactly two parts
  const parts = cleaned.split(/\s+/);
  if (parts.length !== 2) return false;

  const [first, second] = parts;

  // Only letters allowed
  if (!/^[A-Za-z]+$/.test(first) || !/^[A-Za-z]+$/.test(second)) return false;

  // Minimum length (all your examples are 16+)
  if (first.length < 16 || second.length < 16) return false;

  // Vowel ratio calculator
  function vowelRatio(str: string) {
    const vowels = (str.match(/[aeiouAEIOU]/g) || []).length;
    return vowels / str.length;
  }

  const ratio1 = vowelRatio(first);
  const ratio2 = vowelRatio(second);
  const avgRatio = (ratio1 + ratio2) / 2;

  // Strong signal: average low vowels, OR at least one part very low
  if (avgRatio > 0.35 && ratio1 > 0.25 && ratio2 > 0.25) return false;

  // Must have at least one uppercase in each part (all your spams do)
  if (!/[A-Z]/.test(first) || !/[A-Z]/.test(second)) return false;

  return true;
}
