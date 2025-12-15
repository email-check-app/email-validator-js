/**
 * Environment-aware test configuration utilities
 */

export enum TestEnvironment {
  CI = 'ci',
  LOCAL = 'local',
  SLOW = 'slow',
}

export class TestEnvironmentUtils {
  /**
   * Detect current test environment
   */
  static detectEnvironment(): TestEnvironment {
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
  static shouldSkipIntegrationTests(): boolean {
    const env = TestEnvironmentUtils.detectEnvironment();
    return (
      env === TestEnvironment.CI ||
      process.env.SKIP_INTEGRATION_TESTS === 'true' ||
      process.env.SKIP_NETWORK_TESTS === 'true'
    );
  }

  /**
   * Check if network tests should be skipped
   */
  static shouldSkipNetworkTests(): boolean {
    return process.env.SKIP_NETWORK_TESTS === 'true' || process.env.OFFLINE === 'true';
  }

  /**
   * Get appropriate timeout for test type and environment
   */
  static getTimeout(baseTimeout: number, multiplier: number = 1): number {
    const env = TestEnvironmentUtils.detectEnvironment();

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
  static getTestTimeout(category: 'fast' | 'slow' | 'integration' | 'network'): number {
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

    const env = TestEnvironmentUtils.detectEnvironment();
    const base = baseTimeouts[category];
    const multiplier = multipliers[env][category];

    return Math.floor(base * multiplier);
  }

  /**
   * Determine if test should run in current environment
   */
  static shouldRunTest(testConfig: {
    environments?: TestEnvironment[];
    skipInCI?: boolean;
    skipInLocal?: boolean;
    requiresNetwork?: boolean;
  }): boolean {
    const { environments, skipInCI, skipInLocal, requiresNetwork } = testConfig;
    const env = TestEnvironmentUtils.detectEnvironment();

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
    if (requiresNetwork && TestEnvironmentUtils.shouldSkipNetworkTests()) {
      return false;
    }

    return true;
  }

  /**
   * Create a test wrapper that handles environment-specific logic
   */
  static createConditionalTest(
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
      timeout: testConfig.timeoutCategory ? TestEnvironmentUtils.getTestTimeout(testConfig.timeoutCategory) : undefined,
    };
  }

  /**
   * Log environment information for debugging
   */
  static logEnvironmentInfo(): void {
    const env = TestEnvironmentUtils.detectEnvironment();
    console.log(`[TestEnvironment] Running in ${env} mode`);
    console.log(
      `[TestEnvironment] Integration tests: ${TestEnvironmentUtils.shouldSkipIntegrationTests() ? 'SKIPPED' : 'ENABLED'}`
    );
    console.log(
      `[TestEnvironment] Network tests: ${TestEnvironmentUtils.shouldSkipNetworkTests() ? 'SKIPPED' : 'ENABLED'}`
    );
    console.log(`[TestEnvironment] Fast timeout: ${TestEnvironmentUtils.getTestTimeout('fast')}ms`);
    console.log(`[TestEnvironment] Integration timeout: ${TestEnvironmentUtils.getTestTimeout('integration')}ms`);
    console.log(`[TestEnvironment] Network timeout: ${TestEnvironmentUtils.getTestTimeout('network')}ms`);
  }
}

// Export a default instance for convenience
export const testEnv = TestEnvironmentUtils;
