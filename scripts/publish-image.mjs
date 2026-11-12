import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = 'MovieRater/Devops_MovieRater';
const image = `ghcr.io/${repository.toLowerCase()}`;
const revision = process.env.GITHUB_SHA;
const localImage = `movierater-ci:${revision}`;
const commitTag = `${image}:sha-${revision}`;
const tagsFile = join(process.env.RUNNER_TEMP || '.', 'movierater-image-tags.json');
const configuration = [
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_TMDB_API_KEY',
  'VITE_TMDB_BASE_URL', 'VITE_TMDB_IMAGE_BASE', 'VITE_OMDB_API_KEY', 'VITE_OMDB_BASE_URL',
];

function docker(...args) {
  const result = spawnSync('docker', args, { stdio: 'inherit', timeout: 120_000 });
  assert(!result.error && result.status === 0, `docker ${args[0]} failed`);
}

async function request(url, headers) {
  return fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
}

async function manifestExists() {
  const response = await request(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repository.toLowerCase()}:pull,push`, {
    Authorization: `Basic ${Buffer.from(`${process.env.GITHUB_ACTOR}:${process.env.GH_TOKEN}`).toString('base64')}`,
  });
  assert(response.ok, `GHCR token request failed (HTTP ${response.status})`);
  const { token } = await response.json();
  assert(token, 'GHCR did not return a registry token');
  console.log(`::add-mask::${token}`);
  const manifest = await request(`https://ghcr.io/v2/${repository.toLowerCase()}/manifests/sha-${revision}`, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
  });
  assert([200, 404].includes(manifest.status), `GHCR manifest lookup failed (HTTP ${manifest.status})`);
  return manifest.status === 200;
}

function versionTags() {
  if (process.env.GITHUB_REF === 'refs/heads/main') return [commitTag, `${image}:main`, `${image}:latest`];
  const version = process.env.GITHUB_REF_NAME;
  const match = /^v([0-9]+)\.([0-9]+)\.([0-9]+)(-[0-9A-Za-z.-]+)?$/.exec(version);
  assert(process.env.GITHUB_REF === `refs/tags/${version}` && match,
    'Release tags must use vMAJOR.MINOR.PATCH, optionally with a prerelease suffix');
  const tags = [commitTag, `${image}:${version}`, `${image}:${version.slice(1)}`];
  if (!match[4]) tags.push(`${image}:${match[1]}.${match[2]}`, `${image}:${match[1]}`);
  return tags;
}

async function prepare() {
  const tags = versionTags();
  for (const name of configuration) {
    const value = process.env[name];
    assert(value?.trim() && !/[\r\n]/.test(value), `Set ${name} under Settings > Secrets and variables > Actions`);
    appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
  }
  writeFileSync(tagsFile, JSON.stringify(tags));
  const reuse = await manifestExists();
  if (reuse) {
    docker('pull', commitTag);
    docker('tag', commitTag, localImage);
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${reuse}\n`);
}

async function publish() {
  const tags = JSON.parse(readFileSync(tagsFile, 'utf8'));
  const reused = process.env.REUSED === 'true';
  if (!reused) {
    assert(!await manifestExists(), 'Commit image appeared during this run. Rerun to test and reuse it instead of overwriting it');
  }
  let current = true;
  if (process.env.GITHUB_REF === 'refs/heads/main') {
    const response = await request(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
      Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
    });
    assert(response.ok, `Main revision lookup failed (HTTP ${response.status})`);
    current = (await response.json()).object.sha === revision;
    if (!current) console.log('A newer commit is on main; only publish the immutable commit tag.');
  }
  for (const tag of tags) {
    if (reused && tag === commitTag) continue;
    if (!current && [`${image}:main`, `${image}:latest`].includes(tag)) continue;
    docker('tag', localImage, tag);
    docker('push', tag);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '## Published MovieRater image', `Commit tag: \`${commitTag}\``,
      'The tested image was published without rebuilding.',
      'All CRITICAL and fixable HIGH findings block publication; see the Trivy reports.', '',
    ].join('\n'));
  }
}

try {
  assert.equal(process.env.GITHUB_REPOSITORY, repository, 'Publishing is restricted to the MovieRater repository');
  assert(/^[a-f0-9]{40}$/.test(revision), 'Invalid release revision');
  assert(process.env.GH_TOKEN, 'Missing GitHub token');
  if (process.argv[2] === 'prepare') await prepare();
  else if (process.argv[2] === 'publish') await publish();
  else throw new Error('Usage: node scripts/publish-image.mjs prepare|publish');
} catch (error) {
  console.error(`Image publishing failed: ${error.message}`);
  process.exitCode = 1;
}
