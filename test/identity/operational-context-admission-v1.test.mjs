import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {makeLock} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {admissionSourceRevision, admissionSource, admissionRead, admissionIds, admittedRegistry,
  admissionClosures, admissionMetadata, admissionInputPaths, validateAdmissionRegistry,
  validateAdmissionInput, validateAdmission} from '../../scripts/identity/operational-context-admission-v1.mjs';
import {projectOperationalFile, projectOperationalDocument, withOperationalScope}
  from '../../scripts/identity/operational-context-history-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const registryPath = 'registry/contracts.json';
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('nine exact admissions retain prior roots, other intentions and every live input is read once', () => {
  const visits = new Map();
  const result = validateAdmission(file => {visits.set(file, (visits.get(file) ?? 0) + 1); return admissionRead(file);});
  assert.equal(result.admitted, 9); assert.equal(result.roots, 223);
  assert.equal(result.planned, 2); assert.equal(result.consumers, 8);
  assert.equal(result.runtimeDemonstrated, false);
  assert(visits.size > 395); assert([...visits.values()].every(count => count === 1));
  const before = JSON.parse(admissionSource(registryPath)), after = admittedRegistry();
  assert.deepEqual(after.contracts.slice(0, 214), before.contracts);
  assert.deepEqual(after.planned, before.planned.filter(row => !admissionIds.includes(row.id)));
  assert.deepEqual(after.preservedFiles, before.preservedFiles);
  for (const domain of ['identity', 'finance'])
    assert.deepEqual(JSON.parse(admissionRead(domain + '/index.json')), domainIndex(after, domain));
});

test('all nine roots resolve a functional lock at the exact immutable source without consumer migration', () => {
  const registry = admittedRegistry(), rows = registry.contracts.slice(214);
  const manifest = {service: 'isolated-operational-admission', contracts: rows.map(row => ({
    id: row.id, role: 'producer', version: row.version, operations: row.operations,
    pointers: row.operations.length ? [] : [''],
  })), assets: []};
  const lock = makeLock(root, manifest, encode(manifest), registry);
  assert.equal(lock.entries.length, 9);
  for (const row of rows) {
    assert.equal(row.commit, admissionSourceRevision);
    assert.equal(row.sha256, sha(admissionSource(row.path)));
    const closure = admissionClosures().find(value => value.id === row.id);
    assert.deepEqual(lock.entries.find(value => value.id === row.id).files, closure.files);
  }
  for (const planned of registry.planned) {
    const rejected = {...manifest, contracts: [{...manifest.contracts[0], id: planned.id}]};
    assert.throws(() => makeLock(root, rejected, encode(rejected), registry), /Unknown\/unmaterialized/);
  }
});

test('partial admission, altered provenance, authority, mappings and unrelated changes fail closed', () => {
  for (const mutate of [
    value => value.contracts.pop(), value => value.contracts[0].status = 'draft',
    value => value.contracts[214].commit = 'f'.repeat(40),
    value => value.contracts[214].sha256 = '0'.repeat(64),
    value => value.contracts[214].operations.push('unapprovedOperation'),
    value => value.contracts[214].owner = 'gateway-bff',
    value => value.contracts[214].version = '9.0.0',
    value => value.contracts[214].uriMappings.push({uri: 'https://unapproved.example', path: value.contracts[214].path}),
    value => value.planned.pop(), value => value.requiredConsumers.push('foreign-service'),
    value => value.planned.push(JSON.parse(admissionSource(registryPath)).planned.at(-1)),
  ]) {
    const value = admittedRegistry(); mutate(value);
    assert.throws(() => validateAdmissionRegistry(value), /OPERATIONAL_ADMISSION_REGISTRY/);
  }
});

test('each pinned metadata, transport, fixture and consumer input rejects altered bytes locally', () => {
  for (const file of admissionInputPaths) {
    const bytes = admissionRead(file);
    validateAdmissionInput(file, bytes);
    assert.throws(() => validateAdmissionInput(file, Buffer.concat([bytes, Buffer.from('\nUnapproved')])),
      /OPERATIONAL_ADMISSION_BYTES/);
  }
});

test('live checks reject drift and omissions after warmup; immutable expectations cannot become caller approval', () => {
  validateAdmission();
  for (const file of ['registry/contracts.json', 'finance/http/shared/v1/finance-open-shift-v1.schema.json',
    'registry/consumers/finance.json']) {
    assert.throws(() => validateAdmission(name => name === file
      ? Buffer.concat([admissionRead(name), Buffer.from('\nUnapproved')]) : admissionRead(name)), /OPERATIONAL_ADMISSION_BYTES/);
    assert.throws(() => validateAdmission(name => {
      if (name === file) throw Error('synthetic missing admission input'); return admissionRead(name);
    }), /synthetic missing admission input/);
  }
  const copy = admissionMetadata(); copy.get(registryPath).fill(0);
  validateAdmissionInput(registryPath, admissionRead(registryPath));
});

test('historical projection remains pure, idempotent and does not repair changed caller values', () => {
  const value = admissionRead(registryPath), projected = projectOperationalFile(registryPath, value);
  assert.notEqual(projected, value);
  assert.deepEqual(projectOperationalFile(registryPath, projected), projected);
  const changed = Buffer.concat([value, Buffer.from('\nUnapproved')]);
  assert.equal(projectOperationalFile(registryPath, changed), changed);
  const document = admittedRegistry(); document.contracts[214].operations.push('unapprovedOperation');
  assert.equal(projectOperationalDocument(registryPath, document), document);
  assert.throws(() => withOperationalScope([], file => file === registryPath ? encode(document) : admissionRead(file),
    () => assert.fail('partial admission must not reach the historical verifier')), /OPERATIONAL_PARTIAL_SCOPE/);
});
