# Releases

How `@emailcheck/email-validator-js` gets from a merged PR to npm.

## TL;DR

1. Merge a conventional-commit PR (`feat:` / `fix:` / `perf:`) into `master`
   (or `develop` for a `*-beta.N` pre-release).
2. The Release workflow validates, computes the next version, builds, and
   publishes to npm with sigstore provenance.
3. For one-off ships when CI isn't available, use `bun run release:local`.

## Versioning

semantic-release computes the next version from conventional commits since
the last tag. In CI, `@semantic-release/npm` stamps that version into
`package.json` and publishes. Locally, `scripts/release-local.mjs` does
the same stamp-then-publish via `scripts/stamp-version.mjs` so the on-disk
flow matches.

## Branches

Configured in [`.releaserc.json`](./.releaserc.json):

| Branch            | Channel     | Behavior                        |
| ----------------- | ----------- | ------------------------------- |
| `master` / `main` | latest      | Stable releases (`x.y.z`)       |
| `next`            | next        | Pre-stable next-major work      |
| `next-major`      | next-major  | Same                            |
| `develop`         | beta        | Pre-releases tagged `*-beta.N`  |
| `beta`            | beta        | Same                            |
| `alpha`           | alpha       | Pre-releases tagged `*-alpha.N` |
| `N.x` / `N.y.x`   | maintenance | Backport tracks                 |

## Conventional commits → release type

| Commit type                                                | Release |
| ---------------------------------------------------------- | ------- |
| `feat:`                                                    | minor   |
| `fix:` / `perf:` / `refactor:` / `revert:`                 | patch   |
| `BREAKING CHANGE:` footer or `breaking:` type              | major   |
| `docs:` / `style:` / `test:` / `build:` / `ci:` / `chore:` | none    |

## CI release — provenance + `NPM_TOKEN`

CI authenticates with the `NPM_TOKEN` secret and publishes with
[sigstore provenance](https://docs.npmjs.com/generating-provenance-statements)
because:

- The source repo is **public**, so npm accepts provenance attestations.
- The Release workflow grants `id-token: write` so GitHub mints an OIDC
  token for sigstore.
- `package.json#publishConfig.provenance: true` flips provenance on for
  every CI publish.

### One-time setup

1. On npmjs.com → "Access Tokens" → create a **granular automation token**
   with **Read + Publish** on `@emailcheck/email-validator-js`.
2. GitHub: repo → Settings → Secrets and variables → Actions → add
   `NPM_TOKEN`.
3. The npm account must already be a maintainer on
   `@emailcheck/email-validator-js`.

## Local dry-run (semantic-release)

```bash
bun run typecheck && bun run test
bun run build
bun run release:dry              # full semantic-release dry-run (no publish, no tags)
```

## Releasing locally (without CI)

For one-off releases when CI is unavailable or to ship a pre-release
channel manually. The locally-cut publish skips provenance (provenance
needs the CI OIDC token); CI publishes remain attested.

### One-time setup

```bash
npm whoami        # confirm you're logged in
npm login         # if the above failed
```

Your npm account must be a maintainer on `@emailcheck/email-validator-js`.

### Release a version

```bash
# 1. Dry-run first — stamps, builds, and runs `npm publish --dry-run`.
bun run release:local 4.1.0 --dry-run

# 2. Real publish at 4.1.0:
bun run release:local 4.1.0

# 3. Pre-release with a custom dist-tag (publish under `beta`):
bun run release:local 4.2.0-beta.1 --tag beta

# 4. Commit + tag so future CI runs see the right baseline:
git add package.json
git commit -m "chore(release): v4.1.0"
git tag v4.1.0
git push --follow-tags
```

`scripts/release-local.mjs` runs:

1. `npm whoami` — fails fast if you're not logged in.
2. `scripts/stamp-version.mjs <version>` — writes the version into root `package.json`.
3. `bun run build` — full rollup build (CJS + ESM + serverless + CLI).
4. `npm publish --access public --no-provenance` — publishes without
   sigstore attestation (only CI has the OIDC token).

## Manual override (CI)

Actions → "Release" → "Run workflow". The optional `dry-run: true` input
runs everything except the actual publish + tag.

## Failure modes

- **`No release published`** — only `chore` / `docs` / `test` commits since
  the last tag. Add a `feat:` or `fix:` if a release was expected.
- **`E401 unauthorized`** — `NPM_TOKEN` (CI) or your local `npm login` is
  missing / expired / scoped too narrowly.
- **`E403 forbidden`** — your account isn't a maintainer on the package.
- **`Unsupported GitHub Actions source repository visibility: "private"`** —
  the source repo was made private. Drop `publishConfig.provenance: true`
  and `id-token: write`; provenance only works for public repos.
- **Local publish errors about OIDC / `ACTIONS_ID_TOKEN_REQUEST_URL`** —
  `--no-provenance` was dropped from `release-local.mjs`. Local publishes
  can't generate provenance.

## Files involved

- [`.releaserc.json`](./.releaserc.json) — semantic-release config
- [`.github/workflows/release.yml`](./.github/workflows/release.yml) — CI pipeline
- [`.github/workflows/validate.yml`](./.github/workflows/validate.yml) — reusable checks
- [`scripts/stamp-version.mjs`](./scripts/stamp-version.mjs) — writes the version into `package.json`
- [`scripts/release-local.mjs`](./scripts/release-local.mjs) — local stamp → build → publish driver
