import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gitReader, makeLock} from '../../tools/architecture/graph.mjs';
import {sha256, validateShape} from '../../tools/architecture/consumer-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const runtimeBase = '86e4c6cb80b743386f349880ff76d7f76b6e9f02';
export const runtimeServiceBase = '7b69bdc7ab9c06be6b0da16582ea5f4f16857bed';
export const runtimeCoverage = 'Five known consumers; catalog-pricing F1-08K isolated HTTP/capture candidate; no functional activation before O; external consumers unknown.';
const source = gitReader(root, runtimeBase);
const baseline = file => JSON.parse(source(file));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const gates = ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:e2e'];
const rows = [
  ['catalog.http.private.v1', 'producer', 'all', []],
  ['identity.catalog-authority.v1', 'consumer', ['checkCatalogAuthorization'], []],
  ['identity.catalog-authority.v1.schema', 'consumer', [], ['/$defs/DelegatedClaims']],
  ['identity.internal-auth.v1', 'consumer', ['issueInternalServiceToken', 'getInternalIdentityJwks'], []],
  ['identity.catalog-workload-profiles.policy.v1', 'consumer', [], ['']],
  ['catalog.request.v1', 'consumer', [], ['']],
  ['catalog.security-policy.v1', 'consumer', [], ['']],
  ['common.error-catalog.v6', 'consumer', [], ['']],
  ['catalog.category.changed.v1', 'local-result', [], ['']],
  ['catalog.product.changed.v1', 'local-result', [], ['']],
  ['catalog.presentation.changed.v1', 'local-result', [], ['']],
  ['pricing.presentation-price.changed.v1', 'local-result', [], ['']],
];

export function runtimeManifest() {
  const previous = baseline('registry/consumers/catalog-pricing.json').manifest;
  const registry = baseline('registry/contracts.json');
  return {...previous, contracts: [...previous.contracts, ...rows.map(([id, role, operations, pointers]) => {
    const entry = registry.contracts.find(row => row.id === id);
    assert.equal(entry?.status, 'active', 'K_ACTIVE_ROOT');
    return {id, role, version: entry.version,
      operations: operations === 'all' ? [...entry.operations] : operations, pointers,
      purpose: 'F1-08K isolated private HTTP and atomic original capture candidate; no broker, recovery or functional activation before O.', gates};
  })]};
}

export function runtimeRegistryView(registry) {
  if (registry.coverage !== runtimeCoverage) return registry;
  const previous = baseline('registry/contracts.json');
  // Project only the approved coverage marker; historical validators retain their
  // own descriptor/provenance diagnostics. validateRuntimeRegistry stays strict.
  return {...registry, coverage: previous.coverage};
}

export function runtimeSnapshot() {
  const registry = baseline('registry/contracts.json'), manifest = runtimeManifest();
  const body = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const priorLock = baseline('registry/consumers/catalog-pricing.json').lock;
  const lock = makeLock(root, manifest, body, registry, priorLock.entries);
  validateShape(manifest, read('registry/manifest-v1.schema.json'));
  validateShape(lock, read('registry/lock-v1.schema.json'));
  assert.deepEqual(lock.entries.slice(0, priorLock.entries.length), priorLock.entries, 'K_PRIOR_ADMISSIONS');
  for (const entry of lock.entries) {
    for (const file of entry.files) {
      assert(!registry.contracts.some(row => row.path === file.path && row.status === 'draft'), 'K_DRAFT_CLOSURE');
    }
  }
  return {formatVersion: 1, publication: 'local-candidate', sourceRepository: 'opencomerix/catalog-pricing',
    sourceCommit: runtimeServiceBase, manifestSha256: sha256(body),
    lockSha256: sha256(JSON.stringify(lock, null, 2) + '\n'), manifest, lock};
}

export function validateRuntimeSnapshot(snapshot = read('registry/consumers/catalog-pricing.json')) {
  const candidate = runtimeSnapshot();
  assert(['local-candidate', 'published'].includes(snapshot.publication), 'K_CANDIDATE_SNAPSHOT: invalid lifecycle');
  assert(typeof snapshot.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(snapshot.sourceCommit), 'K_CANDIDATE_SNAPSHOT: unresolved source revision');
  // Standalone CI checks exact contents. consumers --local still reads the published
  // manifest/lock at this Git revision; a state label alone never proves publication.
  const expected = snapshot.publication === 'published'
    ? {...candidate, publication: 'published', sourceCommit: snapshot.sourceCommit}
    : candidate;
  assert.deepEqual(snapshot, expected, 'K_CANDIDATE_SNAPSHOT');
  assert.equal(snapshot.manifest.contracts.find(row => row.id === 'catalog.http.private.v1').operations.length, 25);
  return {dependencies: expected.lock.entries.length, private_operations: 25, broker_producer: false, functional_activation: false};
}

export function validateRuntimeRegistry(registry = read('registry/contracts.json')) {
  assert.equal(registry.coverage, runtimeCoverage, 'K_COVERAGE_DECISION');
  assert.deepEqual(runtimeRegistryView(registry), baseline('registry/contracts.json'), 'K_REGISTRY_PRESERVATION');
  assert.deepEqual(read('registry/consumers/index.json'), baseline('registry/consumers/index.json'), 'K_INDEX_PRESERVATION');
  for (const name of registry.requiredConsumers.filter(name => name !== 'catalog-pricing')) {
    const file = 'registry/consumers/' + name + '.json';
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'), source(file).toString('utf8'), 'K_OTHER_CONSUMER');
  }
  return validateRuntimeSnapshot();
}
