import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock, worktreeReader } from '../../tools/architecture/graph.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { operationalSnapshotView } from './catalog-operational-recovery-v1-registry.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const deliveryBase = 'f6204d7b68510560ee1f3bd30b9829b769cca93f';
export const deliveryServiceRevision = 'e0ba2538a9736cd1c40aa0b01db8f01b90979ddc';
export const deliverySnapshotPath = 'registry/consumers/catalog-pricing.json';
const source = gitReader(root, deliveryBase);
const baseline = file => JSON.parse(source(file));
const readSnapshot = () => JSON.parse(fs.readFileSync(path.join(root, deliverySnapshotPath), 'utf8'));
const rows = [
  ['catalog.events.v1.asyncapi', ['/operations/publishCatalogChanges']],
  ['catalog.category.changed.v1', ['']],
  ['catalog.product.changed.v1', ['']],
  ['catalog.presentation.changed.v1', ['']],
  ['pricing.presentation-price.changed.v1', ['']],
];
const purpose = 'F1-08N isolated producer delivery validation; no commercial activation before O or business subscriber admission.';
const gates = ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:e2e'];
let expectedSnapshot;

// Standalone contracts CI reconstructs the reviewed contents from immutable
// contracts sources. consumers --local separately verifies the actual service
// Git revision; neither this constructor nor a publication label queries CI.
export function deliverySnapshot() {
  if (!expectedSnapshot) {
    const previous = baseline(deliverySnapshotPath);
    const registry = baseline('registry/contracts.json');
    assert.equal(previous.manifest.contracts.length, 38, 'N_DELIVERY_BASE');
    assert.equal(previous.lock.entries.length, 38, 'N_DELIVERY_BASE');
    const manifest = {
      ...previous.manifest,
      contracts: [...previous.manifest.contracts, ...rows.map(([id, pointers]) => {
        const descriptor = registry.contracts.find(row => row.id === id);
        assert.equal(descriptor?.status, 'active', 'N_DELIVERY_ACTIVE_ROOT');
        return { id, role: 'producer', version: descriptor.version, operations: [],
          pointers: [...pointers], purpose, gates: [...gates] };
      })],
    };
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    const lock = makeLock(root, manifest, bytes, registry, previous.lock.entries);
    assert(isDeepStrictEqual(lock.entries.slice(0, 38), previous.lock.entries), 'N_DELIVERY_PRIOR_PINS');
    const manifestSha256 = sha256(bytes);
    const lockSha256 = sha256(JSON.stringify(lock, null, 2) + '\n');
    // Exact hashes of the manifest/lock at the approved service revision.
    assert.equal(manifestSha256, '6788a1bdb7350a46197d055ea93404453d4da0ed3fe6791b2201440fb337d735', 'N_DELIVERY_MANIFEST_BYTES');
    assert.equal(lockSha256, '2a6642ee980233556fd9ddd2d0090dd8d9f2ea20254eb9518f7d640663ab5b84', 'N_DELIVERY_LOCK_BYTES');
    expectedSnapshot = { ...previous, publication: 'published', sourceCommit: deliveryServiceRevision,
      manifestSha256, lockSha256, manifest, lock };
  }
  return structuredClone(expectedSnapshot);
}

export function validateDeliverySnapshot(snapshot = readSnapshot()) {
  snapshot = operationalSnapshotView(snapshot);
  assert(isDeepStrictEqual(snapshot, deliverySnapshot()), 'N_DELIVERY_SNAPSHOT');
  return { dependencies: 43, previous_preserved: 38, new_producers: 5, functional_activation: false };
}

// Only a complete, verified N export may be projected to the immutable L view.
// Historical fixtures keep their own original validation and diagnostics.
export function deliverySnapshotView(snapshot) {
  snapshot = operationalSnapshotView(snapshot);
  const selections = snapshot?.manifest?.contracts;
  const entries = snapshot?.lock?.entries;
  const delivery = snapshot?.sourceCommit === deliveryServiceRevision ||
    (Array.isArray(selections) && (selections.length > 38 || selections.some(row =>
      row?.id === rows[0][0] || (row?.role === 'producer' && rows.some(([id]) => row?.id === id))))) ||
    (Array.isArray(entries) && entries.length > 38);
  if (!delivery) return snapshot;
  validateDeliverySnapshot(snapshot);
  return baseline(deliverySnapshotPath);
}

export function validateDeliveryPreservation(read = worktreeReader(root)) {
  const registry = baseline('registry/contracts.json');
  const files = new Set([
    '.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'registry/contracts.json',
    'registry/consumers/index.json',
    ...registry.requiredConsumers.filter(name => name !== 'catalog-pricing')
      .map(name => 'registry/consumers/' + name + '.json'),
    ...registry.contracts.map(row => row.path),
    ...registry.preservedFiles.map(row => row.path),
  ]);
  for (const file of files) {
    const actual = read(file), expected = source(file);
    // Same checkout-only LF/CRLF exception as the canonical registry gate.
    assert(actual.equals(expected) || Buffer.from(actual.toString('utf8').replaceAll('\r\n', '\n')).equals(expected),
      'N_DELIVERY_PRESERVED:' + file);
  }
  return { roots: registry.contracts.length, preserved_artifacts: registry.preservedFiles.length, other_consumers: 4 };
}
