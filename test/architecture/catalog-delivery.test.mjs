import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitReader, makeLock, worktreeReader } from '../../tools/architecture/graph.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { operationalSnapshotView } from '../../scripts/catalog/catalog-operational-recovery-v1-registry.mjs';
import { validateLifecycleSnapshot, lifecycleSnapshot } from '../../scripts/catalog/catalog-lifecycle-v1-registry.mjs';
import { validateRuntimeSnapshot } from '../../scripts/catalog/catalog-runtime-v1-registry.mjs';
import { validateFoundationSnapshot } from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';
import { deliveryBase, deliveryServiceRevision, deliverySnapshotPath, deliverySnapshot,
  deliverySnapshotView, validateDeliverySnapshot, validateDeliveryPreservation } from '../../scripts/catalog/catalog-delivery-v1-registry.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const source = gitReader(root, deliveryBase);
const previous = JSON.parse(source(deliverySnapshotPath));
// The live O2 export is verified completely before using the immutable N fixture.
const actual = operationalSnapshotView(JSON.parse(fs.readFileSync(path.join(root, deliverySnapshotPath), 'utf8')));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'registry/contracts.json'), 'utf8'));
const read = worktreeReader(root);
const serialized = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

test('N registers exactly the five reviewed producers from the published service and preserves all 38 prior admissions', () => {
  assert.deepEqual(validateDeliverySnapshot(actual), {
    dependencies: 43, previous_preserved: 38, new_producers: 5, functional_activation: false,
  });
  assert.equal(actual.publication, 'published');
  assert.equal(actual.sourceCommit, deliveryServiceRevision);
  assert.equal(actual.manifestSha256, '6788a1bdb7350a46197d055ea93404453d4da0ed3fe6791b2201440fb337d735');
  assert.equal(actual.lockSha256, '2a6642ee980233556fd9ddd2d0090dd8d9f2ea20254eb9518f7d640663ab5b84');
  assert.deepEqual(actual.manifest.contracts.slice(0, 38), previous.manifest.contracts);
  assert.deepEqual(actual.lock.entries.slice(0, 38), previous.lock.entries);
  assert.deepEqual(actual.manifest.contracts.slice(38).map(({ id, role, pointers }) => ({ id, role, pointers })), [
    { id: 'catalog.events.v1.asyncapi', role: 'producer', pointers: ['/operations/publishCatalogChanges'] },
    ...['catalog.category.changed.v1', 'catalog.product.changed.v1',
      'catalog.presentation.changed.v1', 'pricing.presentation-price.changed.v1']
      .map(id => ({ id, role: 'producer', pointers: [''] })),
  ]);
  assert(actual.lock.entries.slice(38).every(row => row.commit === '68d923e903b6341eedb980af3586890c0eab7d5e'));
  assert.deepEqual(actual.manifest.assets, []);
  assert.deepEqual(actual.manifest.bindings, []);
  assert.deepEqual(actual.lock, makeLock(root, actual.manifest, serialized(actual.manifest), registry, actual.lock.entries));
});

test('N validates the complete export before projecting to the immutable L/K/J evidence without mutating it', () => {
  const before = structuredClone(actual);
  assert.deepEqual(deliverySnapshotView(actual), previous);
  assert.deepEqual(actual, before);
  assert.deepEqual(validateLifecycleSnapshot(actual), { dependencies: 38, protection_operations: 1, functional_activation: false });
  assert.deepEqual(validateRuntimeSnapshot(actual), { dependencies: 29, private_operations: 25, broker_producer: false, functional_activation: false });
  assert.deepEqual(validateFoundationSnapshot(actual), { dependencies: 17, functional_admissions: 0, runtime_demonstrated: false });
  assert.equal(deliverySnapshotView(previous), previous);
  const historical = lifecycleSnapshot();
  assert.equal(deliverySnapshotView(historical), historical);
  const copy = deliverySnapshot();
  copy.manifest.contracts.pop();
  assert.equal(deliverySnapshot().manifest.contracts.length, 43, 'callers cannot change the cached expected export');
});

const rehash = snapshot => {
  snapshot.manifestSha256 = sha256(serialized(snapshot.manifest));
  snapshot.lock.manifestSha256 = snapshot.manifestSha256;
  snapshot.lockSha256 = sha256(serialized(snapshot.lock));
};
for (const [name, change, recompute = true] of [
  ['source repository', s => { s.sourceRepository = 'opencomerix/identity-tenancy'; }],
  ['unpublished lifecycle', s => { s.publication = 'local-candidate'; }],
  ['mutable source ref', s => { s.sourceCommit = 'dev'; }],
  ['different immutable source', s => { s.sourceCommit = 'a'.repeat(40); }],
  ['missing source identity', s => { delete s.sourceCommit; }],
  ['manifest byte hash', s => { s.manifestSha256 = '0'.repeat(64); }, false],
  ['lock byte hash', s => { s.lockSha256 = '0'.repeat(64); }, false],
  ['manifest admission hash', s => { s.lock.manifestSha256 = '0'.repeat(64); }, false],
  ['prior selection purpose', s => { s.manifest.contracts[0].purpose += ' broadened'; }],
  ['prior contract pin', s => { s.lock.entries[0].commit = deliveryBase; }],
  ['prior transport hash', s => { s.lock.entries[0].files[0].sha256 = '0'.repeat(64); }],
  ['prior admission removed', s => { s.manifest.contracts.shift(); s.lock.entries.shift(); }],
  ['producer changed to consumer', s => { s.manifest.contracts[38].role = 'consumer'; s.lock.entries[38].role = 'consumer'; }],
  ['broadened AsyncAPI selection', s => { s.manifest.contracts[38].pointers = ['']; s.lock.entries[38].pointers = ['']; }],
  ['new operation selected', s => { s.manifest.contracts[38].operations = ['unapproved']; }],
  ['new version', s => { s.manifest.contracts[39].version = 'v2'; s.lock.entries[39].version = 'v2'; }],
  ['producer source pin', s => { s.lock.entries[39].commit = deliveryBase; }],
  ['producer closure hash', s => { s.lock.entries[39].units[0].sha256 = '0'.repeat(64); }],
  ['missing producer gate', s => { s.manifest.contracts[39].gates.pop(); }],
  ['producer purpose broadened', s => { s.manifest.contracts[39].purpose = 'Unapproved commercial activation'; }],
  ['producer omitted', s => { s.manifest.contracts.pop(); s.lock.entries.pop(); }],
  ['entire suffix removed', s => { s.manifest.contracts.splice(38); s.lock.entries.splice(38); }],
  ['producers reordered', s => { [s.manifest.contracts[39], s.manifest.contracts[40]] = [s.manifest.contracts[40], s.manifest.contracts[39]]; }],
  ['unapproved producer added', s => { s.manifest.contracts.push(structuredClone(s.manifest.contracts.at(-1))); }],
  ['runtime asset', s => { s.manifest.assets.push({ purpose: 'runtime' }); }],
  ['new binding', s => { s.manifest.bindings.push({ kind: 'unapproved' }); }],
  ['unknown metadata', s => { s.unapproved = true; }],
]) test('N rejects complete export drift before any historical projection: ' + name, () => {
  const changed = structuredClone(actual);
  change(changed);
  if (recompute) rehash(changed);
  assert.throws(() => validateDeliverySnapshot(changed), /N_DELIVERY_SNAPSHOT/);
  assert.throws(() => deliverySnapshotView(changed), /N_DELIVERY_SNAPSHOT/);
  assert.throws(() => validateLifecycleSnapshot(changed), /N_DELIVERY_SNAPSHOT/);
});

test('N preserves the entire contract registry, transports, CI, dependencies, index and other four exports', () => {
  assert.deepEqual(validateDeliveryPreservation(), { roots: 119, preserved_artifacts: 236, other_consumers: 4 });
});
for (const file of ['.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'registry/contracts.json',
  'registry/consumers/index.json', ...['gateway-bff', 'identity-tenancy', 'notifications', 'web-pos']
    .map(name => 'registry/consumers/' + name + '.json'),
  'catalog/events/v1/catalog.category.changed.v1.schema.json']) {
  test('N rejects preservation drift outside the selected export: ' + file, () => {
    const changed = name => name === file ? Buffer.concat([read(name), Buffer.from('\n# unapproved\n')]) : read(name);
    assert.throws(() => validateDeliveryPreservation(changed), /N_DELIVERY_PRESERVED/);
  });
}

test('N export cut changes only its snapshot, validator, negatives and the two reviewed historical adapters', () => {
  const allowed = new Set([deliverySnapshotPath, 'scripts/catalog/catalog-delivery-v1-registry.mjs',
    'scripts/catalog/catalog-lifecycle-v1-registry.mjs', 'test/architecture/catalog-delivery.test.mjs',
    'test/architecture/asyncapi-admission-v1.test.mjs',
    'scripts/catalog/catalog-operational-recovery-v1-registry.mjs',
    'test/architecture/catalog-operational-recovery.test.mjs', 'catalog/README.md', 'registry/README.md',
    'test/catalog/asyncapi-preservation-v1.test.mjs']);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const changed = git(['diff', '--name-only', deliveryBase, '--', '.']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  for (const file of [changed, untracked].filter(Boolean).flatMap(text => text.split('\n')))
    assert(allowed.has(file), 'N_DELIVERY_SCOPE:' + file);
});
