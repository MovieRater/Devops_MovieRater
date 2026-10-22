import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixture } from './pipeline-test-helpers.mjs';

function rejected(result) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Deployment failed:/);
}

test('missing SSH credentials or unsafe server settings never connect to a server', () => {
  for (const env of [{ DEPLOY_SSH_KEY: '' }, { DEPLOY_KNOWN_HOSTS: '' },
    { DEPLOY_HOST: 'server\nProxyCommand evil' }, { DEPLOY_USER: 'root' },
    { DEPLOY_PATH: '/opt/../elsewhere' }, { DEPLOY_URL: '' }, { DEPLOY_URL: 'http://site.test' }]) {
    const f = fixture();
    try {
      rejected(f.run('./deploy-remote.mjs', 'setup', env));
      assert.equal(f.events().filter((event) => event.program === 'ssh').length, 0);
    } finally { f.cleanup(); }
  }
});

test('SSH configuration pins trusted hosts and disables password, agent and privilege shortcuts', () => {
  const f = fixture();
  try {
    const result = f.run('./deploy-remote.mjs', 'setup');
    assert.equal(result.status, 0, result.stderr);
    const directory = readFileSync(join(f.directory, 'outputs.txt'), 'utf8').split('\n').find((line) => line.startsWith('ssh_dir=')).slice(8);
    const config = readFileSync(join(directory, 'config'), 'utf8');
    for (const value of ['StrictHostKeyChecking yes', 'BatchMode yes', 'IdentitiesOnly yes', 'ForwardAgent no']) assert(config.includes(value));
    assert(config.includes('UserKnownHostsFile "'));
    assert.equal(f.events().filter((event) => event.program === 'ssh').length, 0);
  } finally { f.cleanup(); }
});

test('invalid private keys and missing pinned host entries fail before SSH', () => {
  for (const scenario of ['bad-key', 'bad-hosts']) {
    const f = fixture({ scenario });
    try {
      rejected(f.run('./deploy-remote.mjs', 'setup'));
      assert.equal(f.events().filter((event) => event.program === 'ssh').length, 0);
    } finally { f.cleanup(); }
  }
});

test('changed release files are rejected before they are transferred', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.directory, 'approved-release', 'Caddyfile'), 'unapproved changes');
    rejected(f.run('./deploy-remote.mjs', 'apply'));
    assert.equal(f.events().filter((event) => event.program === 'ssh').length, 0);
  } finally { f.cleanup(); }
});

test('healthy deployment verifies the exact public HTML and assets', () => {
  const f = fixture();
  try {
    const result = f.run('./deploy-remote.mjs', 'apply');
    assert.equal(result.status, 0, result.stderr);
    const commands = f.events().filter((event) => event.program === 'ssh').map((event) => event.args.at(-1));
    assert(commands.some((command) => command.includes(' deploy ')));
    assert(!commands.some((command) => command.includes(' reject ')));
    assert.match(result.stdout, /exact approved assets passed/);
  } finally { f.cleanup(); }
});

test('failed public availability rejects the candidate and fails deployment', () => {
  const f = fixture({ scenario: 'public-failure' });
  try {
    const result = f.run('./deploy-remote.mjs', 'apply');
    rejected(result);
    const commands = f.events().filter((event) => event.program === 'ssh').map((event) => event.args.at(-1));
    assert(commands.some((command) => command.includes(' deploy ')));
    assert(commands.some((command) => command.includes(' reject ')));
  } finally { f.cleanup(); }
});

test('manual rollback only selects an allowlisted previous image and revision', () => {
  const f = fixture({ previousState: 'PREVIOUS_IMAGE=ghcr.io/evil/repo:latest\nPREVIOUS_REVISION=main\n' });
  try { rejected(f.run('./deploy-remote.mjs', 'previous')); }
  finally { f.cleanup(); }
});
