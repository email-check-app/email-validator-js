#!/usr/bin/env bun
/**
 * Local release helper: stamp version → build → `npm publish`. Mirrors the
 * version-stamping path CI takes via semantic-release, so locally-cut
 * releases land at the same version semantics CI would have computed.
 *
 * Usage:
 *   bun run release:local <version> [--dry-run] [--tag <dist-tag>]
 *
 * Examples:
 *   bun run release:local 4.1.0 --dry-run
 *   bun run release:local 4.1.0
 *   bun run release:local 4.2.0-beta.1 --tag beta
 *
 * Prerequisites (one-time):
 *   1. `npm whoami`  — must show your npm user.
 *   2. `npm login`   — if (1) failed.
 *   3. Your account must be a maintainer on `@emailcheck/email-validator-js`.
 *
 * Provenance: CI publishes with sigstore provenance (id-token: write +
 * publishConfig.provenance: true in package.json). Provenance requires the
 * GitHub Actions OIDC token, which doesn't exist locally — `npm publish`
 * outside CI would error out. This script passes `--no-provenance` so a
 * local publish completes without attestation. CI publishes remain
 * attested; only locally-cut releases skip provenance.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--") && a !== process.argv[1]);
const dryRun = args.includes("--dry-run");
const tagIdx = args.indexOf("--tag");
const distTag = tagIdx >= 0 ? args[tagIdx + 1] : null;

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("usage: bun run release:local <semver> [--dry-run] [--tag <dist-tag>]");
  console.error(`got: ${process.argv.slice(2).join(" ")}`);
  process.exit(1);
}

function run(cmd, runArgs, opts = {}) {
  console.log(`\n→ ${cmd} ${runArgs.join(" ")}`);
  const result = spawnSync(cmd, runArgs, { stdio: "inherit", cwd: opts.cwd ?? ROOT });
  if (result.status !== 0) {
    console.error(`\n✗ ${cmd} ${runArgs.join(" ")} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// Sanity-check npm auth before doing real work. Skip on dry-run since
// `npm publish --dry-run` doesn't actually contact the registry.
if (!dryRun) {
  const who = spawnSync("npm", ["whoami"], { stdio: "pipe" });
  if (who.status !== 0) {
    console.error("✗ `npm whoami` failed — run `npm login` first.");
    process.exit(1);
  }
  console.log(`✓ npm user: ${who.stdout.toString().trim()}`);
}

console.log(
  `\n=== Local release: v${version}${dryRun ? " (dry run)" : ""}${distTag ? ` [tag=${distTag}]` : ""} ===`,
);

// 1. Stamp version into root package.json.
run("bun", ["run", "scripts/stamp-version.mjs", version]);

// 2. Build (rollup CJS + ESM + serverless + CLI).
run("bun", ["run", "build"]);

// 3. Publish from repo root. `--no-provenance` overrides publishConfig.provenance
//    (which is on for CI) so the local publish doesn't require an OIDC token.
const publishArgs = ["publish", "--access", "public", "--no-provenance"];
if (dryRun) publishArgs.push("--dry-run");
if (distTag) publishArgs.push("--tag", distTag);

run("npm", publishArgs);

if (dryRun) {
  console.log(`\n✓ Dry-run complete. Re-run without --dry-run to publish.`);
} else {
  console.log(`\n✓ Released v${version}.`);
  console.log(`  Don't forget to:`);
  console.log(`    git add package.json && git commit -m "chore(release): v${version}"`);
  console.log(`    git tag v${version} && git push --follow-tags`);
}
