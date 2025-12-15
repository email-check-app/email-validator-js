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
 * Check if integration tests should be skipped
 */
export function shouldSkipIntegrationTests(): boolean {
  const env = detectEnvironment();
  return (
    env === TestEnvironment.CI ||
    process.env.SKIP_INTEGRATION_TESTS === 'true' ||
    process.env.SKIP_NETWORK_TESTS === 'true'
  );
}

/**
 * Check if network tests should be skipped
 */
export function shouldSkipNetworkTests(): boolean {
  return process.env.SKIP_NETWORK_TESTS === 'true' || process.env.OFFLINE === 'true';
}

/**
 * Get appropriate timeout for test type and environment
 */
export function getTimeout(baseTimeout: number, multiplier: number = 1): number {
  const env = detectEnvironment();

  switch (env) {
    case TestEnvironment.CI:
      // CI gets standard timeouts (usually optimized)
      return baseTimeout * multiplier;
    case TestEnvironment.SLOW:
      // Slow environment gets extended timeouts
      return baseTimeout * multiplier * 2;
    case TestEnvironment.LOCAL:
    default:
      // Local environment gets slightly extended timeouts for reliability
      return baseTimeout * multiplier * 1.5;
  }
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

/**
 * Determine if test should run in current environment
 */
export function shouldRunTest(testConfig: {
  environments?: TestEnvironment[];
  skipInCI?: boolean;
  skipInLocal?: boolean;
  requiresNetwork?: boolean;
}): boolean {
  const { environments, skipInCI, skipInLocal, requiresNetwork } = testConfig;
  const env = detectEnvironment();

  // Check environment restrictions
  if (environments && !environments.includes(env)) {
    return false;
  }

  // Check CI skip
  if (skipInCI && env === TestEnvironment.CI) {
    return false;
  }

  // Check local skip
  if (skipInLocal && env === TestEnvironment.LOCAL) {
    return false;
  }

  // Check network requirements
  if (requiresNetwork && shouldSkipNetworkTests()) {
    return false;
  }

  return true;
}

/**
 * Create a test wrapper that handles environment-specific logic
 */
export function createConditionalTest(
  testName: string,
  testConfig: {
    environments?: TestEnvironment[];
    skipInCI?: boolean;
    skipInLocal?: boolean;
    requiresNetwork?: boolean;
    timeoutCategory?: 'fast' | 'slow' | 'integration' | 'network';
  },
  testFn: () => Promise<void> | void
): { name: string; fn: () => Promise<void> | void; timeout?: number } {
  return {
    name: testName,
    fn: testFn,
    timeout: testConfig.timeoutCategory ? getTestTimeout(testConfig.timeoutCategory) : undefined,
  };
}

/**
 * Log environment information for debugging
 */
export function logEnvironmentInfo(): void {
  const env = detectEnvironment();
  console.log(`[TestEnvironment] Running in ${env} mode`);
  console.log(`[TestEnvironment] Integration tests: ${shouldSkipIntegrationTests() ? 'SKIPPED' : 'ENABLED'}`);
  console.log(`[TestEnvironment] Network tests: ${shouldSkipNetworkTests() ? 'SKIPPED' : 'ENABLED'}`);
  console.log(`[TestEnvironment] Fast timeout: ${getTestTimeout('fast')}ms`);
  console.log(`[TestEnvironment] Integration timeout: ${getTestTimeout('integration')}ms`);
  console.log(`[TestEnvironment] Network timeout: ${getTestTimeout('network')}ms`);
}
