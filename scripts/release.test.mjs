import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, image, revision } from './pipeline-test-helpers.mjs';

function rejected(result) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Release verification failed:/);
}

test('a successful publishing job authorizes recovery even when its later deployment failed', () => {
  const f = fixture();
  try {
    const result = f.run('./release.mjs', 'resolve');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(f.directory, 'approved-release.json'), 'utf8')).image_ref, image);
    assert.match(result.stdout, /skip: false/);
  } finally { f.cleanup(); }
});

test('release record binds the tested image bytes and exact configuration to its digest', () => {
  const f = fixture();
  try {
    const result = f.run('./release.mjs', 'record');
    assert.equal(result.status, 0, result.stderr);
    const approval = JSON.parse(readFileSync(join(f.directory, 'release.json'), 'utf8'));
    assert.equal(approval.image_ref, image);
    assert.equal(approval.revision, revision);
    assert(approval.files['scripts/deploy.sh']);
  } finally { f.cleanup(); }
});

test('an arbitrary repository, image or revision is rejected before any API request', () => {
  for (const env of [{ GITHUB_REPOSITORY: 'evil/repo' }, { RELEASE_REVISION: 'main' },
    { APPROVED_IMAGE: 'ghcr.io/evil/repo@sha256:' + 'a'.repeat(64) }, { PUBLISH_RUN_ID: 'unsafe;input' }]) {
    const f = fixture();
    try {
      rejected(f.run('./release.mjs', 'resolve', env));
      assert.equal(f.events().length, 0);
    } finally { f.cleanup(); }
  }
});

test('failed publishing jobs, missing approvals and malformed records cannot deploy', () => {
  for (const override of [{ jobConclusion: 'failure' }, { artifacts: [] }, { approvalText: '{bad JSON' },
    { artifacts: [{ id: 200, name: `movierater-release-${revision}-1`, expired: true, size_in_bytes: 100 }] }]) {
    const f = fixture(override);
    try { rejected(f.run('./release.mjs', 'resolve')); }
    finally { f.cleanup(); }
  }
});

test('approval revision, policy and immutable digest mismatches fail closed', () => {
  for (const override of [{ revision: 'c'.repeat(40) }, { policy: 'advisory' },
    { image_ref: 'ghcr.io/ozan0062/devops_movierater@sha256:' + 'c'.repeat(64) }]) {
    const initial = fixture();
    const changed = { ...initial.approval, ...override };
    initial.cleanup();
    const f = fixture({ approvalText: JSON.stringify(changed) });
    try { rejected(f.run('./release.mjs', 'resolve')); }
    finally { f.cleanup(); }
  }
});

test('wrong OCI source, revision or image identity is rejected', () => {
  const initial = fixture();
  const original = initial.data.dockerImage;
  initial.cleanup();
  for (const changed of [
    { ...original, Id: 'sha256:' + 'c'.repeat(64) },
    { ...original, Config: { Labels: { ...original.Config.Labels, 'org.opencontainers.image.source': 'https://github.com/evil/repo' } } },
    { ...original, Config: { Labels: { ...original.Config.Labels, 'org.opencontainers.image.revision': 'c'.repeat(40) } } },
  ]) {
    const f = fixture({ dockerImage: changed });
    try { rejected(f.run('./release.mjs', 'resolve')); }
    finally { f.cleanup(); }
  }
});

test('registry digest mismatches and non-main history cannot be approved', () => {
  for (const override of [{ manifestDigest: 'sha256:' + 'c'.repeat(64) }, { comparison: 'diverged' }]) {
    const f = fixture(override);
    try { rejected(f.run('./release.mjs', 'resolve')); }
    finally { f.cleanup(); }
  }
});

test('a stale automatic release is skipped before pull or server access', () => {
  const f = fixture({ mainRevision: 'c'.repeat(40) });
  try {
    const result = f.run('./release.mjs', 'resolve', { AUTOMATIC: 'true' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /skip: true/);
    assert.equal(f.events().filter((event) => event.program).length, 0);
  } finally { f.cleanup(); }
});
