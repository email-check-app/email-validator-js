/**
 * Gate for tests that hit the real network. The default `bun test` run skips
 * them; set `INTEGRATION=1` in the env to opt in.
 */
import { describe } from 'bun:test';

const enabled = process.env.INTEGRATION === '1';

export const describeNet: typeof describe = enabled ? describe : (describe.skip as typeof describe);
