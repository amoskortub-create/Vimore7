import { existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';

const cwd = process.cwd();
const rootDir =
  basename(cwd) === 'vimore' && existsSync(resolve(cwd, '../../package.json'))
    ? resolve(cwd, '../..')
    : cwd;

const vimoreNodeModules = join(rootDir, 'artifacts', 'vimore', 'node_modules');
const rootNodeModules = join(rootDir, 'node_modules');

if (existsSync(vimoreNodeModules)) {
  rmSync(vimoreNodeModules, { recursive: true, force: true });
}

const hasStaleRootCache =
  existsSync(join(rootNodeModules, '.pnpm')) ||
  existsSync(join(rootNodeModules, '.modules.yaml')) ||
  existsSync(join(rootNodeModules, '.bun')) ||
  !existsSync(join(rootNodeModules, 'next', 'dist', 'bin', 'next'));

if (existsSync(rootNodeModules) && hasStaleRootCache) {
  rmSync(rootNodeModules, { recursive: true, force: true });
}

execSync('npm install --include=dev --legacy-peer-deps --no-audit --no-fund', {
  cwd: rootDir,
  stdio: 'inherit',
});
