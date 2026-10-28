import { readRepositoryFile, retiredCIRevision } from '../../scripts/ci/retired-gitlab-v1.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { checkContractLayout } from '../../tools/architecture/layout.mjs';
import { root, actual, validateCaptureSource, captureHistoricalFile } from '../../scripts/inventory/capture-authority-v2.mjs';

const workflowPath = '.github/workflows/ci.yml';
const workflow = parse(actual(workflowPath).toString('utf8'));
const legacy = parse(readRepositoryFile('.gitlab-ci.yml').toString('utf8'));
const id = name => name.replaceAll(/[^A-Za-z0-9_]/g, '_');
test('GitHub preserves all 22 contract jobs, exact validation commands and artifact edges', () => {
  const names = Object.keys(legacy).filter(name => name.startsWith('validate:'));
  assert.deepEqual(Object.values(workflow.jobs).map(job => job.name), names);
  assert.equal(names.length, 22);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  for (const name of names) {
    const job = workflow.jobs[id(name)];
    const run = job.steps.find(step => step.name === 'Run original validation commands').run;
    let previous = -1;
    for (const command of legacy[name].script) {
      const position = run.indexOf(command, previous + 1);
      assert(position > previous, name + '/' + command);
      previous = position;
    }
    assert.deepEqual(job.needs ?? [], (legacy[name].needs ?? []).map(need => id(need.job)));
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
test('warm source validation does not project away changed or missing GitHub workflow bytes', () => {
  validateCaptureSource();
  assert.throws(() => validateCaptureSource(file => file === workflowPath ? Buffer.from('unapproved') : actual(file)), /GITHUB_MIGRATION_BYTES/);
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

for (const file of ["test/sales/release-v1.test.mjs","test/sales/package-v2.test.mjs","test/finance/package-v1.test.mjs","test/inventory/package-v1.test.mjs","test/catalog/asyncapi-preservation-v1.test.mjs",'scripts/ci/retired-gitlab-v1.mjs', 'scripts/finance/reviewed-package-v1.mjs',
  'scripts/sales/reviewed-package-v2.mjs', 'scripts/sales/release-v1.mjs', 'scripts/inventory/candidate-v1.mjs',
  'scripts/identity/inventory-authority-consumer-v1.mjs', 'scripts/sales/inventory-step-consumer-v1.mjs',
  'scripts/validate-gateway-identity-policy.mjs', 'scripts/validate-gateway-identity-policy-v2.mjs',
  'README.md', 'catalog/README.md'])
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
