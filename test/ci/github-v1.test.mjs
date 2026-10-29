import { readRepositoryFile, retiredCIRevision, withRetiredCI } from '../../scripts/ci/retired-gitlab-v1.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { checkContractLayout } from '../../tools/architecture/layout.mjs';
import { root, actual, validateCaptureSource, captureHistoricalFile } from '../../scripts/inventory/capture-authority-v2.mjs';

const workflowPath = '.github/workflows/ci.yml';
const workflow = parse(actual(workflowPath).toString('utf8'));
const legacy = parse(readRepositoryFile('.gitlab-ci.yml').toString('utf8'));
const id = name => name.replaceAll(/[^A-Za-z0-9_]/g, '_');
const parallelCommands = new Map([
  ['validate:sales-contracts', new Map([
    ['node --test --test-reporter=tap test/sales/*.test.mjs', 'node --test --test-reporter=tap --test-concurrency=2 test/sales/*.test.mjs'],
  ])],
  ['validate:contract-architecture', new Map([
    ['pnpm test:architecture', 'node --test --test-concurrency=2 test/architecture/*.test.mjs'],
  ])],
  ['validate:identity-catalog-contracts', new Map([
    ['node --test test/identity/*.test.mjs', 'node --test --test-concurrency=2 test/identity/*.test.mjs'],
  ])],
]);
test('GitHub preserves all 22 contract jobs, exact validation commands and artifact edges', () => {
  const names = Object.keys(legacy).filter(name => name.startsWith('validate:'));
  assert.deepEqual(Object.values(workflow.jobs).map(job => job.name), ['validate:scope', ...names]);
  assert.equal(names.length, 22);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  for (const name of names) {
    const job = workflow.jobs[id(name)];
    const run = job.steps.find(step => step.name === 'Run original validation commands').run;
    let previous = -1;
    for (const command of legacy[name].script) {
      const expected = parallelCommands.get(name)?.get(command) ?? command;
      const position = run.indexOf(expected, previous + 1);
      assert(position > previous, name + '/' + command);
      previous = position;
    }
    assert.deepEqual(job.needs, ['validation_scope', ...(legacy[name].needs ?? []).map(need => id(need.job))]);
    assert.equal(job.if, "needs.validation_scope.outputs.mode == 'full'");
    assert(!JSON.stringify(job).includes('continue-on-error'));
    assert(job.steps.filter(step => step.uses).every(step => /@[a-f0-9]{40}$/.test(step.uses)));
    if (legacy[name].artifacts) {
      const packaging = job.steps.find(step => step.name === 'Package original artifact paths');
      for (const artifact of legacy[name].artifacts.paths) assert(packaging.run.includes(artifact));
      assert(packaging.run.includes('tar -czf'));
      assert(job.steps.some(step => step.name === 'Upload validation artifacts'));
    }
  }
});
test('scope selection preserves the entire reviewed full jobs and avoids duplicate PR runs', () => {
  const prior = parse(createGitReader()(root, '7015bada29c4e291f465d98af7a13ce95f5ce5ab')(workflowPath).toString('utf8'));
  for (const [key, previous] of Object.entries(prior.jobs)) {
    const { needs, if: condition, ...current } = workflow.jobs[key];
    const { needs: originalNeeds, ...original } = previous;
    if (key === 'validate_sales_contracts') {
      const step = original.steps.find(step => step.name === 'Run original validation commands');
      step.run = step.run.replace('node --test --test-reporter=tap test/sales/*.test.mjs', 'node --test --test-reporter=tap --test-concurrency=2 test/sales/*.test.mjs');
    }
    assert.deepEqual(current, original, key);
    assert.deepEqual(needs, ['validation_scope', ...(originalNeeds ?? [])]);
    assert.equal(condition, "needs.validation_scope.outputs.mode == 'full'");
  }
  assert.deepEqual(workflow.on, { push: null, workflow_dispatch: null });
  const scope = workflow.jobs.validation_scope;
  assert.equal(scope.name, 'validate:scope');
  assert.equal(scope.outputs.mode, '${{ steps.scope.outputs.mode }}');
  assert.equal(scope.steps.find(step => step.id === 'scope').run, 'node scripts/ci/validation-scope-v1.mjs');
  assert.equal(scope.steps.find(step => step.id === 'dependencies').with['install-mode'], 'ignore-scripts');
  assert(scope.steps.filter(step => step.uses).every(step => /@[a-f0-9]{40}$/.test(step.uses)));
  assert.equal(scope.steps.find(step => step.uses?.startsWith('actions/checkout@')).with['fetch-depth'], 0);
  assert(!JSON.stringify(scope).includes('continue-on-error'));
});

for (const file of ['scripts/ci/validation-scope-v1.mjs', 'test/ci/validation-scope-v1.test.mjs'])
  test('warm source guard rejects changed or missing scope infrastructure: ' + file, () => {
    validateCaptureSource();
    assert.throws(() => validateCaptureSource(name => name === file ? Buffer.from('changed') : actual(name)), /CI_SCOPE_BYTES/);
    assert.throws(() => validateCaptureSource(name => { if (name === file) throw Error('Synthetic scope missing'); return actual(name); }), /Synthetic scope missing/);
  });
test('warm source validation does not project away changed or missing GitHub workflow bytes', () => {
  validateCaptureSource();
  assert.throws(() => validateCaptureSource(file => file === workflowPath ? Buffer.from('unapproved') : actual(file)), /IC2A_EXACT_METADATA/);
  assert.throws(() => validateCaptureSource(file => { if (file === workflowPath) throw Error('Synthetic workflow missing'); return actual(file); }), /Synthetic workflow missing/);
});
test('only the canonical GitHub workflow is infrastructure; hidden contracts remain rejected', t => {
  const fixture = fs.mkdtempSync(path.join(tmpdir(), 'oc-github-layout-'));
  t.after(() => {
    assert(path.resolve(fixture).startsWith(path.resolve(tmpdir()) + path.sep + 'oc-github-layout-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  const put = (file, text) => { fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true }); fs.writeFileSync(path.join(fixture, file), text); };
  put('registry/contracts.json', JSON.stringify({ formatVersion: 1, domains: ['identity'], contracts: [{ domain: 'identity' }], planned: [], preservedFiles: [] }));
  put('identity/http/public/v1/api.yaml', 'openapi: 3.1.0\n');
  put(workflowPath, 'name: Synthetic CI\n');
  assert.equal(checkContractLayout(fixture).files, 1);
  put('.github/schema.json', '{}\n');
  assert.throws(() => checkContractLayout(fixture), /LAYOUT_UNKNOWN_GITHUB_INFRASTRUCTURE/);
});

test('retired GitLab CI comes only from the preserved immutable commit', t => {
  assert.match(retiredCIRevision, /^[a-f0-9]{40}$/);
  assert.equal(fs.existsSync(path.join(root, '.gitlab-ci.yml')), false);
  const original = fs.existsSync.bind(fs);
  t.mock.method(fs, 'existsSync', file => path.resolve(file) === path.join(root, '.gitlab-ci.yml') || original(file));
  assert.throws(() => readRepositoryFile('.gitlab-ci.yml'), /RETIRED_GITLAB_CI_REINTRODUCED/);
  assert.throws(() => validateCaptureSource(), /RETIRED_GITLAB_CI_REINTRODUCED/);
});

for (const file of ["test/architecture/asyncapi-admission-v1.test.mjs","scripts/catalog/catalog-delivery-v1-registry.mjs","scripts/catalog/catalog-operational-recovery-v1-registry.mjs","scripts/catalog/catalog-consumption-v1-registry.mjs","test/architecture/catalog-delivery.test.mjs","test/architecture/catalog-operational-recovery.test.mjs","test/architecture/catalog-consumption.test.mjs","test/sales/release-v1.test.mjs","test/sales/package-v2.test.mjs","test/finance/package-v1.test.mjs","test/inventory/package-v1.test.mjs","test/catalog/asyncapi-preservation-v1.test.mjs",'scripts/ci/retired-gitlab-v1.mjs', 'scripts/finance/reviewed-package-v1.mjs',
  'scripts/sales/reviewed-package-v2.mjs', 'scripts/sales/release-v1.mjs', 'scripts/inventory/candidate-v1.mjs',
  'scripts/identity/inventory-authority-consumer-v1.mjs', 'scripts/sales/inventory-step-consumer-v1.mjs',
  'scripts/validate-gateway-identity-policy.mjs', 'scripts/validate-gateway-identity-policy-v2.mjs',
  'README.md', 'catalog/README.md', 'test/sales/inventory-step-consumer-v1.test.mjs'])
  for (const mutation of ['changed', 'missing'])
    test('warmed historical projections reject retired tooling drift: ' + file + '/' + mutation, t => {
      const registry = actual('registry/contracts.json');
      validateCaptureSource();
      captureHistoricalFile('registry/contracts.json', registry);
      const original = fs.readFileSync.bind(fs), target = path.resolve(root, file);
      t.mock.method(fs, 'readFileSync', (name, ...options) => {
        if (typeof name === 'string' && path.resolve(name) === target) {
          if (mutation === 'missing') throw Error('Synthetic retired source unavailable');
          return Buffer.concat([original(name, ...options), Buffer.from('\nUnapproved')]);
        }
        return original(name, ...options);
      });
      assert.throws(() => validateCaptureSource());
      assert.throws(() => captureHistoricalFile('registry/contracts.json', registry));
    });

test('retired CI adapter preserves the live reader and all its errors', () => {
  const bytes = Buffer.from('synthetic live source');
  const read = withRetiredCI(file => { assert.equal(file, 'current.json'); return bytes; });
  assert.equal(read('current.json'), bytes);
  assert.equal(read('.gitlab-ci.yml').toString('utf8'), readRepositoryFile('.gitlab-ci.yml').toString('utf8'));
  assert.throws(() => withRetiredCI(() => { throw Error('Original path boundary'); })('outside.json'), /Original path boundary/);
});
