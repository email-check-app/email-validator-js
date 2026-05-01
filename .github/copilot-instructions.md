# GitHub Copilot Instructions

This repository keeps all agent operating rules, code style, and code patterns
in **[AGENTS.md](../AGENTS.md)** at the repo root. Read that file first before
suggesting code changes.

Highlights:

- Bun is the canonical toolchain. No yarn / npm scripts / jest / ts-jest.
- TypeScript strict; zero `any` and zero non-null assertions in `src/`.
- Early returns + optional chaining + nullish coalescing over nested
  conditionals.
- Tests live under `__tests__/` and use `bun:test`. Real-network tests live
  in `__tests__/integration/` and are gated by `INTEGRATION=1`.

See [AGENTS.md](../AGENTS.md) for the full rule set and links to
product/feature docs.
