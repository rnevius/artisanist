import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { checkAuthentication } from './deploy-auth.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'Usage: npm run deploy[:setup]\n' +
      'DEPLOY_HOST is the server hostname or SSH alias.\n' +
      'Requires DEPLOY_URL for HTTPS authentication checks.\n' +
      'Connects as artisanist-deploy; --setup connects as root.',
  );
  process.exit(0);
}
if (args.some((arg) => arg !== '--setup')) throw new Error('Unknown argument.');

try {
  loadEnvFile(join(root, '.env.deploy'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const setup = args.includes('--setup');
const host = process.env.DEPLOY_HOST;
if (!host) {
  console.error(
    'Set DEPLOY_HOST in .env.deploy or the environment before deploying.',
  );
  process.exit(1);
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/.test(host))
  throw new Error('DEPLOY_HOST must be an SSH alias or user@hostname.');
const destination = `${setup ? 'root' : 'artisanist-deploy'}@${host.replace(/^.*@/, '')}`;
const sshOptions = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=10',
  '-o',
  'StrictHostKeyChecking=yes',
];
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
function run(command, parameters, options = {}) {
  const result = spawnSync(command, parameters, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? result.signal}).`);
  return result.stdout?.toString().trim();
}
const ssh = (command, options) =>
  run('ssh', [...sshOptions, destination, command], options);
const url = process.env.DEPLOY_URL;
if (!url) throw new Error('Set DEPLOY_URL to the public HTTPS origin.');

let localDirectory;
let remoteDirectory;
try {
  run('npm', ['run', 'check']);
  run('npm', ['run', 'test:e2e']);
  await checkAuthentication(url);
  localDirectory = mkdtempSync(join(tmpdir(), 'artisanist-deploy-'));
  const archive = join(localDirectory, 'release.tar.gz');
  // Explicit inputs keep .env, local recipes, and development files off the server.
  run('tar', [
    '-czf',
    archive,
    'package.json',
    'package-lock.json',
    'mise.toml',
    'src',
    'public',
    'migrations',
    'deploy/artisanist.service',
    'deploy/activate.sh',
    'deploy/Caddyfile.example',
    'deploy/remote.sh',
  ]);
  remoteDirectory = ssh('mktemp -d /tmp/artisanist.XXXXXXXXXX', {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (!/^\/tmp\/artisanist\.[a-zA-Z0-9]{10}$/.test(remoteDirectory)) {
    remoteDirectory = undefined;
    throw new Error('Server returned an unexpected staging directory.');
  }
  run('scp', [
    ...sshOptions,
    archive,
    `${destination}:${remoteDirectory}/release.tar.gz`,
  ]);
  ssh(
    `bash -s -- ${quote(setup ? 'setup' : 'deploy')} ${quote(remoteDirectory)}`,
    {
      input: readFileSync(join(root, 'deploy/remote.sh')),
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  try {
    await checkAuthentication(url);
  } catch (error) {
    try {
      ssh('sudo -n /usr/local/sbin/artisanist-activate stop');
    } catch {
      console.error(
        'Could not stop Artisanist after authentication check failed.',
      );
    }
    throw error;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (remoteDirectory) {
    try {
      ssh(`rm -rf -- ${quote(remoteDirectory)}`);
    } catch {
      console.error(`Could not remove staging directory ${remoteDirectory}.`);
    }
  }
  if (localDirectory) rmSync(localDirectory, { recursive: true, force: true });
}
