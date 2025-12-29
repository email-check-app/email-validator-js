/**
 * Environment-aware test configuration utilities
 */

export enum TestEnvironment {
  CI = 'ci',
  LOCAL = 'local',
  SLOW = 'slow',
}

/**
 * Detect current test environment
 */
export function detectEnvironment(): TestEnvironment {
  if (process.env.CI === 'true') {
    return TestEnvironment.CI;
  }

  if (process.env.SLOW_TESTS === 'true') {
    return TestEnvironment.SLOW;
  }

  return TestEnvironment.LOCAL;
}

/**
 * Get test timeout based on test category
 */
export function getTestTimeout(category: 'fast' | 'slow' | 'integration' | 'network'): number {
  const baseTimeouts = {
    fast: 5000,
    slow: 15000,
    integration: 30000,
    network: 45000,
  };

  const multipliers = {
    [TestEnvironment.CI]: { fast: 1, slow: 1, integration: 1, network: 1 },
    [TestEnvironment.LOCAL]: { fast: 1.5, slow: 1.5, integration: 2, network: 2 },
    [TestEnvironment.SLOW]: { fast: 2, slow: 2, integration: 3, network: 3 },
  };

  const env = detectEnvironment();
  const base = baseTimeouts[category];
  const multiplier = multipliers[env][category];

  return Math.floor(base * multiplier);
}
