import assert from 'node:assert/strict';
import { consumerReadView } from '../../scripts/identity/catalog-workload-consumers-v2-registry.mjs';
import { workloadChangedFiles, validateWorkloadPackage } from '../../scripts/identity/catalog-workload-profiles-v2-registry.mjs';
import { workloadReadView } from '../../scripts/identity/catalog-workload-profiles-v2-registry.mjs';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock, impactForConsumer, worktreeReader } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { deliverySnapshotPath, validateDeliverySnapshot } from '../../scripts/catalog/catalog-delivery-v1-registry.mjs';
import { admissionBase, admissionId, admittedRegistry, asyncapiAdmissionRegistryView,
  root, validateAsyncapiAdmission } from '../../scripts/catalog/asyncapi-admission-v1.mjs';

const source = gitReader(root, admissionBase);
const baseline = JSON.parse(source('registry/contracts.json'));
const historicalRead = workloadReadView(file => fs.readFileSync(path.join(root, file)));
const registry = JSON.parse(historicalRead('registry/contracts.json'));
const row = registry.contracts.find(item => item.id === admissionId);
const read = worktreeReader(root);
const manifest = role => ({ formatVersion: 1, service: 'catalog-pricing',
  contracts: [{ id: admissionId, version: row.version, role, operations: [], pointers: [''],
    purpose: 'Test selected admission without changing any real consumer.', gates: ['pnpm test:architecture'] }],
  assets: [], bindings: [] });
const bytes = value => Buffer.from(JSON.stringify(value));

test('N admits only the certified AsyncAPI descriptor and its derived index, preserving source provenance', () => {
  assert.deepEqual(validateAsyncapiAdmission(registry), { admitted: 1, roots: 119, preserved: 236,
    planned: 3, other_drafts: 12, closure_files: 7, runtime_demonstrated: false });
  assert.deepEqual(registry, admittedRegistry());
  const prior = baseline.contracts.find(item => item.id === admissionId);
  assert.equal(prior.status, 'draft');
  assert.equal(row.status, 'active');
  for (const key of Object.keys(prior).filter(key => !['status', 'purpose', 'reasonForChange'].includes(key)))
    assert.deepEqual(row[key], prior[key], key);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'catalog/index.json'), 'utf8')), domainIndex(registry, 'catalog'));
  const before = structuredClone(registry);
  assert.deepEqual(asyncapiAdmissionRegistryView(registry), baseline);
  assert.deepEqual(registry, before, 'projection does not mutate input');
  assert.equal(asyncapiAdmissionRegistryView(baseline), baseline, 'historical input keeps original diagnostics');
  const statusOnly = structuredClone(baseline);
  statusOnly.contracts.find(item => item.id === admissionId).status = 'active';
  assert.equal(asyncapiAdmissionRegistryView(statusOnly), statusOnly, 'unauthorized historical promotion reaches original gates');
});

for (const role of ['producer', 'consumer', 'semantic-owner']) {
  test('N allows initial and pinned functional selection and unchanged impact: ' + role, () => {
    const m = manifest(role), body = bytes(m);
    const forbidden = /New use of a draft is forbidden: catalog\.events\.v1\.asyncapi/;
    assert.throws(() => makeLock(root, m, body, baseline), forbidden);
    const observation = makeLock(root, manifest('validation'), bytes(manifest('validation')), baseline).entries[0];
    assert.throws(() => makeLock(root, m, body, baseline, [{ ...observation, role }]), forbidden);
    const lock = makeLock(root, m, body, registry);
    assert.equal(lock.entries[0].commit, row.commit);
    assert.equal(lock.entries[0].files.length, 7);
    assert.deepEqual(lock.entries, [{ ...observation, role }]);
    assert.deepEqual(makeLock(root, m, body, registry, lock.entries), lock);
    assert.deepEqual(impactForConsumer({ manifest: m, lock }, registry, read),
      { service: 'catalog-pricing', affected: false, dependencies: [] });
    const oldImpact = impactForConsumer({ manifest: m, lock }, baseline, read);
    assert.equal(oldImpact.dependencies[0].classification, 'unresolved');
    assert.match(oldImpact.dependencies[0].decision, forbidden);
  });
}

const functional = makeLock(root, manifest('producer'), bytes(manifest('producer')), registry);
const dependencies = registry.contracts.filter(item => item.id !== admissionId &&
  functional.entries[0].files.some(file => file.path === item.path));
assert.equal(dependencies.length, 6);
for (const dependency of dependencies) {
  test('N retains draft rejection throughout the selected closure: ' + dependency.id, () => {
    const blocked = structuredClone(registry);
    blocked.contracts.find(item => item.id === dependency.id).status = 'draft';
    for (const role of ['producer', 'consumer', 'semantic-owner']) {
      const m = manifest(role), lock = makeLock(root, m, bytes(m), registry);
      const forbidden = error => error.message === 'New use of a draft is forbidden: ' + dependency.id;
      assert.throws(() => makeLock(root, m, bytes(m), blocked), forbidden);
      assert.throws(() => makeLock(root, m, bytes(m), blocked, lock.entries), forbidden);
      const report = impactForConsumer({ manifest: m, lock }, blocked, read);
      assert.equal(report.dependencies[0].classification, 'unresolved');
      assert.equal(report.dependencies[0].decision, 'New use of a draft is forbidden: ' + dependency.id);
    }
  });
}

for (const [name, change] of [
  ['partial metadata transition', r => { r.contracts.find(item => item.id === admissionId).purpose = baseline.contracts.find(item => item.id === admissionId).purpose; }],
  ['draft rollback', r => { r.contracts.find(item => item.id === admissionId).status = 'draft'; }],
  ['unrelated draft promoted', r => { r.contracts.find(item => item.status === 'draft').status = 'active'; }],
  ['source revision changed', r => { r.contracts.find(item => item.id === admissionId).commit = admissionBase; }],
  ['transport hash changed', r => { r.contracts.find(item => item.id === admissionId).sha256 = '0'.repeat(64); }],
  ['surface changed', r => { r.contracts.find(item => item.id === admissionId).surface = 'events'; }],
  ['URI mapping widened', r => { r.contracts.find(item => item.id === admissionId).uriMappings.push({ uri: 'https://example.invalid/other', path: 'events/other.json' }); }],
  ['root removed', r => { r.contracts.pop(); }],
  ['planned removed', r => { r.planned.pop(); }],
  ['preservation removed', r => { r.preservedFiles.pop(); }],
  ['consumer added', r => { r.requiredConsumers.push('unapproved'); }],
  ['coverage changed', r => { r.coverage = 'unapproved'; }],
  ['metadata added', r => { r.unapproved = true; }],
]) test('N rejects admission drift before projecting historical evidence: ' + name, () => {
  const wrong = structuredClone(registry); change(wrong);
  assert.throws(() => validateAsyncapiAdmission(wrong), /N_ADMISSION_REGISTRY/);
  const wrongRow = wrong.contracts.find(item => item.id === admissionId);
  if (!isDeepStrictEqual(wrongRow, row)) {
    assert.throws(() => asyncapiAdmissionRegistryView(wrong), /N_ADMISSION_DESCRIPTOR/);
  } else {
    const expected = structuredClone(wrong);
    expected.contracts[expected.contracts.findIndex(item => item.id === admissionId)] = baseline.contracts.find(item => item.id === admissionId);
    assert.deepEqual(asyncapiAdmissionRegistryView(wrong), expected, 'unrelated drift is preserved for the original gates');
  }
});

for (const file of functional.entries[0].files) {
  test('N detects local transport drift: ' + file.path, () => {
    const changedRead = name => name === file.path ? Buffer.concat([read(name), Buffer.from('\n')]) : read(name);
    assert.throws(() => validateAsyncapiAdmission(registry, changedRead), /N_ADMISSION_BYTES/);
  });
}

for (const draft of registry.contracts.filter(item => item.status === 'draft')) {
  test('N keeps the functional prohibition on unselected drafts: ' + draft.id, () => {
    for (const role of ['producer', 'consumer', 'semantic-owner']) {
      const m = manifest(role);
      m.contracts[0] = { ...m.contracts[0], id: draft.id, version: draft.version };
      const observation = { ...m, contracts: [{ ...m.contracts[0], role: 'validation' }] };
      const pin = { ...makeLock(root, observation, bytes(observation), registry).entries[0], role };
      const forbidden = error => error.message === 'New use of a draft is forbidden: ' + draft.id;
      assert.throws(() => makeLock(root, m, bytes(m), registry), forbidden);
      assert.throws(() => makeLock(root, m, bytes(m), registry, [pin]), forbidden);
      const impact = impactForConsumer({ manifest: m, lock: { entries: [pin], assets: [] } }, registry, read);
      assert.equal(impact.dependencies[0].classification, 'unresolved');
    }
  });
}

test('N preserves published transports, consumers, CI and dependencies and confines changes to the reviewed cut', () => {
  const allowed = new Set(['registry/contracts.json', 'catalog/index.json', 'catalog/README.md',
    'scripts/catalog/asyncapi-admission-v1.mjs', 'scripts/catalog/catalog-lifecycle-v1-registry.mjs',
    'test/architecture/asyncapi-admission-v1.test.mjs', 'test/catalog/asyncapi-preservation-v1.test.mjs']);
  allowed.add('test/architecture/catalog-foundation.test.mjs');
  allowed.add('test/identity/candidate-preservation.test.mjs');
  allowed.add('test/identity/catalog-admission-v1.test.mjs');
  allowed.add('test/identity/catalog-recovery-renewal-v2.test.mjs');
  allowed.add('test/identity/catalog-recovery-renewal-admission-v2.test.mjs');
  // The separately approved export is checked in full, not exempted by path.
  allowed.add(deliverySnapshotPath);
  allowed.add('scripts/catalog/catalog-delivery-v1-registry.mjs');
  allowed.add('test/architecture/catalog-delivery.test.mjs');
  // O2 validates the complete recovery export before the existing N comparison.
  allowed.add('scripts/catalog/catalog-operational-recovery-v1-registry.mjs');
  allowed.add('test/architecture/catalog-operational-recovery.test.mjs');
  allowed.add('registry/README.md');
  validateWorkloadPackage();
  for (const file of workloadChangedFiles) allowed.add(file);
  const changed = execFileSync('git', ['diff', '--name-only', admissionBase, '--', '.'], { cwd: root, encoding: 'utf8' }).trim();
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim();
  for (const file of [changed, untracked].filter(Boolean).flatMap(text => text.split('\n')))
    assert(allowed.has(file), 'N_ADMISSION_SCOPE:' + file);
  const preserved = ['.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'registry/consumers/index.json',
    ...registry.requiredConsumers.map(name => 'registry/consumers/' + name + '.json'),
    ...registry.contracts.map(item => item.path)];
  for (const file of new Set(preserved)) {
    if (file === deliverySnapshotPath) validateDeliverySnapshot(JSON.parse(read(file)));
    else assert(consumerReadView(read)(file).equals(source(file)), 'N_ADMISSION_PRESERVED:' + file);
  }
});
