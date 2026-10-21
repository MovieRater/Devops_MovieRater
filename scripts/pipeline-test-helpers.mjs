import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const revision = 'a'.repeat(40);
export const repository = 'MovieRater/Devops_MovieRater';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const configDigest = `sha256:${'b'.repeat(64)}`;
const manifest = JSON.stringify({ schemaVersion: 2, config: { digest: configDigest }, layers: [] });
export const image = `ghcr.io/movierater/devops_movierater@sha256:${hash(manifest)}`;
const files = { 'docker-compose.prod.yml': 'fixture production\n', 'docker-compose.https.yml': 'fixture HTTPS\n', Caddyfile: 'fixture proxy\n', 'scripts/deploy.sh': '#!/bin/sh\nexit 0\n' };

// Each test runs the real CLI in a child process. Only external APIs/processes
// are replaced, so fixtures never contact GitHub, GHCR, Supabase or an SSH host.
const preload = `
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import childProcess from 'node:child_process';
import timers from 'node:timers/promises';
import { syncBuiltinESMExports } from 'node:module';
const f = JSON.parse(readFileSync(process.env.PIPELINE_TEST_FIXTURE, 'utf8'));
const event = (value) => appendFileSync(f.events, JSON.stringify(value) + '\\n');
childProcess.spawnSync = (program, args) => {
  event({ program, args });
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const bad = () => ({ status: 1, stdout: '', stderr: 'fixture failure' });
  if (program === 'docker') {
    if (args[0] === 'pull') return ok('pulled');
    if (args[0] === 'image' && args[1] === 'inspect') return ok(JSON.stringify([f.dockerImage]));
    if (args[0] === 'run') return ok(f.webFiles[args.at(-1).replace('/usr/share/nginx/html', '')] || '');
  }
  if (program === 'unzip') return ok(args.at(-1) === 'release.json' ? f.approvalText : f.files[args.at(-1)] || '');
  if (program === 'tar') { writeFileSync(args[1], 'fixture archive'); return ok(); }
  if (program === 'ssh-keygen') return f.scenario === 'bad-key' || (f.scenario === 'bad-hosts' && args[0] === '-F') ? bad() : ok('fixture key');
  if (program === 'ssh') {
    const command = args.at(-1);
    if (command.includes('cat ') && command.includes('release.env')) return ok(f.previousState);
    return ok('fixture SSH operation passed');
  }
  throw new Error('Unexpected subprocess: ' + program);
};
timers.setTimeout = async () => {};
syncBuiltinESMExports();
globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  event({ url: parsed.href });
  const json = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  if (parsed.hostname === 'ghcr.io') {
    if (parsed.pathname === '/token') return json({ token: 'fixture-token' });
    if (parsed.pathname.includes('/manifests/')) return new Response(f.manifest, { headers: { 'docker-content-digest': f.manifestDigest } });
  }
  if (parsed.hostname === 'api.github.com') {
    if (parsed.pathname.endsWith('/git/ref/heads/main')) return json({ object: { sha: f.mainRevision } });
    if (parsed.pathname.includes('/compare/')) return json({ status: f.comparison });
    if (parsed.pathname.endsWith('/workflows/docker-publish.yml/runs')) return json({ workflow_runs: [f.run] });
    if (parsed.pathname.endsWith('/runs/100')) return json(f.run);
    if (parsed.pathname.endsWith('/runs/100/artifacts')) return json({ artifacts: f.artifacts });
    if (parsed.pathname.endsWith('/attempts/1/jobs')) return json({ jobs: [{ name: 'Test, scan and publish image', conclusion: f.jobConclusion }] });
    if (parsed.pathname.endsWith('/artifacts/200/zip')) return new Response('fixture ZIP');
  }
  if (parsed.hostname === 'movierater.example.test') {
    if (f.scenario === 'public-failure') return new Response('unavailable', { status: 503 });
    if (parsed.pathname === '/health') return new Response('OK');
    return new Response(f.webFiles[parsed.pathname === '/' ? '/index.html' : parsed.pathname] || '', { status: 200 });
  }
  throw new Error('Unexpected network request: ' + parsed.href);
};
`;

export function fixture(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'movierater-pipeline-test-'));
  const approval = {
    schema: 1, repository, revision, image_ref: image, run_id: '100', run_attempt: '1',
    policy: 'all-critical-and-fixable-high', files: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, hash(bytes)])),
  };
  const data = {
    files, approvalText: JSON.stringify(approval), manifest,
    manifestDigest: `sha256:${hash(manifest)}`, mainRevision: revision, comparison: 'identical',
    run: { id: 100, head_sha: revision, head_repository: { full_name: repository }, path: '.github/workflows/docker-publish.yml', conclusion: 'failure' },
    artifacts: [{ id: 200, name: `movierater-release-${revision}-1`, expired: false, size_in_bytes: 100 }],
    jobConclusion: 'success', events: join(directory, 'events.jsonl'),
    dockerImage: { Id: configDigest, Os: 'linux', Architecture: 'amd64', RepoDigests: [image], Config: { Labels: { 'org.opencontainers.image.revision': revision, 'org.opencontainers.image.source': `https://github.com/${repository}` } } },
    previousState: `CURRENT_IMAGE=\nCURRENT_REVISION=\nPREVIOUS_IMAGE=${image}\nPREVIOUS_REVISION=${revision}\n`,
    webFiles: { '/index.html': '<div id="root"></div><script src="/assets/app.js"></script><link href="/assets/app.css">', '/assets/app.js': 'fixture JavaScript', '/assets/app.css': 'fixture CSS' },
    ...overrides,
  };
  for (const [file, bytes] of Object.entries(files)) {
    for (const base of [directory, join(directory, 'approved-release')]) {
      const parts = file.split('/');
      if (parts.length > 1) mkdirSync(join(base, ...parts.slice(0, -1)), { recursive: true });
      else mkdirSync(base, { recursive: true });
      writeFileSync(join(base, file), bytes);
    }
  }
  writeFileSync(join(directory, 'approved-release.json'), JSON.stringify(approval));
  const fixturePath = join(directory, 'fixture.json');
  const preloadPath = join(directory, 'preload.mjs');
  writeFileSync(fixturePath, JSON.stringify(data));
  writeFileSync(preloadPath, preload);
  const outputs = join(directory, 'outputs.txt');
  const sshDirectory = join(directory, 'movierater-ssh-fixture');
  mkdirSync(sshDirectory);
  writeFileSync(join(sshDirectory, 'config'), 'fixture config');
  return {
    directory, data, approval,
    run(script, action, env = {}) {
      return spawnSync(process.execPath, ['--import', pathToFileURL(preloadPath).href, fileURLToPath(new URL(script, import.meta.url)), action], {
        cwd: directory, timeout: 10_000, encoding: 'utf8',
        env: { ...process.env, PIPELINE_TEST_FIXTURE: fixturePath, GITHUB_REPOSITORY: repository,
          GH_TOKEN: 'fixture', GITHUB_ACTOR: 'fixture', GITHUB_SHA: revision,
          GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: directory,
          GITHUB_OUTPUT: outputs, RELEASE_REVISION: revision,
          SSH_DIR: sshDirectory, DEPLOY_HOST: 'server.example.test', DEPLOY_USER: 'movierater',
          DEPLOY_URL: 'https://movierater.example.test', DEPLOY_PATH: '/opt/movierater',
          DEPLOY_SSH_KEY: 'fixture private key', DEPLOY_KNOWN_HOSTS: 'fixture pinned host key', ...env },
      });
    },
    events() { return existsSync(data.events) ? readFileSync(data.events, 'utf8').trim().split('\n').map(JSON.parse) : []; },
    cleanup() {
      if (existsSync(outputs)) {
        const keyDirectory = readFileSync(outputs, 'utf8').split(/\r?\n/).find((line) => line.startsWith('ssh_dir='))?.slice(8);
        if (keyDirectory && existsSync(keyDirectory)) {
          assert(realpathSync(keyDirectory).startsWith(realpathSync(tmpdir()) + sep));
          assert(keyDirectory.includes('movierater-ssh-'));
          rmSync(keyDirectory, { recursive: true, force: true });
        }
      }
      assert(realpathSync(directory).startsWith(realpathSync(tmpdir()) + sep));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
