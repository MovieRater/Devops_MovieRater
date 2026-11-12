import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, revision } from './pipeline-test-helpers.mjs';

const image = 'ghcr.io/movierater/devops_movierater';
const configuration = {
  GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'main',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_placeholder',
  VITE_TMDB_API_KEY: 'ci_placeholder_tmdb_key',
  VITE_TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  VITE_TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/original',
  VITE_OMDB_API_KEY: 'ci_placeholder_omdb_key',
  VITE_OMDB_BASE_URL: 'https://www.omdbapi.com/',
};

function run(f, action, env = {}) {
  return f.run('./publish-image.mjs', action, {
    ...configuration, GITHUB_ENV: join(f.directory, 'env.txt'), ...env,
  });
}

test('an existing commit image is reused and its commit tag is never pushed again', () => {
  const f = fixture();
  try {
    assert.equal(run(f, 'prepare').status, 0);
    assert.match(readFileSync(join(f.directory, 'outputs.txt'), 'utf8'), /reuse=true/);
    assert.equal(run(f, 'publish', { REUSED: 'true' }).status, 0);
    const commands = f.events().filter((event) => event.program === 'docker').map((event) => event.args);
    assert(commands.some((args) => args[0] === 'pull' && args[1] === `${image}:sha-${revision}`));
    assert.deepEqual(commands.filter((args) => args[0] === 'push').map((args) => args[1]), [`${image}:main`, `${image}:latest`]);
  } finally { f.cleanup(); }
});

test('only a missing manifest allows a new build; registry failures stop before Docker', () => {
  for (const status of [404, 401, 403, 429, 500]) {
    const f = fixture({ manifestStatus: status });
    try {
      const result = run(f, 'prepare');
      assert.equal(result.status, status === 404 ? 0 : 1, result.stderr);
      if (status === 404) assert.match(readFileSync(join(f.directory, 'outputs.txt'), 'utf8'), /reuse=false/);
      assert(!f.events().some((event) => event.program === 'docker'));
    } finally { f.cleanup(); }
  }
});

test('a commit image appearing after preparation is not overwritten', () => {
  const f = fixture();
  try {
    assert.equal(run(f, 'prepare').status, 0);
    const result = run(f, 'publish', { REUSED: 'false' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /instead of overwriting/);
    assert(!f.events().some((event) => event.program === 'docker' && event.args[0] === 'push'));
  } finally { f.cleanup(); }
});

test('a stale main run publishes only its immutable commit tag', () => {
  const f = fixture({ manifestStatus: 404, mainRevision: 'c'.repeat(40) });
  try {
    assert.equal(run(f, 'prepare').status, 0);
    assert.equal(run(f, 'publish', { REUSED: 'false' }).status, 0);
    const pushes = f.events().filter((event) => event.program === 'docker' && event.args[0] === 'push');
    assert.deepEqual(pushes.map((event) => event.args[1]), [`${image}:sha-${revision}`]);
  } finally { f.cleanup(); }
});

test('stable releases get major/minor aliases and prereleases keep their exact version', () => {
  for (const [version, suffixes] of [
    ['v1.2.3', [`sha-${revision}`, 'v1.2.3', '1.2.3', '1.2', '1']],
    ['v1.2.3-beta.1', [`sha-${revision}`, 'v1.2.3-beta.1', '1.2.3-beta.1']],
  ]) {
    const f = fixture({ manifestStatus: 404 });
    const env = { GITHUB_REF: `refs/tags/${version}`, GITHUB_REF_NAME: version };
    try {
      assert.equal(run(f, 'prepare', env).status, 0);
      assert.equal(run(f, 'publish', { ...env, REUSED: 'false' }).status, 0);
      const pushes = f.events().filter((event) => event.program === 'docker' && event.args[0] === 'push');
      assert.deepEqual(pushes.map((event) => event.args[1]), suffixes.map((suffix) => `${image}:${suffix}`));
    } finally { f.cleanup(); }
  }
});

test('missing configuration, multiline values, invalid tags and other repositories fail before registry access', () => {
  for (const env of [
    { VITE_TMDB_API_KEY: '' }, { VITE_SUPABASE_URL: 'https://example.supabase.co\nOTHER=value' },
    { GITHUB_REF: 'refs/tags/vbad', GITHUB_REF_NAME: 'vbad' },
    { GITHUB_REPOSITORY: 'other/repository' },
  ]) {
    const f = fixture();
    try {
      assert.equal(run(f, 'prepare', env).status, 1);
      assert.equal(f.events().length, 0);
    } finally { f.cleanup(); }
  }
});
