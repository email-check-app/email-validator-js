/**
 * Test bootstrap. Runs once per test process via `bunfig.toml#test.preload`.
 *
 * Bun's test runner exposes `describe / it / test / expect / beforeAll /
 * beforeEach / afterAll / afterEach` as globals automatically — those work
 * without imports. The legacy `jest.*` namespace is NOT global, but several
 * test files still call `jest.fn()`, `jest.spyOn()`, `jest.clearAllMocks()`
 * etc. We polyfill that namespace from `bun:test` once here so we don't have
 * to mechanically rewrite every test.
 */
import { mock as bunMock, spyOn as bunSpyOn } from 'bun:test';

// Track every mock/spy created via the polyfill so `clearAllMocks` /
// `restoreAllMocks` can act on the same set jest would have.
const created: Array<{ mockClear?: () => void; mockReset?: () => void; mockRestore?: () => void }> = [];

function trackedFn(impl?: (...args: unknown[]) => unknown) {
  const m = bunMock(impl ?? (() => undefined));
  created.push(m as unknown as { mockClear?: () => void });
  return m;
}

function trackedSpy<T extends object, K extends keyof T>(target: T, key: K) {
  // bun:test spyOn signature: spyOn(target, key) — same as jest.
  const s = bunSpyOn(target, key as never);
  created.push(s as unknown as { mockClear?: () => void });
  return s;
}

const jestPolyfill = {
  fn: trackedFn,
  spyOn: trackedSpy,
  clearAllMocks() {
    for (const m of created) m.mockClear?.();
  },
  restoreAllMocks() {
    for (const m of created) m.mockRestore?.();
    created.length = 0;
  },
  resetAllMocks() {
    for (const m of created) m.mockReset?.();
  },
};

// Only install if not already present (some tests `import { jest } from 'bun:test'`).
const g = globalThis as unknown as { jest?: typeof jestPolyfill };
if (!g.jest) g.jest = jestPolyfill;
