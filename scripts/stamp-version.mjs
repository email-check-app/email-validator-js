#!/usr/bin/env bun
/**
 * Stamp an explicit version into root package.json before `bun run build`.
 * Used by scripts/release-local.mjs so a local manual release lands on the
 * same version number in package.json that CI's semantic-release would
 * have stamped via @semantic-release/npm.
 *
 * Argument is a valid semver string, e.g. `4.1.0` or `4.1.0-beta.1`.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`stamp-version: invalid version arg "${version}"`);
  process.exit(1);
}

const pkgPath = resolve(ROOT, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
pkg.version = version;
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`✓ stamped version ${version} into package.json`);
