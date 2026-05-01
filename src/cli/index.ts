/**
 * `email-validate` CLI entry point.
 *
 * Wired into `package.json#bin` so `bun add -g @emailcheck/email-validator-js`
 * (or the npm equivalent) installs an `email-validate` command.
 *
 * Programmatic users can also import these helpers directly:
 *   import { parseArgs, run } from '@emailcheck/email-validator-js/cli';
 */
import { helpText, parseArgs } from './parse-args';
import { run } from './run';

export type { CliArgError, ParsedArgs, ParsedHelp, ParsedVersion, ParseResult } from './parse-args';
export { helpText, parseArgs } from './parse-args';
export type { CliRunDeps } from './run';
export { exitCodeFor, logFileNameFor, run } from './run';

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.kind === 'help') {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }
  if (parsed.kind === 'version') {
    // Read from the bundled package.json — the build copies it next to the bin.
    // For unbundled (Bun-direct) runs, fall back to a placeholder.
    try {
      const pkg = require('../../package.json') as { version: string };
      process.stdout.write(`${pkg.version}\n`);
    } catch {
      process.stdout.write('unknown\n');
    }
    return 0;
  }
  if (parsed.kind === 'error') {
    for (const msg of parsed.messages) process.stderr.write(`${msg}\n`);
    process.stderr.write(`\nRun with --help for usage.\n`);
    return parsed.exitCode;
  }

  return run(parsed);
}

// When invoked directly (not imported), run main() and propagate the exit code.
// `import.meta.main` works under Bun; for Node we check require.main.
const isDirectInvocation =
  // bun
  (typeof import.meta !== 'undefined' && (import.meta as { main?: boolean }).main === true) ||
  // node CommonJS bundle
  (typeof require !== 'undefined' && require.main === module);

if (isDirectInvocation) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(
        `Unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
      );
      process.exit(1);
    });
}
