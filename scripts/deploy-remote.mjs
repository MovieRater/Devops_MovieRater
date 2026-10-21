import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, posix, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const imagePattern = /^ghcr\.io\/movierater\/devops_movierater@sha256:[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const bundleFiles = ['docker-compose.prod.yml', 'docker-compose.https.yml', 'Caddyfile', 'scripts/deploy.sh'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

function output(name, value) {
  assert(!String(value).includes('\n'));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}: ${value}`);
}

function configuration() {
  const host = process.env.DEPLOY_HOST || '';
  const user = process.env.DEPLOY_USER || '';
  const port = process.env.DEPLOY_PORT || '22';
  const root = process.env.DEPLOY_PATH || '/opt/movierater';
  assert(/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host), 'Set DEPLOY_HOST to the server DNS name or IPv4 address');
  assert(/^[a-z_][a-z0-9_-]{0,31}$/.test(user) && user !== 'root', 'Set DEPLOY_USER to a dedicated non-root deployment user');
  assert(/^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535, 'Invalid DEPLOY_PORT');
  assert(/^\/[A-Za-z0-9/_-]+$/.test(root) && posix.normalize(root) === root && root !== '/', 'DEPLOY_PATH must be an absolute directory without spaces or traversal');
  assert(process.env.DEPLOY_URL?.trim(), 'Missing DEPLOY_URL; no SSH connection was attempted');
  const url = new URL(process.env.DEPLOY_URL);
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/',
    'Set DEPLOY_URL to the production HTTPS origin, for example https://movierater.example.com');
  return { host, user, port, root, url: url.origin };
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 300_000, maxBuffer: 5 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}

function ssh(command, input) {
  const directory = process.env.SSH_DIR;
  assert(directory && basename(directory).startsWith('movierater-ssh-'), 'SSH setup has not completed');
  return run('ssh', ['-F', join(directory, 'config'), 'movierater', command], { input });
}

function setup() {
  const { host, user, port } = configuration();
  const key = process.env.DEPLOY_SSH_KEY;
  const hosts = process.env.DEPLOY_KNOWN_HOSTS;
  assert(key?.trim(), 'Missing production secret DEPLOY_SSH_KEY; no SSH connection was attempted');
  assert(hosts?.trim(), 'Missing production secret DEPLOY_KNOWN_HOSTS; obtain it through a trusted channel');
  const directory = mkdtempSync(join(tmpdir(), 'movierater-ssh-'));
  chmodSync(directory, 0o700);
  // Make cleanup possible even if key or host validation fails below.
  output('ssh_dir', directory);
  const keyFile = join(directory, 'id');
  const hostsFile = join(directory, 'known_hosts');
  writeFileSync(keyFile, `${key.trim().replaceAll('\r', '')}\n`, { mode: 0o600 });
  writeFileSync(hostsFile, `${hosts.trim()}\n`, { mode: 0o600 });
  run('ssh-keygen', ['-y', '-P', '', '-f', keyFile]);
  run('ssh-keygen', ['-F', port === '22' ? host : `[${host}]:${port}`, '-f', hostsFile]);
  writeFileSync(join(directory, 'config'), [
    'Host movierater', `  HostName ${host}`, `  User ${user}`, `  Port ${port}`,
    `  IdentityFile ${JSON.stringify(keyFile.replaceAll('\\', '/'))}`,
    `  UserKnownHostsFile ${JSON.stringify(hostsFile.replaceAll('\\', '/'))}`,
    '  StrictHostKeyChecking yes', '  BatchMode yes', '  IdentitiesOnly yes',
    '  ConnectTimeout 10', '  ServerAliveInterval 15', '  ServerAliveCountMax 3',
    '  ForwardAgent no', '  ClearAllForwardings yes', '',
  ].join('\n'), { mode: 0o600 });
}

function previous() {
  const { root } = configuration();
  const state = ssh(`if [ -f ${quote(`${root}/.deploy-state/release.env`)} ]; then cat ${quote(`${root}/.deploy-state/release.env`)}; fi`);
  const values = Object.fromEntries(state.split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  assert(imagePattern.test(values.PREVIOUS_IMAGE), 'No previous verified release is available for rollback');
  assert(revisionPattern.test(values.PREVIOUS_REVISION), 'Previous release revision is invalid');
  output('image_ref', values.PREVIOUS_IMAGE);
  output('revision', values.PREVIOUS_REVISION);
}

function stage(root, approval) {
  const source = realpathSync(process.env.APPROVED_SOURCE || 'approved-release');
  const directory = mkdtempSync(join(tmpdir(), 'movierater-bundle-'));
  try {
    for (const file of bundleFiles) {
      const path = join(source, file);
      assert(lstatSync(path).isFile() && realpathSync(path).startsWith(source + sep), `Invalid release file: ${file}`);
      const bytes = readFileSync(path);
      assert.equal(hash(bytes), approval.files[file], `Approved release file does not match its manifest: ${file}`);
      mkdirSync(join(directory, posix.dirname(file)), { recursive: true });
      writeFileSync(join(directory, file), bytes);
    }
    writeFileSync(join(directory, 'release.json'), `${JSON.stringify(approval, null, 2)}\n`);
    writeFileSync(join(directory, 'SHA256SUMS'), bundleFiles.map((file) => `${approval.files[file]}  ${file}`).join('\n') + '\n');
    const archive = join(directory, 'bundle.tar');
    run('tar', ['-cf', archive, '-C', directory, ...bundleFiles, 'release.json', 'SHA256SUMS']);
    const target = `${root}/releases/${approval.revision}`;
    ssh([
      'set -eu', 'umask 077',
      `mkdir -p ${quote(`${root}/releases`)}`,
      `stage=$(mktemp -d ${quote(`${root}/releases/.incoming.XXXXXX`)})`,
      "trap 'test -z \"$stage\" || rm -rf -- \"$stage\"' EXIT",
      'tar -xf - -C "$stage"',
      '(cd "$stage" && sha256sum --check SHA256SUMS)',
      `if [ -e ${quote(target)} ]; then`,
      `  (cd ${quote(target)} && sha256sum --check "$stage/SHA256SUMS")`,
      'else', `  mv "$stage" ${quote(target)}`, '  stage=', 'fi',
    ].join('\n'), readFileSync(archive));
  } finally {
    assert(realpathSync(directory).startsWith(realpathSync(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
}

function imageFile(image, path) {
  return Buffer.from(run('docker', [
    'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true', '--entrypoint', 'cat', image, `/usr/share/nginx/html${path}`,
  ]));
}

async function publicCheck(url, image) {
  const expected = imageFile(image, '/index.html');
  const assets = [...expected.toString('utf8').matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
  assert(assets.length, 'Approved frontend contains no assets');
  const files = new Map([['/', expected], ...assets.map((asset) => [asset, imageFile(image, asset)])]);
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const health = await fetch(`${url}/health`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      assert.equal(health.status, 200);
      assert.equal((await health.text()).trim(), 'OK');
      for (const [path, bytes] of files) {
        const response = await fetch(`${url}${path}`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
        assert.equal(response.status, 200, `Production HTTP failed: ${path}`);
        assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(bytes), `Production serves a different release: ${path}`);
      }
      console.log('Production HTTPS health, frontend and exact approved assets passed.');
      return;
    } catch (error) {
      if (attempt === 11) throw error;
      await sleep(5000);
    }
  }
}

async function apply() {
  const { root, url } = configuration();
  const approval = JSON.parse(readFileSync('approved-release.json', 'utf8'));
  assert(imagePattern.test(approval.image_ref) && revisionPattern.test(approval.revision), 'Invalid approved release');
  const operation = process.env.DEPLOY_OPERATION || 'deploy';
  assert(['deploy', 'rollback'].includes(operation), 'Unsupported deployment operation');
  stage(root, approval);
  const entrypoint = `${root}/releases/${approval.revision}/scripts/deploy.sh`;
  const invoke = (action) => ssh(`MOVIERATER_ROOT=${quote(root)} bash ${quote(entrypoint)} ${action} ${quote(approval.image_ref)} ${quote(approval.revision)}`);
  console.log(invoke(operation));
  try {
    await publicCheck(url, approval.image_ref);
  } catch (error) {
    console.error('Production HTTPS validation failed; rejecting this exact release.');
    try { console.log(invoke('reject')); }
    catch (rollbackError) { console.error(`Automatic rollback also failed: ${rollbackError.message}`); }
    throw error;
  }
}

function cleanup() {
  const directory = process.env.SSH_DIR;
  if (!directory || !existsSync(directory)) return;
  assert(basename(directory).startsWith('movierater-ssh-') && realpathSync(directory).startsWith(realpathSync(tmpdir()) + sep),
    'Refusing to remove a directory outside the temporary SSH workspace');
  rmSync(directory, { recursive: true, force: true });
}

try {
  const action = process.argv[2];
  if (action === 'setup') setup();
  else if (action === 'previous') previous();
  else if (action === 'apply') await apply();
  else if (action === 'cleanup') cleanup();
  else throw new Error('Usage: node scripts/deploy-remote.mjs setup|previous|apply|cleanup');
} catch (error) {
  console.error(`Deployment failed: ${error.message}`);
  process.exitCode = 1;
}
