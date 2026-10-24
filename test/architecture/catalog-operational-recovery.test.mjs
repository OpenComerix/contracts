import assert from 'node:assert/strict';
import { consumerSnapshotView } from '../../scripts/identity/catalog-workload-consumers-v2-registry.mjs';
import { workloadChangedFiles, validateWorkloadPackage } from '../../scripts/identity/catalog-workload-profiles-v2-registry.mjs';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitReader, makeLock, worktreeReader } from '../../tools/architecture/graph.mjs';
import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { validateDeliverySnapshot } from '../../scripts/catalog/catalog-delivery-v1-registry.mjs';
import { validateLifecycleSnapshot } from '../../scripts/catalog/catalog-lifecycle-v1-registry.mjs';
import { validateRuntimeSnapshot } from '../../scripts/catalog/catalog-runtime-v1-registry.mjs';
import { validateFoundationSnapshot } from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';
import { operationalBase, operationalServiceBase, operationalSnapshotPath, operationalSnapshot,
  operationalSnapshotView, validateOperationalSnapshot, validateOperationalPreservation
} from '../../scripts/catalog/catalog-operational-recovery-v1-registry.mjs';

const root = path.resolve(import.meta.dirname, '../..'), source = gitReader(root, operationalBase);
const previous = JSON.parse(source(operationalSnapshotPath));
const actual = consumerSnapshotView(JSON.parse(fs.readFileSync(path.join(root, operationalSnapshotPath), 'utf8')));
const registry = JSON.parse(source('registry/contracts.json'));
const read = worktreeReader(root);
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const rehash = snapshot => {
  snapshot.manifestSha256 = sha256(bytes(snapshot.manifest));
  snapshot.lock.manifestSha256 = snapshot.manifestSha256;
  snapshot.lockSha256 = sha256(bytes(snapshot.lock));
};
const historicalValidators = [validateDeliverySnapshot, validateLifecycleSnapshot, validateRuntimeSnapshot, validateFoundationSnapshot];

test('O2 adds exactly R4 producer and four R4/R3 v2 consumers, preserving all 43 prior selections and pins', () => {
  assert.deepEqual(validateOperationalSnapshot(actual), { dependencies: 48, previous_preserved: 43,
    new_producers: 1, new_consumers: 4, functional_activation: false });
  assert.deepEqual(actual.manifest.contracts.slice(0, 43), previous.manifest.contracts);
  assert.deepEqual(actual.lock.entries.slice(0, 43), previous.lock.entries);
  assert.deepEqual(actual.manifest.contracts.slice(43).map(({ id, role, version, operations, pointers }) => ({ id, role, version, operations, pointers })), [
    { id: 'catalog.history-recovery.http.v1', role: 'producer', version: '1.0.0', operations: ['createCatalogHistoryRecovery', 'readCatalogHistoryRecoveryPage'], pointers: [] },
    { id: 'catalog.history-recovery.protocol.v1', role: 'consumer', version: 'v1', operations: [], pointers: [''] },
    { id: 'catalog.history-recovery.policy.v1', role: 'consumer', version: '1', operations: [], pointers: [''] },
    { id: 'identity.catalog-recovery-verification.http.v2', role: 'consumer', version: '2.0.0', operations: ['verifyCatalogRecoveryGrantV2'], pointers: [] },
    { id: 'identity.catalog-recovery-verification.policy.v2', role: 'consumer', version: '2', operations: [], pointers: [''] },
  ]);
  assert(actual.lock.entries.slice(43).every(row => row.commit === '28be1edf02a3771629febf554f8b5f4856452877'));
  assert.deepEqual(actual.manifest.assets, []); assert.deepEqual(actual.manifest.bindings, []);
  assert.deepEqual(actual.lock, makeLock(root, actual.manifest, bytes(actual.manifest), registry, actual.lock.entries));
  const files = [...new Set(actual.lock.entries.slice(43).flatMap(row => row.files.map(file => file.path)))].sort();
  assert.deepEqual(files, [
    'catalog/events/v1/catalog-event-data-v1.schema.json', 'catalog/events/v1/catalog.category.changed.v1.schema.json',
    'catalog/events/v1/catalog.presentation.changed.v1.schema.json', 'catalog/events/v1/catalog.product.changed.v1.schema.json',
    'catalog/events/v1/pricing.presentation-price.changed.v1.schema.json', 'catalog/http/private/v1/catalog-history-recovery-v1.yaml',
    'catalog/http/shared/v1/catalog-history-recovery-protocol-v1.schema.json', 'catalog/http/shared/v1/catalog-history-recovery-v1-policy.json',
    'catalog/http/shared/v1/catalog-history-recovery-v1.schema.json', 'common/http/shared/v3/problem-details-v3.schema.json',
    'events/event-envelope-v1.schema.json', 'identity/http/private/v1/identity-catalog-recovery-authority-v1.yaml',
    'identity/http/private/v2/identity-catalog-recovery-verification-v2.yaml', 'identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json',
    'identity/http/shared/v2/identity-catalog-recovery-verification-v2-policy.json', 'identity/http/shared/v2/identity-catalog-recovery-verification-v2.schema.json',
  ]);
  assert(!registry.contracts.some(row => row.status === 'draft' && files.includes(row.path)));
});

test('O2 validates the whole current export before immutable N/L/K/J projection, without mutation or shared cache', () => {
  const before = structuredClone(actual);
  assert.deepEqual(operationalSnapshotView(actual), previous);
  assert.deepEqual(actual, before);
  assert.deepEqual(historicalValidators.map(validate => validate(actual).dependencies), [43, 38, 29, 17]);
  assert.equal(operationalSnapshotView(previous), previous);
  const copy = operationalSnapshot(); copy.manifest.contracts.pop();
  assert.equal(operationalSnapshot().manifest.contracts.length, 48);
});

for (const [name, change, recompute = true] of [
  ['source repository', s => { s.sourceRepository = 'opencomerix/identity-tenancy'; }],
  ['unreviewed lifecycle', s => { s.publication = 'unreviewed'; }],
  ['mutable ref', s => { s.sourceCommit = 'dev'; }],
  ['different candidate base', s => { s.sourceCommit = 'a'.repeat(40); }],
  ['missing source', s => { delete s.sourceCommit; }],
  ['manifest byte hash', s => { s.manifestSha256 = '0'.repeat(64); }, false],
  ['lock byte hash', s => { s.lockSha256 = '0'.repeat(64); }, false],
  ['manifest admission hash', s => { s.lock.manifestSha256 = '0'.repeat(64); }, false],
  ['prior selection', s => { s.manifest.contracts[0].purpose += ' changed'; }],
  ['prior pin', s => { s.lock.entries[0].commit = operationalBase; }],
  ['prior hash', s => { s.lock.entries[0].files[0].sha256 = '0'.repeat(64); }],
  ['prior admission omitted', s => { s.manifest.contracts.shift(); s.lock.entries.shift(); }],
  ['R4 operation omitted', s => { s.manifest.contracts[43].operations.pop(); }],
  ['R4 role', s => { s.manifest.contracts[43].role = s.lock.entries[43].role = 'validation'; }],
  ['policy role', s => { s.manifest.contracts[45].role = s.lock.entries[45].role = 'validation'; }],
  ['R3 issuance smuggled', s => { s.manifest.contracts[46].operations.push('issueCatalogRecoveryGrant'); }],
  ['policy selection narrowed', s => { s.manifest.contracts[47].pointers = ['/profiles']; }],
  ['wrong version', s => { s.manifest.contracts[46].version = '1.0.0'; }],
  ['new pin', s => { s.lock.entries[43].commit = operationalBase; }],
  ['closure file hash', s => { s.lock.entries[43].files[0].sha256 = '0'.repeat(64); }],
  ['closure unit hash', s => { s.lock.entries[43].units[0].sha256 = '0'.repeat(64); }],
  ['closure file omitted', s => { s.lock.entries[43].files.pop(); }],
  ['purpose broadened', s => { s.manifest.contracts[43].purpose = 'Enable runtime'; }],
  ['gate omitted', s => { s.manifest.contracts[43].gates.pop(); }],
  ['one selection omitted', s => { s.manifest.contracts.pop(); s.lock.entries.pop(); }],
  ['lock suffix only', s => { s.manifest.contracts.splice(43); }],
  ['manifest suffix only', s => { s.lock.entries.splice(43); }],
  ['entire suffix omitted', s => { s.manifest.contracts.splice(43); s.lock.entries.splice(43); }],
  ['extra selection', s => { s.manifest.contracts.push(structuredClone(s.manifest.contracts.at(-1))); }],
  ['extra asset', s => { s.manifest.assets.push({ purpose: 'runtime' }); }],
  ['extra binding', s => { s.manifest.bindings.push({ kind: 'unapproved' }); }],
  ['extra metadata', s => { s.unapproved = true; }],
]) test('O2 rejects drift before all historical projections: ' + name, () => {
  const wrong = operationalSnapshot(); change(wrong); if (recompute) rehash(wrong);
  for (const validate of [validateOperationalSnapshot, operationalSnapshotView, ...historicalValidators])
    assert.throws(() => validate(wrong), /O2_RECOVERY_SNAPSHOT/);
});

test('O2 recognizes a partial suffix even with a historical source marker and at most 43 entries', () => {
  for (const part of ['manifest', 'lock']) {
    const wrong = structuredClone(previous);
    if (part === 'manifest') wrong.manifest.contracts[42] = structuredClone(actual.manifest.contracts[46]);
    else wrong.lock.entries[42] = structuredClone(actual.lock.entries[46]);
    rehash(wrong);
    assert.throws(() => operationalSnapshotView(wrong), /O2_RECOVERY_SNAPSHOT/);
    for (const validate of historicalValidators) assert.throws(() => validate(wrong), /O2_RECOVERY_SNAPSHOT/);
  }
});

test('O2 published contents require a resolved SHA and the canonical Git provenance check remains mandatory', () => {
  const candidate = operationalSnapshot();
  assert.equal(candidate.publication, 'local-candidate'); assert.equal(candidate.sourceCommit, operationalServiceBase);
  const published = { ...structuredClone(candidate), publication: 'published', sourceCommit: 'a'.repeat(40) };
  assert.equal(validateOperationalSnapshot(published).dependencies, 48);
  const reads = [];
  verifyLocalSnapshot(candidate, published, revision => { reads.push(revision); return published; });
  assert.deepEqual(reads, [published.sourceCommit]);
  assert.throws(() => verifyLocalSnapshot(candidate, published, () => { throw new Error('Synthetic Git unavailable'); }), /Git unavailable/);
  for (const change of [s => { s.sourceCommit = operationalServiceBase; }, s => { s.manifestSha256 = '0'.repeat(64); },
    s => { delete s.manifest; }, s => { delete s.lock; }]) {
    const wrong = structuredClone(published); change(wrong);
    assert.throws(() => verifyLocalSnapshot(candidate, published, () => wrong), /Published consumer provenance drift/);
  }
  const relabeled = { ...candidate, publication: 'published' };
  assert.throws(() => verifyLocalSnapshot(candidate, relabeled, () => previous), /Published consumer provenance drift/);
  assert.throws(() => verifyLocalSnapshot({ ...candidate, sourceCommit: 'b'.repeat(40) }, candidate, () => published), /Consumer export drift/);
  for (const revision of ['HEAD', 'dev', 'a'.repeat(39), 'A'.repeat(40), '', null, 42])
    assert.throws(() => validateOperationalSnapshot({ ...published, sourceCommit: revision }), /O2_RECOVERY_SNAPSHOT/);
  const wrong = structuredClone(published); wrong.manifest.contracts[43].operations.pop(); rehash(wrong);
  assert.throws(() => validateOperationalSnapshot(wrong), /O2_RECOVERY_SNAPSHOT/);
  assert.equal(candidate.publication, 'local-candidate');
});

test('O2 preserves published sources, registry, indices, other consumers, CI, dependencies and canonical tools', () => {
  assert.deepEqual(validateOperationalPreservation(), { roots: 119, preserved_artifacts: 236, other_consumers: 4 });
});
for (const file of ['registry/contracts.json', 'registry/consumers/index.json', 'catalog/index.json', 'identity/index.json',
  'common/index.json', '.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'tools/architecture/cli.mjs',
  ...['gateway-bff', 'identity-tenancy', 'notifications', 'web-pos'].map(name => 'registry/consumers/' + name + '.json'),
  'catalog/http/private/v1/catalog-history-recovery-v1.yaml']) {
  test('O2 rejects preservation drift: ' + file, () => {
    const changed = name => name === file ? Buffer.concat([read(name), Buffer.from('\n# unapproved\n')]) : read(name);
    assert.throws(() => validateOperationalPreservation(changed), /O2_RECOVERY_PRESERVED/);
  });
}

test('O2 confines all tracked, indexed and new changes to its approved contract files', () => {
  const allowed = new Set([operationalSnapshotPath, 'scripts/catalog/catalog-operational-recovery-v1-registry.mjs',
    'test/architecture/catalog-operational-recovery.test.mjs', 'scripts/catalog/catalog-delivery-v1-registry.mjs',
    'test/architecture/catalog-delivery.test.mjs', 'test/architecture/asyncapi-admission-v1.test.mjs',
    'catalog/README.md', 'registry/README.md', 'test/catalog/asyncapi-preservation-v1.test.mjs']);
  validateWorkloadPackage();
  for (const file of workloadChangedFiles) allowed.add(file);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  for (const list of [git(['diff', '--name-only', operationalBase, '--', '.']), git(['ls-files', '--others', '--exclude-standard'])])
    for (const file of list.split('\n').filter(Boolean)) assert(allowed.has(file), 'O2_RECOVERY_SCOPE:' + file);
});
