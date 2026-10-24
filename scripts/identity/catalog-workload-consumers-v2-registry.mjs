import assert from 'node:assert/strict';
import { consumptionReadView, consumptionChangedFiles } from '../catalog/catalog-consumption-v1-registry.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock, worktreeReader } from '../../tools/architecture/graph.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';
export const root = path.resolve(import.meta.dirname, '../..');
export const consumerBase = '819f3e08d78f92886a5d5271866a56d4bfeb542c';
const source = gitReader(root, consumerBase);
const baseline = file => JSON.parse(source(file));
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const ownerBases = Object.freeze({ 'identity-tenancy': '62fe16b1e2ba44b2b301e8605d685cee0e373c49', 'catalog-pricing': '7d0ef7afad6eb801820963f534ead8849ffbac46' });
const policy = 'identity.catalog-workload-profiles.policy.v2', fixtures = 'identity.catalog-workload-profiles.fixtures.v2';
const selections = { 'identity-tenancy': [[policy, 'semantic-owner'], [fixtures, 'validation']], 'catalog-pricing': [[policy, 'consumer']] };
export const consumerChangedFiles = Object.freeze([
  ...consumptionChangedFiles,
  'scripts/catalog/catalog-lifecycle-v1-registry.mjs', 'scripts/catalog/catalog-runtime-v1-registry.mjs',
  'test/architecture/catalog-lifecycle.test.mjs', 'test/architecture/identity-producer-admission.test.mjs',
  'scripts/catalog/catalog-foundation-v1-registry.mjs', 'test/architecture/asyncapi-admission-v1.test.mjs',
  'registry/consumers/identity-tenancy.json', 'registry/consumers/catalog-pricing.json',
  'scripts/identity/catalog-workload-consumers-v2-registry.mjs', 'test/architecture/catalog-workload-consumers-v2.test.mjs',
  'scripts/identity/catalog-workload-profiles-v2-registry.mjs', 'test/identity/catalog-workload-profiles-admission-v2.test.mjs',
  'scripts/catalog/catalog-operational-recovery-v1-registry.mjs', 'test/architecture/catalog-operational-recovery.test.mjs',
]);
export const snapshotPath = service => 'registry/consumers/' + service + '.json';
const expectedCache = new Map();
export function workloadConsumerSnapshot(service) {
  assert(Object.hasOwn(selections, service), 'O4_CONSUMER_OWNER');
  if (!expectedCache.has(service)) {
    const previous = baseline(snapshotPath(service)), registry = baseline('registry/contracts.json');
    assert.equal(previous.manifest.contracts.length, service === 'identity-tenancy' ? 30 : 48, 'O4_CONSUMER_BASE');
    const manifest = { ...previous.manifest, contracts: [...previous.manifest.contracts, ...selections[service].map(([id, role]) => {
      const descriptor = registry.contracts.find(row => row.id === id);
      assert.equal(descriptor.status, 'active', 'O4_CONSUMER_ACTIVE');
      assert.equal(descriptor.commit, '9223c3b6b7c5077d7230d14d16da26a8129d0c51', 'O4_CONSUMER_SOURCE');
      return { id, role, version: descriptor.version, operations: [], pointers: [''],
        purpose: 'F1-08O4 purpose-bound H1A v2 workload profiles; server-owned caller and audience, independent credentials, no v1 fallback.',
        gates: ['pnpm contracts:metadata', 'pnpm test:cov'] };
    })] };
    const lock = makeLock(root, manifest, bytes(manifest), registry, previous.lock.entries);
    assert.deepEqual(lock.entries.slice(0, previous.lock.entries.length), previous.lock.entries, 'O4_CONSUMER_PRIOR_PINS');
    expectedCache.set(service, { ...previous, publication: 'local-candidate', sourceCommit: ownerBases[service],
      manifestSha256: sha256(bytes(manifest)), lockSha256: sha256(bytes(lock)), manifest, lock });
  }
  return structuredClone(expectedCache.get(service));
}
// Standalone CI checks exact reviewed contents. Publication/CI are operational checks;
// verifyPublishedConsumer below and canonical consumers --local require actual Git evidence.
export function validateWorkloadConsumer(snapshot) {
  const service = snapshot?.manifest?.service;
  const candidate = workloadConsumerSnapshot(service);
  assert(['local-candidate', 'published'].includes(snapshot.publication) && /^[a-f0-9]{40}$/.test(snapshot.sourceCommit), 'O4_CONSUMER_SNAPSHOT');
  const expected = snapshot.publication === 'published' ? { ...candidate, publication: 'published', sourceCommit: snapshot.sourceCommit } : candidate;
  assert(isDeepStrictEqual(snapshot, expected), 'O4_CONSUMER_SNAPSHOT');
  return { service, dependencies: candidate.lock.entries.length, prior_preserved: service === 'identity-tenancy' ? 30 : 48 };
}
export function verifyPublishedConsumer(snapshot, readPublished) {
  validateWorkloadConsumer(snapshot);
  assert.equal(snapshot.publication, 'published', 'O4_CONSUMER_PUBLICATION');
  assert.equal(typeof readPublished, 'function', 'O4_CONSUMER_GIT_REQUIRED');
  verifyLocalSnapshot(workloadConsumerSnapshot(snapshot.manifest.service), snapshot, readPublished);
}
export function consumerSnapshotView(snapshot) {
  if (![snapshot?.manifest?.contracts, snapshot?.lock?.entries].some(rows => Array.isArray(rows) && rows.some(row => row?.id === policy || row?.id === fixtures))) return snapshot;
  validateWorkloadConsumer(snapshot);
  return baseline(snapshotPath(snapshot.manifest.service));
}
export function consumerReadView(read = worktreeReader(root)) {
  read = consumptionReadView(read);
  return file => {
    const content = read(file);
    if (Object.keys(selections).some(service => file === snapshotPath(service))) {
      const snapshot = JSON.parse(content);
      if (consumerSnapshotView(snapshot) !== snapshot) return source(file);
    }
    return content;
  };
}
export function validateWorkloadConsumers(read = worktreeReader(root)) {
  assert.deepEqual(JSON.parse(read('registry/contracts.json')), baseline('registry/contracts.json'), 'O4_CONSUMER_REGISTRY');
  const results = Object.keys(selections).map(service => validateWorkloadConsumer(JSON.parse(read(snapshotPath(service)))));
  const catalogConsumers = consumptionReadView(read);
  for (const service of ['gateway-bff', 'notifications', 'web-pos']) assert.equal(catalogConsumers(snapshotPath(service)).toString('utf8').replaceAll('\r\n','\n'), source(snapshotPath(service)).toString('utf8'), 'O4_CONSUMER_UNRELATED');
  return { consumers: 5, selections: 103, changed: results };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(validateWorkloadConsumers()));
