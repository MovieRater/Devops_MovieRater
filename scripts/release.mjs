import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Release records connect a successful publishing job to one exact GHCR digest.
const repository = 'Ozan0062/Devops_MovieRater';
const imageName = `ghcr.io/${repository.toLowerCase()}`;
const bundleFiles = ['docker-compose.prod.yml', 'docker-compose.https.yml', 'Caddyfile', 'scripts/deploy.sh'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const revisionPattern = /^[a-f0-9]{40}$/;
const imagePattern = new RegExp(`^${imageName.replaceAll('.', '\\.') }@sha256:[a-f0-9]{64}$`);

function command(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

function output(name, value) {
  assert(!String(value).includes('\n'), 'Invalid workflow output');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}: ${value}`);
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Release verification HTTP ${response.status} (${new URL(url).hostname})`);
  return response;
}

async function api(path) {
  const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  return response.json();
}

async function manifest(reference) {
  const response = await request(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repository.toLowerCase()}:pull`, {
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.GITHUB_ACTOR}:${process.env.GH_TOKEN}`).toString('base64')}` },
  });
  const { token } = await response.json();
  assert(token, 'GHCR did not provide a token');
  const result = await request(`https://ghcr.io/v2/${repository.toLowerCase()}/manifests/${reference}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    },
  });
  const bytes = Buffer.from(await result.arrayBuffer());
  const digest = `sha256:${hash(bytes)}`;
  assert.equal(result.headers.get('docker-content-digest'), digest, 'Registry manifest digest did not match its contents');
  const document = JSON.parse(bytes);
  assert.equal(document.schemaVersion, 2, 'Unsupported image manifest');
  assert(document.config?.digest, 'A single-platform image manifest is required');
  return { digest, configDigest: document.config.digest };
}

function inspect(reference) {
  return JSON.parse(command('docker', ['image', 'inspect', reference]))[0];
}

function checkImage(image, revision, digestReference) {
  assert.equal(image.Os, 'linux');
  assert.equal(image.Architecture, 'amd64');
  assert.equal(image.Config.Labels?.['org.opencontainers.image.revision'], revision, 'Image revision does not match the release');
  assert.equal(image.Config.Labels?.['org.opencontainers.image.source']?.toLowerCase(),
    `https://github.com/${repository.toLowerCase()}`, 'Image source is not this repository');
  assert(image.RepoDigests?.includes(digestReference), 'Docker did not pull the approved digest');
}

async function record() {
  const revision = process.env.GITHUB_SHA;
  assert(revisionPattern.test(revision), 'Invalid release revision');
  assert(/^\d+$/.test(process.env.GITHUB_RUN_ID), 'Invalid publishing run ID');
  assert(/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT), 'Invalid publishing attempt');
  const local = inspect(`movierater-ci:${revision}`);
  const remote = await manifest(`sha-${revision}`);
  assert.equal(remote.configDigest, local.Id, 'Published bytes differ from the image tested in CI');
  const imageRef = `${imageName}@${remote.digest}`;
  command('docker', ['pull', imageRef]);
  const pulled = inspect(imageRef);
  assert.equal(pulled.Id, local.Id, 'Pulled image differs from the tested image');
  checkImage(pulled, revision, imageRef);
  const files = Object.fromEntries(bundleFiles.map((file) => [file, hash(readFileSync(file))]));
  const approval = {
    schema: 1, repository, revision, image_ref: imageRef,
    run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    policy: 'all-critical-and-fixable-high', files,
  };
  writeFileSync('release.json', `${JSON.stringify(approval, null, 2)}\n`);
  output('image_ref', imageRef);
}

async function readApproval(run, artifact, revision) {
  const response = await request(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length <= 1024 * 1024, 'Release bundle exceeds the expected size');
  const zipPath = join(process.env.RUNNER_TEMP || '.', `approved-${artifact.id}.zip`);
  writeFileSync(zipPath, bytes);
  const approval = JSON.parse(command('unzip', ['-p', zipPath, 'release.json']));
  assert.equal(approval.schema, 1);
  assert.equal(approval.repository, repository);
  assert.equal(approval.revision, revision);
  assert.equal(approval.run_id, String(run.id));
  assert(/^\d+$/.test(approval.run_attempt));
  assert.equal(artifact.name, `movierater-release-${revision}-${approval.run_attempt}`);
  assert.equal(approval.policy, 'all-critical-and-fixable-high', 'Release lacks the required security approval');
  assert(imagePattern.test(approval.image_ref), 'Release must refer to an allowlisted immutable image');
  const jobs = await api(`actions/runs/${run.id}/attempts/${approval.run_attempt}/jobs?per_page=100`);
  assert(jobs.jobs.some((job) => job.name === 'Test, scan and publish image' && job.conclusion === 'success'),
    'The publishing job did not finish successfully');
  for (const file of bundleFiles) {
    assert(/^[a-f0-9]{64}$/.test(approval.files?.[file]), `Release bundle hash missing: ${file}`);
    assert.equal(hash(Buffer.from(command('unzip', ['-p', zipPath, file]))), approval.files[file], `Release bundle changed: ${file}`);
  }
  return approval;
}

async function resolve() {
  const revision = process.env.RELEASE_REVISION;
  const expectedImage = process.env.APPROVED_IMAGE;
  const requestedRun = process.env.PUBLISH_RUN_ID;
  assert(revisionPattern.test(revision), 'Choose a full 40-character commit SHA');
  if (expectedImage) assert(imagePattern.test(expectedImage), 'Invalid or non-allowlisted image digest');
  if (requestedRun) assert(/^\d+$/.test(requestedRun), 'Invalid publishing run ID');
  if (process.env.AUTOMATIC === 'true') {
    const main = await api('git/ref/heads/main');
    if (main.object.sha !== revision) {
      output('skip', 'true');
      console.log('Skipping stale automatic deployment: a newer commit is already on main.');
      return;
    }
  }
  const comparison = await api(`compare/${revision}...main`);
  assert(['ahead', 'identical'].includes(comparison.status), 'Release revision must be part of the approved main history');
  const runs = requestedRun
    ? [await api(`actions/runs/${requestedRun}`)]
    : (await api(`actions/workflows/docker-publish.yml/runs?head_sha=${revision}&per_page=50`)).workflow_runs;
  let approval;
  for (const run of runs) {
    if (run.head_sha !== revision || run.head_repository?.full_name !== repository
      || !/^\.github\/workflows\/docker-publish\.yml(?:@refs\/.*)?$/.test(run.path || '')) continue;
    const artifacts = await api(`actions/runs/${run.id}/artifacts?per_page=100`);
    const candidates = artifacts.artifacts.filter((artifact) => !artifact.expired
      && artifact.name.startsWith(`movierater-release-${revision}-`) && artifact.size_in_bytes <= 1024 * 1024)
      .sort((a, b) => b.id - a.id);
    for (const candidate of candidates) {
      try {
        approval = await readApproval(run, candidate, revision);
        break;
      } catch (error) {
        console.error(`Release record ${candidate.id} was not approved: ${error.message}`);
      }
    }
    if (approval) break;
  }
  assert(approval, 'No retained release bundle from a successful publishing job exists for this revision');
  if (expectedImage) assert.equal(approval.image_ref, expectedImage, 'Requested digest is not the CI-approved image');
  const remote = await manifest(`sha-${revision}`);
  assert.equal(approval.image_ref, `${imageName}@${remote.digest}`, 'Commit tag no longer matches the approved digest');
  command('docker', ['pull', approval.image_ref]);
  const image = inspect(approval.image_ref);
  assert.equal(image.Id, remote.configDigest);
  checkImage(image, revision, approval.image_ref);
  writeFileSync('approved-release.json', `${JSON.stringify(approval, null, 2)}\n`);
  output('image_ref', approval.image_ref);
  output('revision', approval.revision);
  output('publish_run_id', approval.run_id);
  output('skip', 'false');
}

async function fresh() {
  assert(revisionPattern.test(process.env.RELEASE_REVISION), 'Invalid deployment revision');
  const stale = process.env.AUTOMATIC === 'true'
    && (await api('git/ref/heads/main')).object.sha !== process.env.RELEASE_REVISION;
  output('skip', String(stale));
  if (stale) console.log('Skipping an automatic deployment superseded while the container was being checked.');
}

try {
  assert.equal(process.env.GITHUB_REPOSITORY?.toLowerCase(), repository.toLowerCase(), 'Releases are restricted to the MovieRater repository');
  assert(process.env.GH_TOKEN, 'Missing GitHub token for release verification');
  if (process.argv[2] === 'record') await record();
  else if (process.argv[2] === 'resolve') await resolve();
  else if (process.argv[2] === 'fresh') await fresh();
  else throw new Error('Usage: node scripts/release.mjs record|resolve|fresh');
} catch (error) {
  console.error(`Release verification failed: ${error.message}`);
  process.exitCode = 1;
}
