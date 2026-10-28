import { salesHistoricalIndex } from '../sales/inventory-step-consumer-v1.mjs';
import assert from 'node:assert/strict';
import { consumerReadView } from '../identity/catalog-workload-consumers-v2-registry.mjs';
import {runtimeRegistryView, validateRuntimeSnapshot, runtimeBase} from './catalog-runtime-v1-registry.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {gitReader, makeLock, worktreeReader} from '../../tools/architecture/graph.mjs';
import {sha256, validateShape} from '../../tools/architecture/consumer-gate.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const foundationBase = 'fb3b6460df7c2beaaaf6db38e852762ce80253fe';
export const foundationServiceBase = 'daccb56bc1f967871532176e7c29e84c11056728';
export const foundationCoverage = 'Four existing consumers plus catalog-pricing foundation validation only; external consumers remain unknown.';
export const foundationIndexCoverage = 'Five known consumers; catalog-pricing validation only; external consumers remain unknown.';
let baselineRegistry;
const prior = () => structuredClone(baselineRegistry ??= JSON.parse(gitReader(root, foundationBase)('registry/contracts.json')));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

// Only this explicit coverage decision projects to the historical four. Missing
// markers or arbitrary additions still reach the original H/I metadata guards.
// The full J gate below additionally checks the complete registry and export.
export function foundationRegistryView(registry) {
  registry = runtimeRegistryView(registry);
  if (registry.coverage !== foundationCoverage) return registry;
  const baseline = prior();
  assert.deepEqual(registry.requiredConsumers, [...baseline.requiredConsumers, 'catalog-pricing'],
    'RENEWAL_REGISTRY_METADATA: F1-08J consumer coverage');
  return {...registry, coverage: baseline.coverage, requiredConsumers: baseline.requiredConsumers};
}

const whole = [''];
const technicalPolicy = ['format_version', 'status', 'producer', 'maximum_bytes', 'events', 'operation_effects',
  'source_shapes', 'compatibility', 'delivery', 'privacy', 'future_runtime'];
const protectionPolicy = ['protocol_version', 'status', 'owner', 'runtime_demonstrated', 'production_enabled',
  'transport', 'limits', 'authority', 'semantics', 'kinds', 'errors', 'prerequisites'];
const recoveryPolicy = ['protocol_version', 'status', 'owner', 'runtime_demonstrated', 'production_enabled',
  'transport', 'limits', 'cursor', 'semantics', 'profiles', 'storage_inventory', 'source_pins', 'candidate_dependencies'];
const historyPolicy = ['format_version', 'status', 'catalogue_id', 'version', 'owner', 'decision', 'profiles',
  'storage_policies', 'field_sources', 'independent_policies', 'production_prerequisites', 'runtime_demonstrated',
  'protocol_sources', 'classification_profiles', 'storage_fields', 'inheritance', 'compatibility'];
const pointers = names => names.map(name => '/' + name);
export const foundationSelection = [
  ['common.event-envelope.v1', whole], ['catalog.common.v1', whole], ['catalog.entities.v1', whole],
  ['catalog.prices.v1', whole], ['catalog.event-data.v1', whole],
  ['catalog.event-policy.v1', pointers(technicalPolicy)],
  ['catalog.category.changed.v1', whole], ['catalog.product.changed.v1', whole],
  ['catalog.presentation.changed.v1', whole], ['pricing.presentation-price.changed.v1', whole],
  ['catalog.history-protection.schema.v1', whole],
  ['catalog.history-protection.policy.v1', pointers(protectionPolicy)],
  ['catalog.history-recovery.schema.v1', whole], ['catalog.history-recovery.protocol.v1', whole],
  ['catalog.history-recovery.policy.v1', pointers(recoveryPolicy)],
  ['catalog.history-policy.v2', pointers(historyPolicy)], ['common.data-lifecycle-policy.v2', whole],
];

export function foundationManifest(registry = prior()) {
  return {formatVersion: 1, service: 'catalog-pricing', contracts: foundationSelection.map(([id, selected]) => {
    const row = registry.contracts.find(row => row.id === id);
    assert(row?.status === 'active', 'J_ACTIVE_VALIDATION_ROOT');
    return {id, role: 'validation', version: row.version, operations: [], pointers: [...selected],
      purpose: 'Validate F1-08J owner persistence boundaries; no API, event producer or recovery runtime admission.',
      gates: ['pnpm contracts:metadata', 'pnpm test:integration']};
  }), assets: [], bindings: []};
}

export function validateFoundationRegistry(registry = read('registry/contracts.json'), index = read('registry/consumers/index.json'), readFiles = worktreeReader(root)) {
  index = salesHistoricalIndex(index);
  const consumers = consumerReadView(readFiles);
  registry = runtimeRegistryView(registry);
  assert.equal(registry.coverage, foundationCoverage, 'J_COVERAGE_DECISION');
  assert.deepEqual(foundationRegistryView(registry), prior(), 'J_REGISTRY_PRESERVATION');
  const before = JSON.parse(gitReader(root, foundationBase)('registry/consumers/index.json'));
  assert.deepEqual(index, {...before, coverage: foundationIndexCoverage, consumers: [...before.consumers,
    {service: 'catalog-pricing', file: 'catalog-pricing.json', localDirectory: 'services/catalog-pricing'}]}, 'J_CONSUMER_INDEX');
  for (const service of prior().requiredConsumers) {
    const file = 'registry/consumers/' + service + '.json';
    assert.equal(consumers(file).toString('utf8').replaceAll('\r\n', '\n'),
      gitReader(root, foundationBase)(file).toString('utf8'), 'J_PRIOR_EXPORT: ' + service);
  }
  return {consumers: 5, new_validation_consumers: 1, runtime_demonstrated: false};
}

let expectedSnapshot;
export function validateFoundationSnapshot(snapshot = read('registry/consumers/catalog-pricing.json')) {
  if (snapshot.manifest?.contracts?.some(row => row.id === 'catalog.http.private.v1')) {
    validateRuntimeSnapshot(snapshot);
    snapshot = JSON.parse(gitReader(root, runtimeBase)('registry/consumers/catalog-pricing.json'));
  }
  if (!expectedSnapshot) {
    const manifest = foundationManifest(), body = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    const lock = makeLock(root, manifest, body, prior());
    validateShape(manifest, read('registry/manifest-v1.schema.json'));
    validateShape(lock, read('registry/lock-v1.schema.json'));
    expectedSnapshot = {formatVersion: 1, publication: 'local-candidate', sourceRepository: 'opencomerix/catalog-pricing',
      sourceCommit: foundationServiceBase, manifestSha256: sha256(body),
      lockSha256: sha256(JSON.stringify(lock, null, 2) + '\n'), manifest, lock};
  }
  // Standalone contracts CI validates admitted contents and lifecycle. Published
  // Git provenance is mandatory in consumers --local through verifyLocalSnapshot;
  // accepting this state alone never proves publication or the source pipeline.
  assert(['local-candidate', 'published'].includes(snapshot.publication), 'J_VALIDATION_SNAPSHOT: invalid lifecycle');
  assert(typeof snapshot.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(snapshot.sourceCommit),
    'J_VALIDATION_SNAPSHOT: unresolved source revision');
  const expected = snapshot.publication === 'published'
    ? {...expectedSnapshot, publication: 'published', sourceCommit: snapshot.sourceCommit}
    : expectedSnapshot;
  assert.deepEqual(snapshot, expected, 'J_VALIDATION_SNAPSHOT');
  return {dependencies: expectedSnapshot.lock.entries.length, functional_admissions: 0, runtime_demonstrated: false};
}
