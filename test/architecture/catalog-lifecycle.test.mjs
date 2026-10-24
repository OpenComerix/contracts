import assert from 'node:assert/strict';
import { consumerReadView } from '../../scripts/identity/catalog-workload-consumers-v2-registry.mjs';
import { workloadRegistryView } from '../../scripts/identity/catalog-workload-profiles-v2-registry.mjs';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {gitReader} from '../../tools/architecture/graph.mjs';
import {verifyLocalSnapshot} from '../../tools/architecture/registry.mjs';
import {lifecycleBase, lifecycleCoverage, lifecycleManifest, lifecycleRegistryView,
  lifecycleSnapshot, validateLifecycleRegistry, validateLifecycleSnapshot} from '../../scripts/catalog/catalog-lifecycle-v1-registry.mjs';
import {validateRuntimeSnapshot, runtimeRegistryView} from '../../scripts/catalog/catalog-runtime-v1-registry.mjs';

const root = path.resolve(import.meta.dirname, '../..'), source = gitReader(root, lifecycleBase);
const prior = JSON.parse(source('registry/consumers/catalog-pricing.json'));

test('L adds eight R1/R2 selections plus narrow R3 verification and preserves all 29 K admissions exactly', () => {
  const snapshot = lifecycleSnapshot();
  assert.deepEqual(validateLifecycleRegistry(), {dependencies: 38, protection_operations: 1, functional_activation: false});
  assert.deepEqual(snapshot.manifest.contracts.slice(0, 29), prior.manifest.contracts);
  assert.deepEqual(snapshot.lock.entries.slice(0, 29), prior.lock.entries);
  assert.deepEqual(snapshot.manifest.assets, []);
  assert.deepEqual(snapshot.manifest.bindings, []);
  const additions = lifecycleManifest().contracts.slice(29);
  assert.equal(additions.filter(row => row.role === 'producer').length, 1);
  assert.deepEqual(additions[0].operations, ['submitCatalogHistoryProtectionMessage']);
  assert(!additions.some(row => /asyncapi/.test(row.id)));
  assert.deepEqual(additions.filter(row=>/recovery/.test(row.id)).map(row=>({id:row.id,operations:row.operations})), [{id:'identity.catalog-recovery-authority.v1',operations:['verifyCatalogRecoveryGrant']}]);
  assert(snapshot.lock.entries.slice(29).every(row => row.commit === '28be1edf02a3771629febf554f8b5f4856452877'));
});

test('L projects only its coverage marker to K/J and its gate strictly preserves the full registry', () => {
  const previous = JSON.parse(source('registry/contracts.json'));
  const current = {...structuredClone(previous), coverage: lifecycleCoverage};
  assert.deepEqual(lifecycleRegistryView(current), previous);
  assert.equal(runtimeRegistryView(current).coverage, runtimeRegistryView(previous).coverage);
  for (const change of [
    r => {r.contracts[0].sha256 = '0'.repeat(64);},
    r => r.contracts.pop(), r => r.planned.pop(),
    r => r.requiredConsumers.push('unapproved'),
    r => {r.preservedFiles[0].sha256 = '0'.repeat(64);},
    r => {r.extra = 'unapproved';},
  ]) {
    const wrong = structuredClone(current); change(wrong);
    const before = structuredClone(wrong);
    assert.deepEqual(lifecycleRegistryView(wrong), {...wrong, coverage: previous.coverage});
    assert.deepEqual(wrong, before);
    assert.throws(() => validateLifecycleRegistry(wrong), /L_REGISTRY_PRESERVATION/);
  }
  const unknown = {...current, coverage: 'unapproved'};
  assert.equal(lifecycleRegistryView(unknown), unknown);
  assert.throws(() => validateLifecycleRegistry(unknown), /L_COVERAGE_DECISION/);
});

for (const [name, change] of [
  ['missing operation', s => s.manifest.contracts[29].operations.pop()],
  ['changed producer role', s => {s.manifest.contracts[29].role = 'validation';}],
  ['missing selection', s => s.manifest.contracts.pop()],
  ['prior K entry changed', s => {s.manifest.contracts[17].operations.pop();}],
  ['changed source', s => {s.lock.entries[29].commit = lifecycleBase;}],
  ['changed prior pin', s => {s.lock.entries[0].commit = lifecycleBase;}],
  ['changed hash', s => {s.lock.entries[29].files[0].sha256 = '0'.repeat(64);}],
  ['unreviewed lifecycle', s => {s.publication = 'unreviewed';}],
  ['candidate revision changed', s => {s.sourceCommit = 'a'.repeat(40);}],
  ['extra asset', s => s.manifest.assets.push({purpose: 'runtime'})],
]) test('L and the K projection reject ' + name, () => {
  const wrong = lifecycleSnapshot(); change(wrong);
  assert.throws(() => validateLifecycleSnapshot(wrong), /L_CANDIDATE_SNAPSHOT/);
  assert.throws(() => validateRuntimeSnapshot(wrong));
});

test('L publication checks exact content; local Git provenance remains mandatory', () => {
  const candidate = lifecycleSnapshot();
  const published = {...structuredClone(candidate), publication: 'published', sourceCommit: 'a'.repeat(40)};
  assert.deepEqual(validateLifecycleSnapshot(published), {dependencies: 38, protection_operations: 1, functional_activation: false});
  assert.deepEqual(validateRuntimeSnapshot(candidate), {dependencies: 29, private_operations: 25, broker_producer: false, functional_activation: false});
  const reads = [];
  verifyLocalSnapshot(candidate, published, revision => {reads.push(revision); return published;});
  assert.deepEqual(reads, [published.sourceCommit]);
  assert.throws(() => verifyLocalSnapshot(candidate, published, () => {throw new Error('synthetic Git unavailable');}), /Git unavailable/);
  for (const revision of ['HEAD', 'dev', 'a'.repeat(39), '', null, 42])
    assert.throws(() => validateLifecycleSnapshot({...published, sourceCommit: revision}), /L_CANDIDATE_SNAPSHOT/);
  const wrong = structuredClone(published); wrong.manifest.contracts[29].operations = [];
  assert.throws(() => validateLifecycleSnapshot(wrong), /L_CANDIDATE_SNAPSHOT/);
  assert.throws(() => verifyLocalSnapshot(candidate, published, () => wrong), /Published consumer provenance drift/);
  assert.equal(candidate.publication, 'local-candidate');
});

test('L leaves source transports, descriptors, indexes and four other exports unchanged', () => {
  const registry = workloadRegistryView(JSON.parse(fs.readFileSync(path.join(root, 'registry/contracts.json'), 'utf8')));
  assert.deepEqual(lifecycleRegistryView(registry), JSON.parse(source('registry/contracts.json')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'registry/consumers/index.json'), 'utf8')),
    JSON.parse(source('registry/consumers/index.json')));
  for (const contract of registry.contracts) {
    const actual = fs.readFileSync(path.join(root, contract.path), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(actual, source(contract.path).toString('utf8'), contract.path);
  }
  for (const name of registry.requiredConsumers.filter(name => name !== 'catalog-pricing')) {
    const file = 'registry/consumers/' + name + '.json';
    assert.equal(consumerReadView(name => fs.readFileSync(path.join(root, name)))(file).toString('utf8').replaceAll('\r\n', '\n'), source(file).toString('utf8'), file);
  }
});
