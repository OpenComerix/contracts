import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { gitReader } from '../../tools/architecture/graph.mjs';
import { prepareToolingCI, withoutToolingCI, pnpmJobs, cacheWriter, removedChecks, ciTests } from '../../scripts/ci/pipeline-v1.mjs';
import { root, actual, text, validateCaptureSource, validateSourceScope,
  captureHistoricalFile, captureHistoricalRegistry } from '../../scripts/inventory/capture-authority-v2.mjs';

const baseline = text(gitReader(root, 'f08aae6f1fdd062c36e09853d24e0eb8395f9e88')('.gitlab-ci.yml'));
const prepared = prepareToolingCI(baseline), before = parse(baseline), after = parse(prepared);
const jobs = document => Object.keys(document).filter(name => name.startsWith('validate:'));
const merge = (left, right) => {
  const result = structuredClone(left);
  for (const [key, value] of Object.entries(right)) result[key] = value && typeof value === 'object' &&
    !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
    ? merge(result[key], value) : structuredClone(value);
  return result;
};
function resolve(name) {
  const job = after[name];
  return merge(job.extends ? resolve(job.extends) : {}, job);
}

test('checked-in CI equals the complete closed preparation delta and preserves the capture proof', () => {
  assert.equal(text(actual('.gitlab-ci.yml')), prepared);
  assert.equal(withoutToolingCI(prepared), baseline);
  assert.deepEqual(jobs(after), jobs(before));
  assert.equal(jobs(after).length, 22);
  validateSourceScope();
});

test('only covered duplicate commands are removed; images, stages, artifacts and edges remain exact', () => {
  assert.deepEqual(after.default, before.default);
  assert.deepEqual(after.stages, before.stages);
  for (const name of jobs(before)) {
    for (const field of ['image', 'stage', 'artifacts', 'needs', 'rules', 'allow_failure'])
      assert.deepEqual(after[name][field], before[name][field], name + '/' + field);
    const expected = before[name].script.filter(command =>
      !removedChecks.some(check => check.job === name && check.command === command));
    if (name === 'validate:contract-architecture') expected.splice(1, 0, ciTests);
    assert.deepEqual(after[name].script, expected, name + '/script');
    if (pnpmJobs.includes(name)) {
      const old = before[name].before_script, next = after[name].before_script;
      assert(old.filter(command => command.startsWith('apt-get')).every(command => next.includes(command)));
      assert(next.includes('pnpm install --frozen-lockfile --ignore-scripts --prefer-offline'));
      assert(next.includes('pnpm config set store-dir .pnpm-store'));
      assert(!next.some(command => /--offline\b|\|\|\s*true/.test(command)));
    }
  }
});

test('every removed check has its stricter lint or identical test file covered in a retained job', () => {
  assert.equal(removedChecks.length, 14);
  for (const check of removedChecks) {
    assert(before[check.job].script.includes(check.command));
    for (const command of check.coverage) assert(after[check.coverageJob].script.includes(command));
    if (check.command.startsWith('npx')) {
      const files = check.command.split(' lint ')[1].split(' ');
      assert.deepEqual(check.coverage.map(command => command.split(' ').slice(2).join(' ') ||
        'openapi/identity-onboarding-v1.yaml'), files);
    } else {
      const file = check.command.split(' ').at(-1);
      assert(fs.existsSync(path.join(root, file)));
      assert.equal(check.coverage[0].split(' ').at(-1), path.posix.dirname(file) + '/*.test.mjs');
    }
  }
  assert(after['validate:openapi'].script.includes(
    'npx --yes @redocly/cli@2.53.3 lint openapi/pos-sales-v1.yaml openapi/pos-sync-v1.json'));
});

test('resolved node jobs share versioned caches with exactly one existing writer', () => {
  const writers = new Map();
  for (const name of jobs(after)) {
    const job = resolve(name), caches = job.cache ? [].concat(job.cache) : [];
    if (!pnpmJobs.includes(name) && name !== 'validate:openapi') assert.equal(caches.length, 0);
    for (const cache of caches) {
      const key = JSON.stringify(cache.key);
      const policy = job.variables.CONTRACTS_CACHE_POLICY;
      assert.equal(cache.policy, '$CONTRACTS_CACHE_POLICY');
      assert.equal(policy, name === cacheWriter ? 'pull-push' : 'pull');
      assert(cache.paths.every(value => !/node_modules|_logs|\.npmrc|\.env/.test(value)));
      if (policy === 'pull-push') writers.set(key, [...(writers.get(key) ?? []), name]);
    }
  }
  assert.equal(writers.size, 2);
  for (const owners of writers.values()) assert.deepEqual(owners, [cacheWriter]);
  assert.equal([].concat(resolve('validate:openapi').cache).length, 1);
  const pnpm = [].concat(resolve(cacheWriter).cache)[1];
  assert.deepEqual(pnpm.key.files, ['pnpm-lock.yaml']);
  assert.equal(pnpm.key.prefix, 'node24.21.0-pnpm12.4.2-bookworm-v1');
  assert.deepEqual(pnpm.paths, ['.pnpm-store/', '.corepack-cache/']);
});

for (const [name, mutate] of [
  ['gate removed', value => value.replace('    - pnpm registry:check\n', '')],
  ['tool version', value => value.replace('node:24.21.0-bookworm-slim', 'node:25-bookworm-slim')],
  ['unapproved cache', value => value.replace('.npm-cache/_cacache/', '.env/')],
  ['extra writer', value => value.replace('CONTRACTS_CACHE_POLICY: pull\n', 'CONTRACTS_CACHE_POLICY: pull-push\n')],
  ['schema edge', value => value.replace('    - job: validate:openapi\n', '    - job: unapproved\n')],
  ['unfrozen install', value => value.replaceAll('--frozen-lockfile', '--no-frozen-lockfile')],
]) test('current source refuses CI drift: ' + name, () => {
  const wrong = Buffer.from(mutate(prepared));
  assert.notEqual(text(wrong), prepared);
  assert.throws(() => validateCaptureSource(file => file === '.gitlab-ci.yml' ? wrong : actual(file)), /IC2_EXACT_SOURCE/);
  assert.equal(captureHistoricalFile('.gitlab-ci.yml', wrong), wrong);
});

for (const file of ['scripts/ci/pipeline-v1.mjs', 'test/ci/pipeline-v1.test.mjs', '.gitignore', 'test/catalog/history-protection-v1.test.mjs'])
  for (const change of ['changed', 'missing'])
    test('warm projections still validate the preparation sources: ' + file + '/' + change, t => {
      const registryBytes = actual('registry/contracts.json'), registry = JSON.parse(registryBytes);
      validateCaptureSource();
      captureHistoricalFile('registry/contracts.json', registryBytes);
      captureHistoricalRegistry(registry);
      const original = fs.readFileSync.bind(fs), target = path.join(root, file);
      let reads = 0;
      t.mock.method(fs, 'readFileSync', (name, ...options) => {
        if (typeof name === 'string' && path.resolve(name) === target) {
          reads++;
          if (change === 'missing') throw Error('Synthetic preparation source unavailable');
          return Buffer.concat([original(name, ...options), Buffer.from('\nUnapproved')]);
        }
        return original(name, ...options);
      });
      assert.throws(() => validateCaptureSource());
      assert.throws(() => captureHistoricalFile('registry/contracts.json', registryBytes));
      assert.throws(() => captureHistoricalRegistry(registry));
      assert.equal(reads, 3);
    });
