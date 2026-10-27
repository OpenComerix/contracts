import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLock, resolveSelection } from '../../tools/architecture/graph.mjs';
import {
  admissionBase, admissionSource, admissionRead, admissionId, admissionPath, admissionHash,
  admissionRow, admittedRegistry, admissionMetadata, validateAdmission, admissionReadView,
  admissionHistoricalFile, admissionHistoricalRegistry, admissionFiles,
} from '../../scripts/identity/inventory-authority-v1-1-admission.mjs';
import { root, validateSuccessorPackage } from '../../scripts/identity/inventory-authority-v1-1.mjs';

const registryPath = 'registry/contracts.json';
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const mutateRegistry = change => {
  const registry = JSON.parse(admissionRead(registryPath));
  change(registry);
  return file => file === registryPath ? encode(registry) : admissionRead(file);
};

test('one exact admission preserves all prior rows, planned, source artifacts and five consumers', () => {
  assert.deepEqual(validateAdmission(), { admitted: 1, roots: 200, prior_roots: 199,
    preserved: 236, planned: 2, operations: 2, closure_files: 5, runtime_demonstrated: false });
  const before = JSON.parse(admissionSource(registryPath)), after = admittedRegistry();
  assert.deepEqual(after.contracts.slice(0, 199), before.contracts);
  assert.deepEqual(after.preservedFiles, before.preservedFiles);
  assert.deepEqual(after.planned, before.planned.filter(row => row.id !== admissionId));
  assert.deepEqual(JSON.parse(admissionRead(registryPath)), after);
  assert.equal(validateSuccessorPackage().functional_admission, false, 'Historical source evidence keeps its own scope');
});

test('selected authority has exact provenance, operations, minimal mappings and five pinned closure hashes', () => {
  const row = admissionRow();
  assert.equal(row.commit, admissionBase);
  assert.equal(row.sha256, admissionHash);
  assert.equal(row.owner, 'identity-tenancy');
  assert.equal(row.status, 'active');
  assert.equal(row.surface, 'http-private');
  assert.deepEqual(row.operations, ['createInventoryDelegation', 'checkInventoryAuthorization']);
  const closure = resolveSelection(admissionSource, row,
    { version: '1.1.0', operations: row.operations, pointers: [] }, admittedRegistry());
  assert.deepEqual(closure.files, [
    { path: 'catalog/http/shared/v1/catalog-common-v1.schema.json', sha256: '4784e607671f090bf701d5f5bbedf87f5c658aa77562e8cb90fa44e359c74df4' },
    { path: 'common/http/shared/v3/problem-details-v3.schema.json', sha256: '483fbb6a968903cc038fd5f46322daa5a4dc053c7add50772cca98e737da8d3b' },
    { path: admissionPath, sha256: admissionHash },
    { path: 'identity/http/shared/v1/identity-inventory-authority-v1.schema.json', sha256: '8c672108a7bec6452b0bb349aeb18ba85267bb38021df9753fc6e87e1d7fe4b0' },
    { path: 'inventory/http/shared/v1/inventory-types-v1.schema.json', sha256: '8d3d2f442c87c5df77cc70344fdb3965b5816aab8a470320bc404cf93d25c823' },
  ]);
  const operations = closure.values.filter(unit => unit.path === admissionPath && unit.value?.operationId);
  assert.equal(operations.length, 2);
  for (const { value } of operations)
    assert.deepEqual(value.responses['400'].content['application/problem+json'].schema.allOf[1].properties,
      { status: { const: 400 }, code: { type: 'string', enum: ['identity_invalid_request'] } });
});

for (const role of ['producer', 'consumer', 'semantic-owner', 'validation']) {
  test('synthetic ' + role + ' selection resolves the new admission without migrating any real consumer', () => {
    const manifest = { service: 'isolated-admission-test', contracts: [{ id: admissionId,
      role, version: '1.1.0', operations: admissionRow().operations, pointers: [] }], assets: [] };
    const lock = makeLock(root, manifest, encode(manifest), admittedRegistry());
    assert.equal(lock.entries[0].commit, admissionBase);
    assert.equal(lock.entries[0].files.length, 5);
    for (const planned of admittedRegistry().planned) {
      const unauthorized = { ...manifest, contracts: [{ ...manifest.contracts[0], id: planned.id }] };
      assert.throws(() => makeLock(root, unauthorized, encode(unauthorized), admittedRegistry()), /Unknown\/unmaterialized/);
    }
  });
}

for (const [label, change] of [
  ['source commit', row => { row.commit = 'f'.repeat(40); }],
  ['hash', row => { row.sha256 = '0'.repeat(64); }],
  ['version', row => { row.version = '1.0.0'; }],
  ['operation omitted', row => { row.operations.pop(); }],
  ['operation added', row => { row.operations.push('unknownAuthority'); }],
  ['mapping omitted', row => { row.uriMappings.pop(); }],
  ['mapping changed', row => { row.uriMappings[0].path = admissionPath; }],
  ['owner', row => { row.owner = 'gateway-bff'; }],
  ['status', row => { row.status = 'draft'; }],
]) test('admission rejects changed ' + label, () => {
  const read = mutateRegistry(registry => change(registry.contracts.at(-1)));
  assert.throws(() => validateAdmission(read), /IA11A_EXACT_METADATA/);
  assert.throws(() => admissionReadView(read)(registryPath), /IA11A_EXACT_METADATA/);
});

for (const [label, change] of [
  ['missing new descriptor', registry => { registry.contracts.pop(); }],
  ['intention retained', registry => { registry.planned = JSON.parse(admissionSource(registryPath)).planned; }],
  ['old descriptor changed', registry => { registry.contracts[0].purpose = 'Unreviewed'; }],
  ['unrelated planned removed', registry => { registry.planned.pop(); }],
  ['consumer coverage expanded', registry => { registry.requiredConsumers.push('inventory'); }],
]) test('partial/foreign admission fails closed: ' + label, () => {
  const read = mutateRegistry(change);
  assert.throws(() => validateAdmission(read), /IA11A_EXACT_METADATA/);
  assert.throws(() => admissionReadView(read)(registryPath), /IA11A_EXACT_METADATA/);
});

for (const file of [
  ...admissionMetadata().keys(), admissionPath,
  ...admissionRow().uriMappings.map(mapping => mapping.path),
  'identity/http/private/v1/identity-inventory-authority-v1.yaml',
  'identity/fixtures/inventory-authority/v1/http-1-1-package.json',
  'package.json', 'pnpm-lock.yaml', '.gitlab-ci.yml', 'registry/consumers/index.json',
  ...admittedRegistry().requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json'),
]) test('complete transition rejects changed and missing file: ' + file, () => {
  const changed = name => name === file ? Buffer.concat([admissionRead(name), Buffer.from('\nUnapproved')]) : admissionRead(name);
  assert.throws(() => validateAdmission(changed), /IA11A_EXACT_METADATA|IA11A_CLOSURE_BYTES|IA11A_PRESERVED|IA11A_UNCHANGED/);
  assert.throws(() => admissionReadView(changed)(registryPath), /IA11A_/);
  assert.throws(() => validateAdmission(name => {
    if (name === file) throw new Error('Synthetic missing admission input');
    return admissionRead(name);
  }), /Synthetic missing admission input/);
});

test('historical projection validates first and never repairs mutated caller bytes or objects', () => {
  const view = admissionReadView();
  for (const file of admissionMetadata().keys()) assert(view(file).equals(admissionSource(file)));
  const bytes = admissionRead(registryPath), drift = Buffer.concat([bytes, Buffer.from('\nUnapproved')]);
  assert(admissionHistoricalFile(registryPath, bytes).equals(admissionSource(registryPath)));
  assert.equal(admissionHistoricalFile(registryPath, drift), drift);
  const registry = admittedRegistry();
  assert.deepEqual(admissionHistoricalRegistry(registry), JSON.parse(admissionSource(registryPath)));
  registry.contracts[0].status = 'draft';
  assert.equal(admissionHistoricalRegistry(registry), registry);
  assert.equal(admissionFiles.length, 8);
  assert(!admissionFiles.includes('registry/consumers/identity-tenancy.json'));
});
