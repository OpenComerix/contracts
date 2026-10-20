import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gitReader, makeLock} from '../../tools/architecture/graph.mjs';
import {sha256, validateShape} from '../../tools/architecture/consumer-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const lifecycleBase = '651cb22d784fef917bd2e9e2e7f242dbb9ab8c7e';
export const lifecycleServiceBase = '759b10b96d9439e8ceded4dd2fb16d26362bcd39';
export const lifecycleCoverage = 'Five known consumers; catalog-pricing F1-08L isolated R1/R2 lifecycle candidate; no functional activation before O; external consumers unknown.';
const source = gitReader(root, lifecycleBase);
const baseline = file => JSON.parse(source(file));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const rows = [
  ['catalog.history-protection.http.v1', 'producer', ['submitCatalogHistoryProtectionMessage'], []],
  ['catalog.history-protection.schema.v1', 'consumer', [], ['']],
  ['catalog.history-protection.policy.v1', 'consumer', [], ['']],
  ['catalog.history-policy.v2', 'consumer', [], ['']],
  ['common.data-lifecycle-policy.v2', 'consumer', [], ['']],
  ['catalog.history-protection.fixtures.v1', 'validation', [], ['']],
  ['catalog.history-policy.fixtures.v2', 'validation', [], ['']],
  ['common.error-catalog.v7', 'consumer', [], ['']],
  ['identity.catalog-recovery-authority.v1', 'consumer', ['verifyCatalogRecoveryGrant'], []],
];

export function lifecycleManifest() {
  const prior = baseline('registry/consumers/catalog-pricing.json').manifest;
  const registry = baseline('registry/contracts.json');
  return {...prior, contracts: [...prior.contracts, ...rows.map(([id, role, operations, pointers]) => {
    const entry = registry.contracts.find(row => row.id === id);
    assert.equal(entry?.status, 'active', 'L_ACTIVE_ROOT');
    return {id, role, version: entry.version, operations: [...operations], pointers: [...pointers],
      purpose: 'F1-08L isolated R1/R2 history lifecycle, protection and controlled disposition; no functional activation, recovery or broker.',
      gates: ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:e2e']};
  })]};
}

export function lifecycleRegistryView(registry) {
  if (registry.coverage !== lifecycleCoverage) return registry;
  const previous = baseline('registry/contracts.json');
  const projected = {...registry, coverage: previous.coverage};
  assert.deepEqual(projected, previous, 'L_REGISTRY_PRESERVATION');
  return projected;
}

export function lifecycleSnapshot() {
  const registry = baseline('registry/contracts.json'), manifest = lifecycleManifest();
  const body = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const previous = baseline('registry/consumers/catalog-pricing.json').lock;
  const lock = makeLock(root, manifest, body, registry, previous.entries);
  validateShape(manifest, read('registry/manifest-v1.schema.json'));
  validateShape(lock, read('registry/lock-v1.schema.json'));
  assert.deepEqual(lock.entries.slice(0, previous.entries.length), previous.entries, 'L_PRIOR_ADMISSIONS');
  return {formatVersion: 1, publication: 'local-candidate', sourceRepository: 'opencomerix/catalog-pricing',
    sourceCommit: lifecycleServiceBase, manifestSha256: sha256(body),
    lockSha256: sha256(JSON.stringify(lock, null, 2) + '\n'), manifest, lock};
}

export function validateLifecycleSnapshot(snapshot = read('registry/consumers/catalog-pricing.json')) {
  const candidate = lifecycleSnapshot();
  assert(['local-candidate', 'published'].includes(snapshot.publication), 'L_CANDIDATE_SNAPSHOT: invalid lifecycle');
  assert(typeof snapshot.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(snapshot.sourceCommit), 'L_CANDIDATE_SNAPSHOT: unresolved revision');
  const expected = snapshot.publication === 'published'
    ? {...candidate, publication: 'published', sourceCommit: snapshot.sourceCommit} : candidate;
  assert.deepEqual(snapshot, expected, 'L_CANDIDATE_SNAPSHOT');
  return {dependencies: expected.lock.entries.length, protection_operations: 1, functional_activation: false};
}

export function validateLifecycleRegistry(registry = read('registry/contracts.json')) {
  assert.equal(registry.coverage, lifecycleCoverage, 'L_COVERAGE_DECISION');
  lifecycleRegistryView(registry);
  assert.deepEqual(read('registry/consumers/index.json'), baseline('registry/consumers/index.json'), 'L_INDEX_PRESERVATION');
  for (const name of registry.requiredConsumers.filter(name => name !== 'catalog-pricing')) {
    const file = 'registry/consumers/' + name + '.json';
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'), source(file).toString('utf8'), 'L_OTHER_CONSUMER');
  }
  return validateLifecycleSnapshot();
}
