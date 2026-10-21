import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-vulnerabilities.mjs', import.meta.url));
const finding = (severity, fixed) => ({ Severity: severity, VulnerabilityID: 'CVE-FIXTURE', PkgName: 'fixture', ...(fixed === undefined ? {} : { FixedVersion: fixed }) });

function check(report) {
  const directory = mkdtempSync(join(tmpdir(), 'movierater-policy-test-'));
  try {
    const path = join(directory, 'report.json');
    writeFileSync(path, typeof report === 'string' ? report : JSON.stringify(report));
    return spawnSync(process.execPath, [script, path], { encoding: 'utf8', timeout: 5000 });
  } finally {
    assert(realpathSync(directory).startsWith(realpathSync(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('clean Trivy reports pass, including a valid zero-findings report', () => {
  assert.equal(check({ SchemaVersion: 2, Results: [] }).status, 0);
  assert.equal(check({ SchemaVersion: 2, Results: [{ Target: 'fixture' }] }).status, 0);
});

test('unfixed HIGH is reported for review; fixable HIGH blocks', () => {
  const advisory = check({ SchemaVersion: 2, Results: [{ Vulnerabilities: [finding('HIGH')] }] });
  assert.equal(advisory.status, 0);
  assert.match(advisory.stdout, /1 unfixed HIGH/);
  assert.equal(check({ SchemaVersion: 2, Results: [{ Vulnerabilities: [finding('HIGH', '2.0')] }] }).status, 1);
});

test('all CRITICAL findings block, even without a published fix', () => {
  for (const fixed of [undefined, '', '2.0']) {
    assert.equal(check({ SchemaVersion: 2, Results: [{ Vulnerabilities: [finding('CRITICAL', fixed)] }] }).status, 1);
  }
});

test('malformed or incomplete scanner output fails closed', () => {
  const malformed = [
    '{bad json', {}, { SchemaVersion: 2 }, { SchemaVersion: 2, Results: null },
    { SchemaVersion: 999, Results: [] },
    ...[null, [], false, { Vulnerabilities: null }, { Vulnerabilities: {} }].map((result) => ({ SchemaVersion: 2, Results: [result] })),
    ...[null, {}, finding('unexpected'), { ...finding('HIGH'), FixedVersion: 2 },
      { ...finding('HIGH'), VulnerabilityID: '' }, { ...finding('HIGH'), PkgName: '' }]
      .map((entry) => ({ SchemaVersion: 2, Results: [{ Vulnerabilities: [entry] }] })),
  ];
  for (const report of malformed) {
    const result = check(report);
    assert.equal(result.status, 1, JSON.stringify(report));
    assert.match(result.stderr, /Vulnerability check failed:/);
  }
});

test('a missing scanner report cannot pass the gate', () => {
  assert.equal(spawnSync(process.execPath, [script, '__missing_trivy_report__.json'], { encoding: 'utf8', timeout: 5000 }).status, 1);
});
