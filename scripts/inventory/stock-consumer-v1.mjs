import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock } from '../../tools/architecture/graph.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const baseline = gitReader(root, '4270634ab05b0df7119abb94c769c4ca1ff923a8');
const publishedSourceCommit = '57c4323f401b2573832fd2bd48d85b9cdbfd7b33';
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const text = value => new TextDecoder('utf-8', { fatal: true }).decode(value).replaceAll('\r\n', '\n');
const operations = ['createInitialWarehouse', 'listInventoryWarehouses', 'getInventoryWarehouse',
  'adjustInventoryStock', 'getInventoryAdjustment', 'getInventoryPosition', 'listInventoryPositions'];
let cached;
function model() {
  if (cached) return cached;
  const previous = JSON.parse(baseline('registry/consumers/inventory.json'));
  const registry = JSON.parse(baseline('registry/contracts.json'));
  const manifest = structuredClone(previous.manifest);
  const purpose = 'F1-11C human stock core with current authority and exact physical capture; no Sales effects, broker delivery or history HTTP.';
  const gates = ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:contracts', 'pnpm test:e2e'];
  function add(id, role, selected = [], pointers = []) {
    const descriptor = registry.contracts.find(row => row.id === id);
    assert(descriptor, 'ISC_DESCRIPTOR');
    let entry = manifest.contracts.find(row => row.id === id && row.role === role);
    if (!entry) {
      entry = { id, role, version: descriptor.version, operations: [], pointers: [], purpose, gates: [...gates] };
      manifest.contracts.push(entry);
    }
    entry.operations = [...new Set([...entry.operations, ...selected])];
    entry.pointers = [...new Set([...entry.pointers, ...pointers])];
    entry.purpose = purpose;
  }
  add('inventory.http.private.v1', 'producer', operations);
  add('inventory.http.public.v1', 'semantic-owner', operations);
  add('inventory.types.v1', 'validation', [], ['WarehouseCreate', 'Warehouse', 'HttpWarehouse', 'Warehouses',
    'HttpWarehouses', 'AdjustmentRequest', 'Adjustment', 'HttpAdjustment', 'Movement', 'Position',
    'HttpPosition', 'Positions', 'HttpPositions'].map(name => '/$defs/' + name));
  add('inventory.stock-adjustment.recorded.v1', 'producer', [], ['']);
  add('inventory.protocol-policy.v1', 'consumer', [], [...operations.map((_, i) => '/operations/' + i),
    '/authority/human', '/idempotency/http_days', '/quantity', '/atomicity', '/limits', '/history/sequence', '/history/maximum_fact_bytes']);
  add('inventory.lifecycle-policy.v1', 'semantic-owner', [], ['/owner', '/production_enabled', '/storage_policies', '/prohibited_persistence', '/production_prerequisites']);
  add('identity.inventory-authority.schema.v1', 'validation', [], [...operations.map((_, i) => '/$defs/CanonicalRequest/oneOf/' + i), '/$defs/Authorization']);
  add('identity.inventory-authority.policy.v1', 'consumer', [], ['/profiles/1', ...operations.map((_, i) => '/permissions/' + i)]);
  const manifestBytes = encode(manifest);
  const lock = makeLock(root, manifest, manifestBytes, registry, previous.lock.entries);
  const snapshot = { ...previous, publication: 'published', sourceCommit: publishedSourceCommit, manifestSha256: hash(manifestBytes),
    lockSha256: hash(encode(lock)), manifest, lock };
  const closures = new Map();
  for (const entry of lock.entries) for (const file of entry.files) {
    const bytes = gitReader(root, entry.commit)(file.path);
    if (closures.has(file.path)) assert.equal(text(closures.get(file.path)), text(bytes), 'ISC_SOURCE_COLLISION');
    closures.set(file.path, bytes);
  }
  cached = { bytes: encode(snapshot), snapshot, previous, closures };
  return cached;
}

// Exact export for the audited published Inventory revision; historical projections preserve B unchanged.
export const stockConsumerCandidate = () => Buffer.from(model().bytes);
// Pure exact projections; the historical caller must validate its complete live cut before using them.
export function stockConsumerHistoricalFile(file, bytes) {
  return file === 'registry/consumers/inventory.json' && text(bytes) === text(model().bytes)
    ? encode(model().previous) : bytes;
}
export function stockConsumerHistoricalSnapshot(value) {
  return value?.manifest?.service === 'inventory' && isDeepStrictEqual(value, model().snapshot)
    ? structuredClone(model().previous) : value;
}
export function validateStockConsumer(bytes, read) {
  assert.equal(text(bytes), text(model().bytes), 'ISC_EXACT_METADATA');
  for (const [file, expected] of model().closures)
    assert.equal(text(read(file)), text(expected), 'ISC_SOURCE_DRIFT:' + file);
  return { published: true, operations: operations.length, previousPinsPreserved: true };
}
