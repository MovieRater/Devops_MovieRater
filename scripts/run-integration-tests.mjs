import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// CI runs on Linux with Bash. Discover every shell test, including nested suites.
const files = [...globSync('tests/**/*.{test,spec}.sh')].sort();
if (!files.length) {
  console.error('No integration tests found under tests/.');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  console.log(`Running integration suite: ${file}`);
  const result = spawnSync('bash', [file], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`Integration suite failed: ${file}${result.error ? ` (${result.error.message})` : ''}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
