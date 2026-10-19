import assert from 'node:assert/strict';
import test from 'node:test';
import {gitReader} from '../../tools/architecture/graph.mjs';
import {verifyLocalSnapshot} from '../../tools/architecture/registry.mjs';
import {runtimeBase, runtimeManifest, runtimeSnapshot, validateRuntimeRegistry, validateRuntimeSnapshot} from '../../scripts/catalog/catalog-runtime-v1-registry.mjs';
const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const prior = JSON.parse(gitReader(root, runtimeBase)('registry/consumers/catalog-pricing.json'));

test('K preserves all 17 J admissions, admits exactly 25 private operations and keeps broker/recovery inactive', () => {
  const actual = runtimeSnapshot();
  assert.deepEqual(validateRuntimeRegistry(), {dependencies: 29, private_operations: 25, broker_producer: false, functional_activation: false});
  assert.deepEqual(actual.manifest.contracts.slice(0,17), prior.manifest.contracts);
  assert.deepEqual(actual.lock.entries.slice(0,17), prior.lock.entries);
  assert.deepEqual(actual.manifest.assets, []);
  assert.deepEqual(actual.manifest.bindings, []);
  const additions = runtimeManifest().contracts.slice(17);
  assert(!additions.some(row => row.id.includes('recovery') || row.id.includes('asyncapi')));
  assert.equal(additions.filter(row => row.role === 'producer').length,1);
  assert.equal(additions.filter(row => row.role === 'local-result').length,4);
  const authority = additions.find(row => row.id === 'identity.catalog-authority.v1');
  assert.deepEqual(authority.operations,['checkCatalogAuthorization']);
});

for (const [name, change] of [
  ['operation omitted', s => s.manifest.contracts.find(row => row.id === 'catalog.http.private.v1').operations.pop()],
  ['ordinary authority replaced with recovery', s => {s.manifest.contracts.find(row => row.id === 'identity.catalog-authority.v1').operations = ['verifyCatalogRecoveryGrant'];}],
  ['broker producer inferred', s => {s.manifest.contracts.at(-1).role = 'producer';}],
  ['unknown lifecycle', s => {s.publication = 'unreviewed';}],
  ['candidate revision changed', s => {s.sourceCommit = 'a'.repeat(40);}],
  ['source ref changed', s => {s.lock.entries.at(-1).commit = 'a'.repeat(40);}],
  ['J pin changed', s => {s.lock.entries[0].commit = runtimeBase;}],
  ['J root removed', s => s.manifest.contracts.shift()],
  ['runtime asset smuggled', s => s.manifest.assets.push({purpose:'runtime'})],
]) test('K rejects ' + name, () => {
  const changed = runtimeSnapshot(); change(changed);
  assert.throws(() => validateRuntimeSnapshot(changed), /K_CANDIDATE_SNAPSHOT/);
});

const candidateFixture = runtimeSnapshot();
const publishedFixture = () => ({...structuredClone(candidateFixture), publication: 'published', sourceCommit: 'a'.repeat(40)});

test('K accepts exact published content without relabeling the local candidate or claiming provenance', () => {
  assert.deepEqual(validateRuntimeSnapshot(publishedFixture()), {dependencies: 29, private_operations: 25, broker_producer: false, functional_activation: false});
  assert.equal(candidateFixture.publication, 'local-candidate');
  for (const revision of ['HEAD', 'dev', 'a'.repeat(39), 'A'.repeat(40), '', null, 42])
    assert.throws(() => validateRuntimeSnapshot({...publishedFixture(), sourceCommit: revision}), /K_CANDIDATE_SNAPSHOT/);
});

test('K published lifecycle preserves every admitted content boundary', () => {
  for (const change of [
    s => {s.sourceRepository = 'opencomerix/identity-tenancy';},
    s => {s.manifestSha256 = '0'.repeat(64);},
    s => {s.lockSha256 = '0'.repeat(64);},
    s => {s.manifest.contracts.find(r => r.id === 'catalog.http.private.v1').operations.pop();},
    s => {s.manifest.contracts.at(-1).role = 'producer';},
    s => {s.lock.entries[0].commit = runtimeBase;},
    s => {s.lock.entries.at(-1).files[0].sha256 = '0'.repeat(64);},
    s => {s.manifest.contracts.shift();},
    s => {s.manifest.assets.push({purpose: 'runtime'});},
  ]) {
    const changed = publishedFixture(); change(changed);
    assert.throws(() => validateRuntimeSnapshot(changed), /K_CANDIDATE_SNAPSHOT/);
  }
});

test('K publication keeps the existing Git provenance gate mandatory for every published source', () => {
  const published = publishedFixture(), reads = [];
  const local = {...structuredClone(candidateFixture), sourceCommit: 'b'.repeat(40)};
  verifyLocalSnapshot(local, published, revision => {
    reads.push(revision);
    assert.equal(revision, published.sourceCommit);
    return structuredClone(published);
  });
  assert.deepEqual(reads, [published.sourceCommit]);
  assert.throws(() => verifyLocalSnapshot(local, candidateFixture, () => published), /Consumer export drift/);
  assert.throws(() => verifyLocalSnapshot(local, published, () => {throw new Error('Synthetic Git source unavailable');}), /Synthetic Git source unavailable/);
  for (const change of [
    s => {s.sourceCommit = local.sourceCommit;},
    s => {s.manifestSha256 = '0'.repeat(64);},
    s => {s.lock.entries[0].commit = runtimeBase;},
    s => {delete s.manifest;},
    s => {delete s.lock;},
  ]) {
    const wrongSource = structuredClone(published); change(wrongSource);
    assert.throws(() => verifyLocalSnapshot(local, published, () => wrongSource), /Published consumer provenance drift/);
  }
  assert.equal(candidateFixture.publication, 'local-candidate');
});
