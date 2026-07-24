import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(packageJson.main, './dist/extension.js');
const required = ['dist', 'resources', 'syntaxes', 'language-configuration.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const dir = await mkdtemp(join(tmpdir(), 'bufbear-vsix-'));
try {
  const result = spawnSync('npx', ['vsce', 'package', '--no-dependencies', '--out', join(dir, 'bufbear.vsix')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const archive = join(dir, 'bufbear.vsix');
  assert.ok((await stat(archive)).size < 2 * 1024 * 1024, 'VSIX exceeds 2 MiB budget');
  const paths = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map((p) => p.replace(/^extension\//, ''));
  const allowed = new Set(['extension.vsixmanifest', '[Content_Types].xml', 'package.json', 'language-configuration.json', 'readme.md', 'changelog.md', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.md']);
  const allowedPrefixes = ['dist/', 'resources/', 'syntaxes/'];
  for (const path of paths) assert.ok(allowed.has(path) || allowedPrefixes.some((prefix) => path.startsWith(prefix)), `Unexpected package path: ${path}`);
  const aliases = { LICENSE: 'license.txt', 'README.md': 'readme.md', 'CHANGELOG.md': 'changelog.md' };
  for (const entry of required) { const wanted = (aliases[entry] ?? entry).toLowerCase(); assert.ok(paths.some((p) => p.toLowerCase() === wanted || p.toLowerCase().startsWith(`${wanted}/`)), `Missing required path: ${entry}`); }
  for (const forbidden of ['.codex/', '.husky/', '.github/', 'docs/', 'src/', 'scripts/', 'node_modules/', 'logo.png', 'tsconfig.json', 'esbuild.mjs', 'commitlint.config.js', '.releaserc.json', '.nvmrc', '.gitignore']) assert.ok(!paths.some((p) => p.toLowerCase().startsWith(forbidden)), `Forbidden path present: ${forbidden}`);
} finally { await rm(dir, { recursive: true, force: true }); }
console.log('VSIX package content and size test passed.');
