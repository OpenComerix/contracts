import test from 'node:test';
import assert from 'node:assert/strict';
import { gitReader } from '../../tools/architecture/graph.mjs';
import path from 'node:path';
import { stockConsumerCandidate, validateStockConsumer } from '../../scripts/inventory/stock-consumer-v1.mjs';
import { captureConsumerMetadata, validateCaptureConsumers, captureConsumerReadView } from '../../scripts/inventory/capture-consumers-v1.mjs';
import { readRepositoryFile } from '../../scripts/ci/retired-gitlab-v1.mjs';

const file = 'registry/consumers/inventory.json';
const baseline = gitReader(path.resolve(import.meta.dirname, '../..'), '4270634ab05b0df7119abb94c769c4ca1ff923a8');
test('C admits exactly seven human operations while preserving every B pin and selection', () => {
  const bytes = stockConsumerCandidate(), current = JSON.parse(bytes), before = JSON.parse(baseline(file));
  assert.deepEqual(validateStockConsumer(bytes, readRepositoryFile), { published: true, operations: 7, previousPinsPreserved: true });
  assert.deepEqual(readRepositoryFile(file), bytes);
  assert.equal(current.sourceCommit, '57c4323f401b2573832fd2bd48d85b9cdbfd7b33');
  assert.notEqual(current.sourceCommit, before.sourceCommit);
  assert.equal(current.publication, 'published');
  assert.equal(current.manifest.contracts.length, 14);
  for (const old of before.lock.entries) {
    const next = current.lock.entries.find(row => row.id === old.id && row.role === old.role);
    for (const field of ['commit', 'tag', 'tagObject', 'root']) assert.deepEqual(next[field], old[field]);
    for (const file of old.files) assert(next.files.some(row => row.path === file.path && row.sha256 === file.sha256));
    for (const unit of old.units) assert(next.units.some(row => JSON.stringify(row) === JSON.stringify(unit)));
  }
  const privateHttp = current.manifest.contracts.find(row => row.id === 'inventory.http.private.v1');
  assert.deepEqual(privateHttp.operations, ['createInitialWarehouse', 'listInventoryWarehouses', 'getInventoryWarehouse',
    'adjustInventoryStock', 'getInventoryAdjustment', 'getInventoryPosition', 'listInventoryPositions']);
  assert.deepEqual(current.manifest.assets, before.manifest.assets);
  assert.deepEqual(current.manifest.bindings, before.manifest.bindings);
});
test('B historical validation sees its exact export while the published C snapshot remains unchanged', () => {
  const historical = captureConsumerMetadata().get(file);
  assert.equal(validateCaptureConsumers(name => name === file ? historical : readRepositoryFile(name)).consumers, 7);
  assert.equal(validateCaptureConsumers().consumers, 7);
  const current = readRepositoryFile(file);
  assert.deepEqual(captureConsumerReadView()(file), baseline(file));
  assert.deepEqual(readRepositoryFile(file), current);
  const altered = Buffer.concat([current, Buffer.from('\nsynthetic drift')]);
  assert.equal(captureConsumerReadView(name => name === file ? altered : readRepositoryFile(name))(file), altered);
  const returned = stockConsumerCandidate(); returned.fill(0);
  assert.equal(validateStockConsumer(stockConsumerCandidate(), readRepositoryFile).operations, 7);
});
for (const [name, change] of [
  ['future operation', value => value.manifest.contracts.find(row => row.id === 'inventory.http.private.v1').operations.push('readInventoryHistory')],
  ['prior pin', value => { value.lock.entries[0].commit = 'a'.repeat(40); }],
  ['omitted selection', value => value.manifest.contracts.pop()],
  ['unpublished candidate', value => { value.publication = 'local-candidate'; }],
  ['invented publication', value => { value.publication = 'invented'; }],
  ['source revision', value => { value.sourceCommit = 'a'.repeat(40); }],
  ['previous source revision', value => { value.sourceCommit = JSON.parse(baseline(file)).sourceCommit; }],
  ['lock hash', value => { value.lockSha256 = 'a'.repeat(64); }],
]) test('C rejects ' + name + ' even after warming its expected state', () => {
  validateCaptureConsumers();
  const value = JSON.parse(stockConsumerCandidate()); change(value);
  const altered = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  assert.throws(() => validateStockConsumer(altered, readRepositoryFile), /ISC_EXACT_METADATA/);
  assert.throws(() => validateCaptureConsumers(name => name === file ? altered : readRepositoryFile(name)), /ICC_LIVE_DRIFT/);
});
test('C rejects drift or absence of its newly selected canonical event', () => {
  const event = JSON.parse(stockConsumerCandidate()).lock.entries.find(row => row.id === 'inventory.stock-adjustment.recorded.v1').root;
  for (const missing of [false, true]) assert.throws(() => validateStockConsumer(stockConsumerCandidate(), name => {
    if (name !== event) return readRepositoryFile(name);
    if (missing) throw Error('synthetic_missing_source');
    return Buffer.concat([readRepositoryFile(name), Buffer.from('\nsynthetic drift')]);
  }));
});
