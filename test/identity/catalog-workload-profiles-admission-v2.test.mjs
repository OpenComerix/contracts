import { withF110ADesignScope } from '../support/f1-10a-scope.mjs';
import assert from 'node:assert/strict';
import { consumerReadView, validateWorkloadConsumers } from '../../scripts/identity/catalog-workload-consumers-v2-registry.mjs';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitReader, makeLock, resolveSelection, impactForConsumer, worktreeReader } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { validateIdentityAdmission } from '../../scripts/identity/validate-catalog-admission-v1.mjs';
import { validateRenewalRegistry } from '../../scripts/identity/catalog-recovery-renewal-v2-registry.mjs';
import { validateAsyncapiAdmission, asyncapiAdmissionRegistryView } from '../../scripts/catalog/asyncapi-admission-v1.mjs';
import { foundationRegistryView } from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';
import { validateDeliveryPreservation } from '../../scripts/catalog/catalog-delivery-v1-registry.mjs';
import { validateOperationalPreservation } from '../../scripts/catalog/catalog-operational-recovery-v1-registry.mjs';
import { root, workloadSource, workloadSourceRegistry, workloadAdmittedRegistry, workloadAdmissionRows,
  workloadRegistryView, workloadReadView, validateWorkloadRegistry, validateWorkloadPackage, workloadChangedFiles
} from '../../scripts/identity/catalog-workload-profiles-v2-registry.mjs';

const source = gitReader(root, workloadSource), read = worktreeReader(root);
const baseline = workloadSourceRegistry(), actual = JSON.parse(read('registry/contracts.json'));
const rows = [
  ['identity.catalog-workload-profiles.policy.v2', 'identity/http/shared/v2/identity-catalog-workload-profiles-v2.json', 'policy', '2', 'bc868e4970bc8900c8053fce5f79ab34bc2fcf61fa42dffe90e717a144258626'],
  ['identity.catalog-workload-profiles.fixtures.v2', 'identity/fixtures/catalog-workload/v2/catalog-workload-profiles-v2-vectors.json', 'validation', 'v2', '22f8e4cd30d6a58dae2fed234eda4ef3cf107091697ed09e844a06eaba09a621'],
];
const historical = [workloadRegistryView, asyncapiAdmissionRegistryView, foundationRegistryView, validateIdentityAdmission, validateRenewalRegistry, validateAsyncapiAdmission];
const first = registry => registry.contracts[119];

test('O3 admits exactly two roots and derived identity index without changing prior descriptors, metadata or intentions', () => {
  assert.deepEqual(validateWorkloadPackage(), { admitted: 2, roots: 121, prior_roots: 119, preserved: 236, planned: 3, runtime_demonstrated: false });
  const expected = { ...baseline, contracts: [...baseline.contracts, ...workloadAdmissionRows()] };
  assert.deepEqual(actual, expected);
  assert.equal(actual.contracts.length, 121); assert.equal(actual.preservedFiles.length, 236);
  assert.deepEqual(actual.contracts.slice(0, 119), baseline.contracts);
  assert.deepEqual(actual.planned.map(row => row.id), ['sales.complete-snapshot.successor', 'common.data-lifecycle-policy.v1', 'catalog.history-policy.v1']);
  assert.deepEqual(JSON.parse(read('identity/index.json')), domainIndex(actual, 'identity'));
  const before = structuredClone(actual);
  assert.deepEqual(workloadRegistryView(actual), baseline);
  assert.deepEqual(actual, before);
  assert.equal(workloadRegistryView(baseline), baseline);
  const copy = workloadAdmittedRegistry(); copy.contracts.pop();
  assert.equal(workloadAdmittedRegistry().contracts.length, 121);
});

for (const [id, file, surface, version, hash] of rows) test('O3 pins the selected source and one-file closure: ' + id, () => {
  const row = actual.contracts.find(row => row.id === id);
  assert.deepEqual([row.path, row.surface, row.version, row.domain, row.owner, row.status], [file, surface, version, 'identity', 'identity-tenancy', 'active']);
  assert.deepEqual([row.commit, row.tag, row.tagObject, row.sha256, row.operations, row.uriMappings], [workloadSource, null, null, hash, [], []]);
  assert.equal(sha256(source(file)), hash); assert(read(file).equals(source(file)));
  for (const role of ['consumer', 'producer', 'semantic-owner', 'validation', 'documentation']) {
    const manifest = { formatVersion: 1, service: 'identity-tenancy', contracts: [{ id, role, version, operations: [], pointers: [''],
      purpose: 'Synthetic admission check only; no real consumer migration.', gates: ['node --test test/identity/*.test.mjs'] }], assets: [], bindings: [] };
    const body = Buffer.from(JSON.stringify(manifest));
    assert.throws(() => makeLock(root, manifest, body, baseline), /Unknown\/unmaterialized contract/);
    const lock = makeLock(root, manifest, body, actual);
    const closure = resolveSelection(source, row, manifest.contracts[0], actual);
    assert.equal(lock.entries[0].commit, workloadSource);
    assert.deepEqual(lock.entries[0].files, [{ path: file, sha256: hash }]);
    assert.deepEqual(lock.entries[0].units, closure.units);
    assert.equal(lock.entries[0].selectionSha256, closure.selectionSha256);
    assert.deepEqual(makeLock(root, manifest, body, actual, lock.entries), lock);
    assert.deepEqual(impactForConsumer({ manifest, lock }, actual, read), { service: 'identity-tenancy', affected: false, dependencies: [] });
    const blocked = structuredClone(actual); blocked.contracts.find(row => row.id === id).status = 'draft';
    if (['consumer', 'producer', 'semantic-owner'].includes(role)) {
      assert.throws(() => makeLock(root, manifest, body, blocked), /New use of a draft is forbidden/);
      assert.throws(() => makeLock(root, manifest, body, blocked, lock.entries), /New use of a draft is forbidden/);
      assert.equal(impactForConsumer({ manifest, lock }, blocked, read).dependencies[0].classification, 'unresolved');
    }
  }
});

for (const [name, change] of [
  ['one omitted', r => r.contracts.pop()],
  ['duplicate', r => r.contracts.push(structuredClone(first(r)))],
  ['reordered', r => r.contracts.splice(119, 2, ...r.contracts.slice(119).reverse())],
  ['unrelated root', r => r.contracts.push({ ...first(r), id: 'identity.unapproved' })],
  ['prior descriptor changed', r => { r.contracts[0].purpose += ' changed'; }],
  ['prior draft admitted', r => { r.contracts.find(row => row.status === 'draft').status = 'active'; }],
  ['prior omitted', r => r.contracts.shift()],
  ['preservation removed', r => r.preservedFiles.pop()],
  ['new intention', r => r.planned.push({ id: 'identity.unapproved', status: 'planned' })],
  ['intention removed', r => r.planned.pop()],
  ['coverage broadened', r => r.requiredConsumers.push('unapproved')],
  ['metadata changed', r => { r.coverage = 'unapproved'; }],
  ['new metadata', r => { r.unapproved = true; }],
  ['wrong commit', r => { first(r).commit = '19f143d3d0a948b45d8d52614401cdd788df1376'; }],
  ['mutable ref', r => { first(r).commit = 'dev'; }],
  ['wrong hash', r => { first(r).sha256 = '0'.repeat(64); }],
  ['invented tag', r => { first(r).tag = 'unapproved'; }],
  ['invented tag object', r => { first(r).tagObject = 'a'.repeat(40); }],
  ['wrong version', r => { first(r).version = '3'; }],
  ['wrong owner', r => { first(r).owner = 'catalog-pricing'; }],
  ['wrong domain', r => { first(r).domain = 'catalog'; }],
  ['wrong surface', r => { first(r).surface = 'http-private'; }],
  ['wrong path', r => { first(r).path = rows[1][1]; }],
  ['draft root', r => { first(r).status = 'draft'; }],
  ['missing purpose', r => { delete first(r).purpose; }],
  ['extra operation', r => first(r).operations.push('issueInternalServiceToken')],
  ['extra URI', r => first(r).uriMappings.push({ uri: 'https://unapproved.example', path: rows[1][1] })],
]) test('O3 rejects drift before every historical projection: ' + name, () => {
  const wrong = structuredClone(actual); change(wrong);
  for (const validate of [validateWorkloadRegistry, ...historical]) assert.throws(() => validate(wrong), /O3_WORKLOAD_REGISTRY/);
});

test('O3 requires the whole new transition while historical fixtures keep their original diagnostics', () => {
  assert.throws(() => validateWorkloadRegistry(baseline), /O3_WORKLOAD_REGISTRY/);
  assert.equal(validateIdentityAdmission(baseline).admitted, 6);
  assert.equal(validateRenewalRegistry(baseline).admitted, 4);
  assert.equal(validateAsyncapiAdmission(baseline).admitted, 1);
  for (const index of [119, 120]) {
    const partial = structuredClone(baseline); partial.contracts[118] = structuredClone(actual.contracts[index]);
    for (const validate of historical) assert.throws(() => validate(partial), /O3_WORKLOAD_REGISTRY/);
  }
});

for (const file of [rows[0][1], rows[1][1]]) test('O3 detects checkout transport drift through caller-supplied readers: ' + file, () => {
  const changed = name => name === file ? Buffer.concat([read(name), Buffer.from('\n')]) : read(name);
  assert.throws(() => validateWorkloadPackage(changed), /O3_WORKLOAD_BYTES/);
  assert.throws(() => workloadReadView(changed)('registry/contracts.json'), /O3_WORKLOAD_BYTES/);
});
for (const [file, changes] of [
  ['identity/index.json', [text => { const index = JSON.parse(text); index.contracts.pop(); return JSON.stringify(index); }, text => { const index = JSON.parse(text); index.surfaces.pop(); return JSON.stringify(index); }, text => JSON.stringify({ ...JSON.parse(text), unapproved: true })]],
  ['identity/README.md', [text => text.replace('total 121 raíces', 'total 122 raíces'), text => text + text.slice(text.indexOf('\n## F1-08O3')), text => text + '\nUnapproved appendix.\n']],
]) for (const [index, change] of changes.entries()) test('O3 rejects metadata drift before old byte checks: ' + file + '/' + index, () => {
  const wrong = Buffer.from(change(read(file).toString('utf8')));
  const changed = name => name === file ? wrong : read(name);
  assert.throws(() => validateWorkloadPackage(changed), /O3_WORKLOAD_INDEX|O3_WORKLOAD_README/);
  assert.throws(() => workloadReadView(changed)(file), /O3_WORKLOAD_INDEX|O3_WORKLOAD_README/);
});
for (const file of ['identity/index.json', 'identity/README.md']) test('O3 rejects wholesale omission in its current package gate: ' + file, () => {
  assert.throws(() => validateWorkloadPackage(name => name === file ? source(name) : read(name)), /O3_WORKLOAD_INDEX|O3_WORKLOAD_README/);
});

test('O3 metadata views preserve old bytes only after checking current artifacts; N/O2 byte gates stay active', () => {
  const historicalRead = workloadReadView(read);
  for (const file of ['registry/contracts.json', 'identity/index.json', 'identity/README.md']) assert(historicalRead(file).equals(source(file)));
  assert.equal(validateDeliveryPreservation().roots, 119);
  assert.equal(validateOperationalPreservation().roots, 119);
});

test('O3 preserves all source payloads, indexes, consumers, generic tools, dependencies and CI outside its closed proof surface', () => {
  validateWorkloadConsumers();
  const consumers = consumerReadView(read);
  const allowed = withF110ADesignScope(workloadChangedFiles);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
  const files = git(['ls-tree', '-r', '--name-only', workloadSource]).split('\n');
  for (const file of files.filter(file => !allowed.has(file))) {
    assert.equal(read(file).toString('utf8').replaceAll('\r\n', '\n'), source(file).toString('utf8'), 'O3_WORKLOAD_PRESERVED:' + file);
  }
  for (const list of [git(['diff', '--name-only', workloadSource, '--', '.']), git(['ls-files', '--others', '--exclude-standard'])])
    for (const file of list.split('\n').filter(Boolean)) assert(allowed.has(file), 'O3_WORKLOAD_SCOPE:' + file);
  for (const file of baseline.requiredConsumers.map(name => 'registry/consumers/' + name + '.json')) assert(consumers(file).equals(source(file)));
});
