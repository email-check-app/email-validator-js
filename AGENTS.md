# AGENTS.md

Operating rules for AI agents (Claude Code, Cursor, GitHub Copilot, etc.) and
human contributors working on this repo. **Code-style rules and code-pattern
conventions only** — product specs and feature docs live in the markdown files
linked at the bottom.

## Toolchain

- **Bun** is the canonical runtime / package manager / test runner. Never reach
  for `yarn`, `npm` install scripts, or `jest` / `ts-jest`.
- **Biome** handles lint + format. `biome.json` is the source of truth.
- **Rollup** builds the published CJS + ESM bundles via
  `rollup.config.cjs` and `rollup.config.serverless.cjs`.
- **TypeScript strict mode** for both `tsconfig.json` (src) and
  `tsconfig.test.json` (src + tests + examples).

## Code-style rules

### TypeScript

- **No `any`.** `unknown` + narrow as needed. The build enforces this — `src/`
  has zero `any`.
- **No non-null assertions** (`!`) in `src/`. If `metadata` is "always
  populated", make the field non-optional in the type. If you really need it,
  add a runtime guard plus a comment explaining why TS can't see it.
- Prefer **early returns** over nested conditionals. A function that opens with
  three `if`-checks should bail out of each rather than wrap the body in `else`
  blocks.
- Use **optional chaining** (`?.`) and **nullish coalescing** (`??`) instead of
  `&&` / `||` when the operand may be `null` / `undefined`. Especially never
  write `value || defaultValue` for `value: number | undefined` (`0` would
  collapse to the default).
- `interface` for public object shapes; `type` for unions / intersections /
  function types. Keep types in `src/types.ts` unless they're genuinely
  per-file (e.g. internal `ProbeResult` in `smtp-verifier.ts`).
- Public exports go through `src/index.ts`. Re-exports from `src/types.ts`
  flow through `export * from './types'`.

### Architecture

- **Class-based state machines** for protocol clients (see
  `SMTPProbeConnection`). Closures-with-`let` get hard to extend.
- **Lookup tables over `if`/`else if` chains** for dispatch on a string/value
  (see `TLD_REGEX` in `whois-parser.ts`).
- **Single source of truth for data:** `src/data/*.json`. Never inline 100-line
  arrays. Re-import them into a `Set` once at module load.
- **Pluggable cache** through `CacheStore<T>`. Don't add module-level mutable
  globals when a per-call argument fits.

### Tests

- Tests live in `__tests__/` and end in `.test.ts`. Real-network suites live
  in `__tests__/integration/` and are gated by `INTEGRATION=1`.
- One shared `__tests__/helpers/fake-net.ts` mocks `node:net` / `node:tls` /
  `node:dns`. Never roll a per-file FakeSocket — it leads to mock collisions.
- Use **`bun:test`** primitives (`describe`, `it`, `expect`, `mock`,
  `mock.module`). Don't reach for jest globals; the polyfill in
  `__tests__/helpers/setup.ts` is for compatibility, not new code.
- New tests must include **edge cases + false-positive guards**, not just the
  happy path. Refer to the existing pattern in `0112-smtp-error-parser.test.ts`
  for the orthogonality + boundary coverage style.

### Refactor discipline

- If you remove a publicly-exported symbol, **check the public API surface
  first** — `grep src/index.ts` for re-exports. Internal underuse is not the
  same as dead code.
- Move out-of-scope modules to `extras/<name>/` rather than leaving them in
  `src/`. They get their own opt-in test runner via `bun run test:extras`.
- Commit messages follow the pattern: `<type>: <imperative summary>` followed
  by a structured body if the change is non-trivial. See recent commits
  (`refactor: ...`, `chore: ...`) for examples.

### Comments

- **Comment the *why***, not the *what*. Names + types document the *what*.
- One-line comments above tricky regexes / heuristics with a reference link
  when applicable (RFC, vendor doc, prior incident).
- `★ Insight ─────────` blocks belong in PR descriptions and review comments,
  not in source.

## Workflow

1. **Branch off `develop`** with a `<type>/<topic>` name.
2. **`bun run typecheck && bun run test`** must be clean before pushing.
3. **`bun run build`** is the canonical build verification.
4. PRs target `develop`. Merging to `master` is handled by `semantic-release`
   on the release workflow.
5. Pre-commit hook runs Biome via `lint-staged`. If it fails, **fix the
   underlying issue** — don't `--no-verify`.

## Product / spec / how-to docs

These describe what the library does and how to use it. Keep product details
out of this file:

- [README.md](./README.md) — public API surface, quick start, examples
- [SERVERLESS.md](./SERVERLESS.md) — AWS Lambda / Vercel / Cloudflare adapters
- [examples/README.md](./examples/README.md) — runnable example index
- [CHANGELOG.md](./CHANGELOG.md) — release history (auto-managed by
  `semantic-release`)
- [LICENSE.md](./LICENSE.md) — Business Source License 1.1 terms

When you add a new feature or change behavior, update the relevant doc above —
not this file. This file only changes when the rules / conventions / toolchain
themselves change.
