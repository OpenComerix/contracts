import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { checkContractLayout } from '../../tools/architecture/layout.mjs';
import { root, actual, validateCaptureSource } from '../../scripts/inventory/capture-authority-v2.mjs';

const workflowPath = '.github/workflows/ci.yml';
const workflow = parse(actual(workflowPath).toString('utf8'));
const legacy = parse(actual('.gitlab-ci.yml').toString('utf8'));
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
