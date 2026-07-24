import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { load } from 'js-yaml';

const ACTIONS = { checkout: 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0', setupNode: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020' };

const config = JSON.parse(await readFile('.releaserc.json', 'utf8'));
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const readme = await readFile('README.md', 'utf8');
const changelog = await readFile('CHANGELOG.md', 'utf8');
const dependabot = load(await readFile('.github/dependabot.yml', 'utf8'));
const bugForm = load(await readFile('.github/ISSUE_TEMPLATE/bug_report.yml', 'utf8'));
const featureForm = load(await readFile('.github/ISSUE_TEMPLATE/feature_request.yml', 'utf8'));
const issueConfig = load(await readFile('.github/ISSUE_TEMPLATE/config.yml', 'utf8'));
const codeowners = await readFile('.github/CODEOWNERS', 'utf8');
const prTemplate = await readFile('.github/pull_request_template.md', 'utf8');
const nvmrc = (await readFile('.nvmrc', 'utf8')).trim();
const BUF_VERSION = '1.61.0';
const BUF_SETUP_SHA = 'a47c93e0b1648d5651a065437926377d060baa99';

assert.equal(packageJson.engines?.node, '>=24 <25');
assert.equal(nvmrc, '24');
assert.equal(packageLock.version, packageJson.version, 'package-lock root version must match package.json');
assert.equal(packageLock.packages?.['']?.version, packageJson.version, 'package-lock package root version must match package.json');
assert.match(changelog, /^## \[Unreleased\]/m, 'CHANGELOG must include an Unreleased section');
assert.doesNotMatch(changelog, new RegExp(`^## \\[${packageJson.version.replaceAll('.', '\\\.')}\\]`, 'm'), 'current package version must not be listed as released');
assert.equal(packageJson.scripts['check-types'], 'tsc -p tsconfig.json --noEmit && tsc -p tsconfig.tools.json --noEmit');
assert.equal(packageJson.scripts.bundle, 'jiti esbuild.ts');
assert.equal(packageJson.scripts['bundle:prod'], 'jiti esbuild.ts --production');
assert.equal(packageJson.scripts['bundle:analyze'], 'jiti esbuild.ts --production --analyze');
assert.equal(packageJson.devDependencies.jiti, '^2.7.0');
assert.equal(packageJson.scripts['test:package'], 'node scripts/test-package-config.mjs');
assert.equal(dependabot.version, 2);
assert.equal(dependabot.updates.length, 2);
for (const update of dependabot.updates) {
  assert.equal(update.directory, '/');
  assert.equal(update['target-branch'], 'dev');
  assert.equal(update.schedule.interval, 'weekly');
  assert.equal(update.schedule.day, 'monday');
  assert.equal(update.schedule.time, '09:00');
  assert.equal(update.schedule.timezone, 'America/Sao_Paulo');
  assert.ok(update.groups?.['minor-patch']?.['update-types']?.includes('minor'));
  assert.ok(update.groups?.['minor-patch']?.['update-types']?.includes('patch'));
}
assert.equal(dependabot.updates[0]['package-ecosystem'], 'npm');
assert.equal(dependabot.updates[0]['commit-message']?.prefix, 'fix(deps)');
assert.equal(dependabot.updates[0]['open-pull-requests-limit'], 5);
assert.equal(dependabot.updates[1]['package-ecosystem'], 'github-actions');
assert.equal(dependabot.updates[1]['commit-message']?.prefix, 'chore(ci)');
assert.equal(dependabot.updates[1]['open-pull-requests-limit'], 3);
assert.match(codeowners, /^\*\s+@diaszano$/m);
assert.match(codeowners, /^\.github\/\s+@diaszano$/m);
for (const entry of ['Conventional Commits', 'lint', 'typecheck', 'unit', 'integration', 'release', 'VSIX', 'documentation']) {
  assert.match(prTemplate, new RegExp(entry, 'i'));
}
for (const form of [bugForm, featureForm]) {
  assert.equal(form.name?.includes('BufBear'), true);
  assert.ok(Array.isArray(form.body));
}
const requiredField = (form, id) => {
  const field = form.body.find((entry) => entry.id === id);
  assert.ok(field, `${id} field missing`);
  assert.equal(field.validations?.required, true, `${id} must be required`);
};
for (const id of ['vscode', 'os', 'buf', 'bufbear', 'reproduction', 'expected', 'actual']) requiredField(bugForm, id);
for (const id of ['problem', 'solution']) requiredField(featureForm, id);
assert.equal(issueConfig.blank_issues_enabled, false);
assert.match(issueConfig.contact_links?.[0]?.url ?? '', /security\/advisories\/new/);
assert.equal(packageJson.main, './dist/extension.js');
for (const command of packageJson.contributes.commands.map(({ command }) => command)) {
  assert.ok(readme.includes(`\`${command}\``), `README must document ${command}`);
}
for (const setting of Object.keys(packageJson.contributes.configuration.properties)) {
  assert.ok(readme.includes(`\`${setting}\``), `README must document ${setting}`);
}
assert.equal(
  packageJson.scripts.verify,
  'npm run lint && npm run check-types && npm run test:unit',
);
const plugin = (name) =>
  config.plugins.find((entry) => (Array.isArray(entry) ? entry[0] : entry) === name);

assert.deepEqual(config.branches, ['main', { name: 'dev', prerelease: 'dev' }]);
assert.equal(config.tagFormat, 'v${version}');

const analyzer = plugin('@semantic-release/commit-analyzer');
assert.ok(Array.isArray(analyzer));
const rules = new Map(analyzer[1].releaseRules.map(({ type, release }) => [type, release]));
assert.equal(rules.get('feat'), 'minor');
assert.equal(rules.get('fix'), 'patch');
assert.equal(rules.get('perf'), 'patch');
assert.equal(rules.get('revert'), 'patch');
for (const type of ['build', 'chore', 'ci', 'docs', 'refactor', 'style', 'test']) {
  assert.equal(rules.get(type), false);
}

const analyze = (message) =>
  analyzeCommits(analyzer[1], {
    commits: [{ hash: 'release-policy-test', message }],
    cwd: process.cwd(),
    logger: { log() {} },
  });

for (const message of [
  'feat!: break the public API',
  'chore!: break the maintenance API',
  'feat: break the public API\n\nBREAKING CHANGE: callers must migrate',
  'docs: document a breaking API\n\nBREAKING CHANGE: callers must migrate',
]) {
  assert.equal(await analyze(message), 'major', `Expected a major release for: ${message}`);
}

const npmPlugin = plugin('@semantic-release/npm');
assert.equal(npmPlugin[1].npmPublish, false);

const releaseWorkflow = load(await readFile('.github/workflows/release.yml', 'utf8'));
assert.deepEqual(Object.keys(releaseWorkflow.on), ['workflow_call']);
assert.deepEqual(releaseWorkflow.permissions, { contents: 'write' });

const releaseSteps = releaseWorkflow.jobs.release.steps;
assert.ok(
  !releaseSteps.some((entry) => entry['continue-on-error'] === true),
  'semantic-release failures must fail the release job',
);
const step = (name) => releaseSteps.find((entry) => entry.name === name);
assert.ok(step('Checkout repository'), 'Checkout repository step missing');
assert.ok(step('Set up Node.js'), 'Set up Node.js step missing');

const snapshotTags = step('Snapshot release tags');
assert.ok(
  snapshotTags,
  'Release workflow must snapshot the stable SemVer tag set before publishing',
);
assert.equal(
  snapshotTags.run,
  '.github/scripts/resolve-release-tag.sh snapshot "$RUNNER_TEMP/release-tags-before.txt"',
);

const resolveRelease = step('Resolve published version');
assert.equal(
  resolveRelease.run,
  '.github/scripts/resolve-release-tag.sh resolve "$RUNNER_TEMP/release-tags-before.txt" "$GITHUB_OUTPUT"',
);
const marketplace = step('Publish to VS Code Marketplace');
assert.match(
  marketplace.run,
  /bufbear-\$\{\{ steps\.release\.outputs\.version \}\}\.vsix/,
  'Marketplace must publish the VSIX resolved from the release tag',
);

const ciWorkflow = load(await readFile('.github/workflows/ci.yml', 'utf8'));
for (const workflow of [ciWorkflow, load(await readFile('.github/workflows/pr-title.yml', 'utf8')), releaseWorkflow]) {
  assert.equal(JSON.stringify(workflow).toLowerCase().includes('docker'), false, 'Docker jobs are not allowed');
  for (const jobs of Object.values(workflow.jobs ?? {})) for (const entry of jobs.steps ?? []) {
    if (entry.uses?.startsWith('actions/checkout@')) assert.equal(entry.uses, ACTIONS.checkout);
    if (entry.uses?.startsWith('actions/setup-node@')) { assert.equal(entry.uses, ACTIONS.setupNode); assert.equal(String(entry.with?.['node-version']), '24'); }
  }
}
const dependencyReview = ciWorkflow.jobs['dependency-review'].steps.find((entry) => entry.name === 'Dependency Review');
assert.equal(dependencyReview.uses, 'actions/dependency-review-action@3b139cfc5fae8b618d3eae3675e383bb1769c019');
assert.ok(ciWorkflow.jobs.commitlint, 'Job commitlint should exist in ci.yml');
assert.ok(ciWorkflow.jobs.lint, 'Job lint should exist in ci.yml');
assert.ok(ciWorkflow.jobs.test, 'Job test should exist in ci.yml');
assert.ok(ciWorkflow.jobs.build, 'Job build should exist in ci.yml');
assert.deepEqual(ciWorkflow.jobs.quality.needs, ['commitlint','lint','test','test-release','build']);
assert.equal(ciWorkflow.jobs.release.needs, 'quality');
const integrationSteps = ciWorkflow.jobs.test.steps;
const bufSetup = integrationSteps.find((entry) => entry.name === 'Set up pinned Buf CLI');
assert.ok(bufSetup, 'Integration job must install the pinned Buf CLI');
assert.equal(bufSetup.with.version, BUF_VERSION);
assert.equal(bufSetup.uses, `bufbuild/buf-setup-action@${BUF_SETUP_SHA}`);
const bufVerify = integrationSteps.find((entry) => entry.name === 'Verify Buf CLI');
assert.ok(bufVerify, 'Integration job must verify Buf CLI');
assert.equal(bufVerify.env.BUF_VERSION, BUF_VERSION);
const integrationRun = integrationSteps.find((entry) => entry.name === 'Headless Integration Tests');
assert.equal(integrationRun.env.BUF_VERSION, BUF_VERSION);
assert.ok(ciWorkflow.jobs.build.steps.some((entry) => entry.name === 'Verify VSIX package contract' && entry.run === 'npm run test:package'));

const resolver = resolve('.github/scripts/resolve-release-tag.sh');
const repository = await mkdtemp(join(tmpdir(), 'bufbear-release-tags-'));
const beforeTags = join(repository, 'before-tags');
const githubOutput = join(repository, 'github-output');
const run = (command, args) =>
  spawnSync(command, args, { cwd: repository, encoding: 'utf8', env: process.env });
const runChecked = (command, args) => {
  const result = run(command, args);
  assert.equal(result.status, 0, result.stderr);
  return result;
};

try {
  runChecked('git', ['init', '--quiet']);
  runChecked('git', ['config', 'user.name', 'Release Test']);
  runChecked('git', ['config', 'user.email', 'release-test@example.com']);
  runChecked('git', ['commit', '--allow-empty', '--no-gpg-sign', '--message', 'test fixture']);
  runChecked('git', ['tag', 'v1.0.0']);
  runChecked('git', ['tag', 'v999-archive']);

  runChecked(resolver, ['snapshot', beforeTags]);
  runChecked(resolver, ['resolve', beforeTags, githubOutput]);
  assert.equal(await readFile(githubOutput, 'utf8'), 'published=false\n');

  runChecked('git', ['tag', 'v1000-archive']);
  runChecked('git', ['tag', 'v01.2.3']);
  runChecked('git', ['tag', 'v1.2.3-beta.1']);
  await writeFile(githubOutput, '');
  runChecked(resolver, ['resolve', beforeTags, githubOutput]);
  assert.equal(await readFile(githubOutput, 'utf8'), 'published=false\n');

  runChecked('git', ['tag', 'v1.2.3']);
  await writeFile(githubOutput, '');
  runChecked(resolver, ['resolve', beforeTags, githubOutput]);
  assert.equal(await readFile(githubOutput, 'utf8'), 'published=true\nversion=1.2.3\n');

  runChecked('git', ['tag', 'v2.0.0']);
  await writeFile(githubOutput, '');
  const multipleTags = run(resolver, ['resolve', beforeTags, githubOutput]);
  assert.notEqual(multipleTags.status, 0);
  assert.match(multipleTags.stderr, /multiple new stable release tags/i);
} finally {
  await rm(repository, { recursive: true, force: true });
}

console.log('Release configuration test passed cleanly.');
