import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeLock, resolveSelection } from '../../tools/architecture/graph.mjs';
import { readRepositoryFile as read } from '../../scripts/ci/retired-gitlab-v1.mjs';
import { root, validateCaptureSource, captureHistoricalFile, captureHistoricalRegistry,
  source as historicalSource, successorRegistry } from '../../scripts/inventory/capture-authority-v2.mjs';
import { admissionBase, sourceCommit, admissionSource, admissionIds, admissionFiles, httpPath, schemaPath,
  admissionRows, admittedRegistry, admissionMetadata, validateAdmission, admissionReadView,
  admissionHistoricalFile, admissionHistoricalRegistry,
} from '../../scripts/inventory/capture-authority-v2-admission.mjs';

const registryPath = 'registry/contracts.json';
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const before = () => JSON.parse(admissionSource(registryPath));
const mutateRegistry = change => {
  const value = admittedRegistry(); change(value);
  return file => file === registryPath ? encode(value) : read(file);
};
test('two exact admissions preserve previous descriptors, unrelated intentions and all consumers', () => {
  assert.deepEqual(validateAdmission(), { admitted: 2, roots: 202, priorRoots: 200,
    preserved: 236, planned: 2, consumers: 6, closureFiles: 3, runtimeDemonstrated: false });
  const current = JSON.parse(read(registryPath)), previous = before();
  assert.deepEqual(current, admittedRegistry());
  assert.deepEqual(current.contracts.slice(0, 200), previous.contracts);
  assert.deepEqual(current.preservedFiles, previous.preservedFiles);
  assert.deepEqual(current.requiredConsumers, previous.requiredConsumers);
  assert.deepEqual(current.planned, previous.planned.filter(row => !admissionIds.includes(row.id)));
  assert.equal(admissionFiles.length, 7);
  assert.equal(admissionBase, '49b32eb7a7e8694a68a0bc9d58252c5d68dfab13');
  assert.deepEqual(validateCaptureSource(), { admitted: 0, addedPlanned: 2, roots: 200,
    preserved: 236, consumers: 6, runtime_demonstrated: false });
});
test('minimal source closures fix the callback operation, versions, ownership and exact provenance', () => {
  const rows = admissionRows();
  assert.deepEqual(rows.map(row => [row.id, row.owner, row.status, row.surface, row.version, row.operations]), [
    [admissionIds[0], 'inventory', 'active', 'http-private', '2.0.0', ['authorizeInventoryCatalogCapture']],
    [admissionIds[1], 'inventory', 'active', 'schema', 'v2', []],
  ]);
  for (const row of rows) {
    assert.equal(row.commit, sourceCommit);
    assert.equal(row.tag, null); assert.equal(row.tagObject, null);
    const closure = resolveSelection(admissionSource, row,
      { version: row.version, operations: row.operations, pointers: row.operations.length ? [] : [''] }, admittedRegistry());
    const expected = row.path === httpPath ? [httpPath, schemaPath, 'common/http/shared/v3/problem-details-v3.schema.json'] : [schemaPath];
    assert.deepEqual(closure.files.map(file => file.path).sort(), expected.sort());
    assert.equal(closure.files.find(file => file.path === row.path).sha256, row.sha256);
    assert.deepEqual(row.uriMappings.map(item => item.path).sort(), expected.filter(file => file !== httpPath).sort());
  }
});
for (const role of ['producer', 'consumer', 'semantic-owner', 'validation'])
  test('synthetic ' + role + ' resolves both roots without changing real consumers or old pins', () => {
    const rows = admissionRows();
    const manifest = { service: 'isolated-capture-admission', contracts: rows.map(row => ({
      id: row.id, role, version: row.version, operations: row.operations, pointers: row.operations.length ? [] : [''],
    })), assets: [] };
    const lock = makeLock(root, manifest, encode(manifest), admittedRegistry());
    assert.equal(lock.entries.length, 2);
    assert(lock.entries.every(row => row.commit === sourceCommit));
    assert.deepEqual(lock.entries.map(row => row.files.length), [3, 1]);
    for (const intention of admittedRegistry().planned) {
      const wrong = { ...manifest, contracts: [{ ...manifest.contracts[0], id: intention.id }] };
      assert.throws(() => makeLock(root, wrong, encode(wrong), admittedRegistry()), /Unknown\/unmaterialized/);
    }
  });
for (const [label, change] of [
  ['commit', row => { row.commit = 'f'.repeat(40); }],
  ['hash', row => { row.sha256 = '0'.repeat(64); }],
  ['version', row => { row.version = '1.0.0'; }],
  ['status', row => { row.status = 'draft'; }],
  ['owner', row => { row.owner = 'catalog-pricing'; }],
  ['operation omitted', row => { row.operations = []; }],
  ['operation added', row => { row.operations.push('adjustInventoryStock'); }],
  ['mapping omitted', row => { row.uriMappings.pop(); }],
  ['mapping changed', row => { row.uriMappings[0].path = httpPath; }],
  ['mapping added', row => { row.uriMappings.push({ uri: 'https://unapproved.example/', path: httpPath }); }],
]) test('admission rejects incorrect ' + label, () => {
  const wrong = mutateRegistry(value => change(value.contracts.at(-2)));
  assert.throws(() => validateAdmission(wrong), /IC2A_EXACT_METADATA/);
  assert.throws(() => admissionReadView(wrong)('inventory/index.json'), /IC2A_EXACT_METADATA/);
});
for (const [label, change] of [
  ['HTTP missing', value => { value.contracts.splice(-2, 1); }],
  ['schema missing', value => { value.contracts.pop(); }],
  ['both missing', value => { value.contracts.splice(-2); }],
  ['intention retained', value => { value.planned = before().planned; }],
  ['unrelated intention removed', value => { value.planned.pop(); }],
  ['prior descriptor changed', value => { value.contracts[0].purpose = 'Unreviewed'; }],
  ['new consumer', value => { value.requiredConsumers.push('unapproved'); }],
]) test('partial or foreign transition fails closed: ' + label, () => {
  const wrong = mutateRegistry(change);
  assert.throws(() => validateAdmission(wrong), /IC2A_EXACT_METADATA/);
  assert.throws(() => admissionReadView(wrong)('inventory/index.json'), /IC2A_EXACT_METADATA/);
});

const protectedFiles = [...admissionMetadata().keys(), httpPath, schemaPath,
  'common/http/shared/v3/problem-details-v3.schema.json',
  'inventory/http/private/v1/inventory-internal-v1.yaml',
  'inventory/http/shared/v1/inventory-capture-authority-v1.schema.json',
  'inventory/fixtures/catalog-capture-authority/v2/binding.json',
  'scripts/inventory/run-capture-authority-v2.mjs', 'test/inventory/capture-authority-v2.test.mjs',
  'scripts/ci/retired-gitlab-v1.mjs', 'scripts/sales/inventory-step-consumer-v1.mjs',
  'package.json', 'pnpm-lock.yaml', '.github/workflows/ci.yml', '.gitignore',
  'registry/consumers/index.json', ...before().requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')];
for (const file of protectedFiles)
  for (const mutation of ['changed', 'missing'])
    test('warmed validation, source and both projections reject ' + mutation + ': ' + file, t => {
      const registryBytes = read(registryPath), registry = JSON.parse(registryBytes);
      const view = admissionReadView();
      validateAdmission(); view('inventory/index.json');
      admissionHistoricalFile('inventory/index.json', read('inventory/index.json'));
      admissionHistoricalRegistry(registry);
      validateCaptureSource(); captureHistoricalFile(registryPath, registryBytes); captureHistoricalRegistry(registry);
      const original = fs.readFileSync.bind(fs), target = path.resolve(root, file);
      let reads = 0;
      t.mock.method(fs, 'readFileSync', (name, ...options) => {
        if (typeof name === 'string' && path.resolve(name) === target) {
          reads++;
          if (mutation === 'missing') throw Object.assign(new Error('Synthetic missing admission input'), { code: 'ENOENT' });
          return Buffer.concat([original(name, ...options), Buffer.from('\nUnapproved')]);
        }
        return original(name, ...options);
      });
      assert.throws(() => validateAdmission());
      assert.throws(() => view('inventory/index.json'));
      assert.throws(() => admissionHistoricalFile(registryPath, registryBytes));
      assert.throws(() => admissionHistoricalRegistry(registry));
      assert.throws(() => validateCaptureSource());
      assert.throws(() => captureHistoricalFile(registryPath, registryBytes));
      assert.throws(() => captureHistoricalRegistry(registry));
      assert(reads >= 7, 'Every public validation/projection rereads current inputs after warmup');
    });

test('injected readers also reject omissions/drift and historical projections never repair callers', () => {
  for (const file of protectedFiles) {
    assert.throws(() => validateAdmission(name => name === file ? Buffer.concat([read(name), Buffer.from('drift')]) : read(name)));
    assert.throws(() => validateAdmission(name => { if (name === file) throw Error('Synthetic missing'); return read(name); }));
  }
  for (const [file, bytes] of admissionMetadata()) {
    assert.equal(admissionHistoricalFile(file, bytes).toString(), admissionSource(file).toString());
    const drift = Buffer.concat([bytes, Buffer.from('drift')]);
    assert.equal(admissionHistoricalFile(file, drift), drift);
    assert.throws(() => admissionReadView(name => name === file ? drift : read(name))(file));
  }
  assert.deepEqual(admissionHistoricalRegistry(admittedRegistry()), before());
  assert.deepEqual(captureHistoricalRegistry(admittedRegistry()), JSON.parse(historicalSource(registryPath)));
  assert.deepEqual(captureHistoricalRegistry(successorRegistry()), JSON.parse(historicalSource(registryPath)));
  const drift = admittedRegistry(); drift.contracts[0].purpose = 'Unreviewed';
  assert.equal(admissionHistoricalRegistry(drift), drift);
  assert.equal(captureHistoricalRegistry(drift), drift);
  for (const file of [httpPath, schemaPath, 'unrelated.json']) {
    const bytes = Buffer.from('caller bytes');
    assert.equal(admissionHistoricalFile(file, bytes), bytes);
  }
  const mutable = admissionMetadata(); mutable.get(registryPath).fill(0);
  const mutableRegistry = admittedRegistry(); mutableRegistry.contracts[0].purpose = 'Poison';
  const mutableRows = admissionRows(); mutableRows[0].uriMappings.pop();
  const mutableBefore = admissionHistoricalRegistry(admittedRegistry()); mutableBefore.planned.pop();
  const mutableResult = validateAdmission(); mutableResult.roots = 1;
  validateAdmission();
  assert.equal(admittedRegistry().contracts.length, 202);
  assert.equal(admissionRows()[0].uriMappings.length, 2);
  assert.equal(validateAdmission().roots, 202);
});
