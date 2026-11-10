import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { makeLock } from '../../tools/architecture/graph.mjs';
import { coordinationFiles, projectCoordinationFile, projectCoordinationDocument } from './coordination-consumer-v1.mjs';

export const acceptanceConsumerPath = 'registry/consumers/sales-pos.json';
export const acceptanceConsumerBase = '5a1bb96a9ab70f69e6b509b6997654e4b37f34dd';
export const acceptanceSalesBase = '46a4ef811b4095280b382d4a31ca2ea53a4cd4a6';
export const acceptanceConsumerFiles = Object.freeze([
  'scripts/sales/acceptance-consumer-v1.mjs',
  'test/architecture/sales-acceptance-consumer.test.mjs',
  ...coordinationFiles,
]);
const root = path.resolve(import.meta.dirname, '../..');
const source = createGitReader()(root, acceptanceConsumerBase);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
// Closed local candidate, not a publication/admission or permission for C/D.
const snapshotHash = '8eb37ecf672add92961c02eb087e918d1a900b245a2950d75c01f153a986686d';
// Exact published Sales A files at acceptanceSalesBase. Contracts' older
// snapshot has only 20 selections; it is not the authority for the 29 A pins.
const priorManifestHash = 'f42aecd03fd7665b50332c58d691aff65b75e03ed41ccb6df0a653abd07e4a43';
const priorLockHash = '340303fe892214c31558b7fb0df51c6177c373734965b3c3f0504887ef09fde4';

// Pure per-value adapters. No live read or capability proof per historical
// file/fixture, and no remembered successful approval of caller input.
export function projectAcceptanceConsumerFile(file, bytes) {
  bytes = projectCoordinationFile(file, bytes);
  if (file !== acceptanceConsumerPath || digest(text(bytes)) !== snapshotHash) return bytes;
  return Buffer.from(source(file));
}
export function projectAcceptanceConsumerDocument(file, value) {
  value = projectCoordinationDocument(file, value);
  if (file !== acceptanceConsumerPath) return value;
  try {
    const bytes = encode(value);
    if (!isDeepStrictEqual(value, JSON.parse(bytes)) || digest(bytes) !== snapshotHash) return value;
    return JSON.parse(source(file));
  } catch { return value; }
}

// Capability proof, executed once by its owner test, outside the historical
// adapters. Recomputes canonical closures from immutable sources, preserving
// all A pins; does not call another historical package validator.
export function validateAcceptanceConsumer(snapshot) {
  snapshot = projectCoordinationDocument(acceptanceConsumerPath, snapshot);
  assert.equal(digest(encode(snapshot)), snapshotHash, 'ACCEPTANCE_SNAPSHOT_EXACT');
  assert.equal(snapshot.publication, 'local-candidate');
  assert.equal(snapshot.sourceRepository, 'opencomerix/sales-pos');
  assert.equal(snapshot.sourceCommit, acceptanceSalesBase);
  const { manifest, lock } = snapshot;
  assert.equal(manifest.contracts.length, 35);
  assert.equal(lock.entries.length, 35);
  assert.equal(manifest.assets.length, 52);
  assert.equal(lock.assets.length, 52);
  const priorManifest = { ...manifest, contracts: manifest.contracts.slice(0, 29), assets: manifest.assets.slice(0, 45) };
  const priorLock = { ...lock, manifestSha256: priorManifestHash, entries: lock.entries.slice(0, 29), assets: lock.assets.slice(0, 45) };
  assert.equal(digest(encode(priorManifest)), priorManifestHash, 'ACCEPTANCE_PRIOR_MANIFEST');
  assert.equal(digest(encode(priorLock)), priorLockHash, 'ACCEPTANCE_PRIOR_LOCK');
  const specs = [
    ['sales.f1-10d.pos-sales-internal-v2', 'producer', ['finalizeOnlineSale', 'getSaleFinalization'], []],
    ['sales.f1-10d.sales-lifecycle-policy-v2', 'validation', [], ['']],
    ['sales.f1-10d.sales.sale.completed.v2', 'validation', [], ['']],
    ['catalog.f1-10d.catalog-sale-capture-v1', 'consumer', ['captureSaleCatalog'], []],
    ['inventory.sale-context.http.v1', 'consumer', ['checkInventorySaleContext'], []],
    ['finance.sale-context.http.v1', 'consumer', ['checkFinanceSaleContext'], []],
  ];
  const registry = JSON.parse(source('registry/contracts.json'));
  assert.deepEqual(manifest.contracts.slice(29), specs.map(([id, role, operations, pointers]) => {
    const descriptor = registry.contracts.find(row => row.id === id);
    assert.equal(descriptor?.status, 'active', 'ACCEPTANCE_ADMITTED:' + id);
    return { id, role, version: descriptor.version, operations, pointers,
      purpose: 'F1-13B durable acceptance/read only; no commercial delivery, completed production or later operations.',
      gates: ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:preparation-connected'] };
  }));
  const rebuilt = makeLock(root, manifest, encode(manifest), registry, priorLock.entries);
  rebuilt.assets.forEach((asset, index) => {
    if (index < 45) asset.localSha256 = priorLock.assets[index].localSha256;
    else {
      assert.equal(asset.representation, 'exact', 'ACCEPTANCE_NEW_ASSET_EXACT');
      asset.localSha256 = asset.sourceSha256;
    }
  });
  assert.deepEqual(lock, rebuilt, 'ACCEPTANCE_CANONICAL_LOCK');
  assert.equal(snapshot.manifestSha256, digest(encode(manifest)));
  assert.equal(snapshot.lockSha256, digest(encode(lock)));
  return { preserved: 29, added: 6, assets: 52 };
}
