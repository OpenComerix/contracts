import assert from 'node:assert/strict';
import {runtimeRegistryView, runtimeBase} from '../../scripts/catalog/catalog-runtime-v1-registry.mjs';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gitReader} from '../../tools/architecture/graph.mjs';
import {verifyLocalSnapshot} from '../../tools/architecture/registry.mjs';
import {root, foundationBase, foundationServiceBase, foundationCoverage, foundationRegistryView,
  validateFoundationRegistry, validateFoundationSnapshot} from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';
import {validateRenewalRegistry} from '../../scripts/identity/catalog-recovery-renewal-v2-registry.mjs';
import {validateIdentityAdmission} from '../../scripts/identity/validate-catalog-admission-v1.mjs';
import {validateHistoryRegistry} from '../../scripts/catalog/validate-history-protection-v1.mjs';

const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const registry = read('registry/contracts.json'), index = read('registry/consumers/index.json');
const registeredSnapshot = read('registry/consumers/catalog-pricing.json'), source = gitReader(root, foundationBase);
// Keep the candidate fixture independent of the live export lifecycle. The first
// test validates the real registered export; adversarial candidate cases always
// start from the candidate base, including after a genuine published import.
const snapshot = {...JSON.parse(gitReader(root, runtimeBase)('registry/consumers/catalog-pricing.json')), publication: 'local-candidate', sourceCommit: foundationServiceBase};

test('J adds only one validation consumer; all 119 roots, 236 artifacts, intentions and prior exports survive', () => {
  assert.deepEqual(validateFoundationRegistry(), {consumers: 5, new_validation_consumers: 1, runtime_demonstrated: false});
  assert.deepEqual(foundationRegistryView(registry), JSON.parse(source('registry/contracts.json')));
  assert.equal(registry.contracts.length, 119); assert.equal(registry.preservedFiles.length, 236);
  assert.deepEqual(validateFoundationSnapshot(), {dependencies: 17, functional_admissions: 0, runtime_demonstrated: false});
  assert.deepEqual(validateFoundationSnapshot(registeredSnapshot), {dependencies: 17, functional_admissions: 0, runtime_demonstrated: false});
  assert(snapshot.manifest.contracts.every(row => row.role === 'validation' && row.operations.length === 0));
  assert(!snapshot.manifest.contracts.some(row => /\.http\.|asyncapi|\.consumer$/.test(row.id)));
  assert.deepEqual(snapshot.manifest.assets, []); assert.deepEqual(snapshot.manifest.bindings, []);
  assert.deepEqual([...new Set(snapshot.lock.entries.map(row => row.commit))], [
    '4ec41110d2c4c68139101e0a13109f6fd1cdfcba', '68d923e903b6341eedb980af3586890c0eab7d5e',
    '28be1edf02a3771629febf554f8b5f4856452877']);
});

for (const [name, mutate] of [
  ['missing coverage decision', r => {r.coverage = 'unknown';}],
  ['missing consumer', r => r.requiredConsumers.pop()],
  ['duplicate consumer', r => r.requiredConsumers.push('catalog-pricing')],
  ['unapproved consumer', r => r.requiredConsumers.push('unapproved')],
  ['prior consumer removed', r => r.requiredConsumers.shift()],
  ['reordered coverage', r => r.requiredConsumers.reverse()],
  ['descriptor changed', r => {r.contracts[0].purpose = 'changed';}],
  ['root removed', r => r.contracts.pop()],
  ['intention removed', r => r.planned.pop()],
  ['draft promoted', r => {r.contracts.find(row => row.status === 'draft').status = 'active';}],
  ['preservation removed', r => r.preservedFiles.pop()],
]) test('J rejects registry drift: ' + name, () => {
  const changed = structuredClone(registry); mutate(changed);
  assert.throws(() => validateFoundationRegistry(changed, index));
});

for (const [name, mutate] of [
  ['unknown identity', i => {i.consumers.at(-1).service = 'unapproved';}],
  ['checkout redirected', i => {i.consumers.at(-1).localDirectory = 'services/identity-tenancy';}],
  ['prior mapping changed', i => {i.consumers[0].file = 'catalog-pricing.json';}],
  ['new consumer omitted', i => i.consumers.pop()],
]) test('J rejects index drift: ' + name, () => {
  const changed = structuredClone(index); mutate(changed);
  assert.throws(() => validateFoundationRegistry(registry, changed), /J_CONSUMER_INDEX/);
});

for (const [name, mutate] of [
  ['producer role', s => {s.manifest.contracts[0].role = 'producer';}],
  ['new operation', s => s.manifest.contracts[0].operations.push('createCatalogProduct')],
  ['root missing', s => s.manifest.contracts.pop()],
  ['selection broadened', s => {s.manifest.contracts.find(row => row.id === 'catalog.history-policy.v2').pointers = [''];}],
  ['pin changed', s => {s.lock.entries[0].commit = foundationBase;}],
  ['hash changed', s => {s.lock.entries[0].files[0].sha256 = '0'.repeat(64);}],
  ['unknown lifecycle', s => {s.publication = 'unreviewed';}],
  ['unproven source', s => {s.sourceCommit = '0'.repeat(40);}],
  ['runtime copy', s => s.manifest.assets.push({purpose: 'runtime'})],
]) test('J rejects snapshot drift: ' + name, () => {
  const changed = structuredClone(snapshot); mutate(changed);
  assert.throws(() => validateFoundationSnapshot(changed), /J_VALIDATION_SNAPSHOT/);
});

// Synthetic publication exercises the CI content check; it is not evidence of a
// real consumer commit or pipeline. The local provenance gate is checked below.
const publishedFixture = () => ({...structuredClone(snapshot), publication: 'published', sourceCommit: 'a'.repeat(40)});
test('J accepts unchanged published content without retaining the scaffold revision or relabeling the candidate', () => {
  const published = publishedFixture();
  assert.deepEqual(validateFoundationSnapshot(published), {dependencies: 17, functional_admissions: 0, runtime_demonstrated: false});
  assert.equal(snapshot.publication, 'local-candidate');
  assert.notEqual(published.sourceCommit, snapshot.sourceCommit);
  for (const revision of ['HEAD', 'dev', 'a'.repeat(39), 'A'.repeat(40), '', null, 42]) {
    assert.throws(() => validateFoundationSnapshot({...published, sourceCommit: revision}), /J_VALIDATION_SNAPSHOT/);
  }
});

for (const [name, mutate] of [
  ['identity', s => {s.sourceRepository = 'opencomerix/identity-tenancy';}],
  ['manifest hash', s => {s.manifestSha256 = '0'.repeat(64);}],
  ['lock hash', s => {s.lockSha256 = '0'.repeat(64);}],
  ['role', s => {s.manifest.contracts[0].role = 'producer';}],
  ['selection', s => {s.manifest.contracts[0].pointers = [];}],
  ['root omitted', s => s.manifest.contracts.pop()],
  ['source pin', s => {s.lock.entries[0].commit = foundationBase;}],
  ['source hash', s => {s.lock.entries[0].files[0].sha256 = '0'.repeat(64);}],
  ['version', s => {s.lock.entries[0].version = 'v99';}],
  ['runtime copy', s => s.manifest.assets.push({purpose: 'runtime'})],
]) test('J published lifecycle still rejects admitted content drift: ' + name, () => {
  const changed = publishedFixture(); mutate(changed);
  assert.throws(() => validateFoundationSnapshot(changed), /J_VALIDATION_SNAPSHOT/);
});

test('J publication uses the existing mandatory local provenance comparison without trusting a state label', () => {
  const published = publishedFixture(), reads = [];
  const readPublished = revision => {
    reads.push(revision);
    assert.equal(revision, published.sourceCommit);
    return structuredClone(published);
  };
  verifyLocalSnapshot(snapshot, published, readPublished);
  assert.deepEqual(reads, [published.sourceCommit]);
  // A later checkout keeps exact admitted metadata; it cannot replace the source revision.
  verifyLocalSnapshot({...snapshot, sourceCommit: 'b'.repeat(40)}, published, readPublished);
  assert.deepEqual(reads, [published.sourceCommit, published.sourceCommit]);
  assert.throws(() => verifyLocalSnapshot(snapshot, published, () => {
    throw new Error('Synthetic Git source unavailable');
  }), /Synthetic Git source unavailable/);
  for (const mutate of [s => {s.sourceCommit = 'b'.repeat(40);},
    s => {s.manifestSha256 = '0'.repeat(64);}, s => {s.lock.entries[0].commit = foundationBase;},
    s => {delete s.manifest;}, s => {delete s.lock;}]) {
    const wrongSource = structuredClone(published); mutate(wrongSource);
    assert.throws(() => verifyLocalSnapshot(snapshot, published, () => wrongSource), /Published consumer provenance drift/);
  }
  assert.equal(snapshot.publication, 'local-candidate');
});

test('H/I/renewal recognize current coverage, retain the original registry and reject arbitrary changes', () => {
  const original = JSON.parse(source('registry/contracts.json'));
  for (const value of [registry, original]) {
    assert.equal(validateRenewalRegistry(value).admitted, 4);
    assert.equal(validateIdentityAdmission(value).admitted, 6);
    assert.equal(validateHistoryRegistry(value).admitted, 24);
  }
  for (const validate of [validateRenewalRegistry, validateIdentityAdmission, validateHistoryRegistry]) {
    for (const mutate of [r => r.requiredConsumers.push('unapproved'), r => r.contracts.pop(),
      r => {r.contracts[0].sha256 = '0'.repeat(64);}, r => {r.coverage = 'unapproved';}]) {
      const changed = structuredClone(registry); mutate(changed); assert.throws(() => validate(changed));
    }
    const withoutDecision = structuredClone(original); withoutDecision.requiredConsumers.push('catalog-pricing');
    assert.throws(() => validate(withoutDecision));
  }
  assert.equal(runtimeRegistryView(registry).coverage, foundationCoverage);
});

// M evolves exactly these three files; every other J comparison stays unchanged.
// Both the pre-M bytes and the reviewed candidate are immutable Git sources.
const mBase = gitReader(root, 'ff393889f32426d3674a92ae0bd4a30b50077d18');
const mReviewed = gitReader(root, 'bb961b862749775fabaaea3b242f6336f1489eec');
const profileV1Gate = '    - node scripts/identity/validate-catalog-workload-profiles-v1.mjs\n';
const profileV2Gate = '    - node scripts/identity/validate-catalog-workload-profiles-v2.mjs\n';
const mReadmeSuffix = '# F1-08M — Sucesor candidato de perfiles H1A\n\n' +
  '[Política v2](http/shared/v2/identity-catalog-workload-profiles-v2.json) y [vectores](fixtures/catalog-workload/v2/catalog-workload-profiles-v2-vectors.json) conservan las cinco asignaciones anteriores y agregan `catalog-pricing.history-recovery` → `catalog-pricing` / `catalog-pricing.history-recovery`, separado del cliente R3 `catalog-pricing.catalog-recovery`. La política v1, sus bytes, fixtures, admisión y pins permanecen inmutables. [Gate y tests externos](../scripts/identity/validate-catalog-workload-profiles-v2.mjs) prueban aislamiento y preservación; CI ejecuta ambos gates v1/v2. Es sucesor candidato: no cambia locks/admisiones ni autoriza configurar el secreto en producción o consumirlo fuera del alcance aprobado.\n';
const mExpected = new Map([
  ['.gitlab-ci.yml', mBase('.gitlab-ci.yml').toString('utf8').replace(profileV1Gate, profileV1Gate + profileV2Gate)],
  ['identity/README.md', mBase('identity/README.md').toString('utf8') + mReadmeSuffix],
  ['test/identity/candidate-preservation.test.mjs', mReviewed('test/identity/candidate-preservation.test.mjs').toString('utf8')],
]);
function verifyPreservedFile(file, content) {
  const expected = mExpected.has(file) ? mExpected.get(file) : source(file).toString('utf8');
  // Report only the path on failure rather than dumping an entire CI document.
  assert(content === expected, 'J_PRESERVATION: ' + file);
}

test('J accepts only the exact reviewed M evolution from unchanged immutable baselines', () => {
  const ci = mBase('.gitlab-ci.yml').toString('utf8');
  assert.equal(ci.split(profileV1Gate).length, 2, 'one original v1 gate');
  assert(!ci.includes(profileV2Gate), 'no successor in the original CI');
  for (const [file, expected] of mExpected) {
    assert(source(file).equals(mBase(file)), 'J and M baseline bytes: ' + file);
    assert(mReviewed(file).toString('utf8') === expected, 'reviewed M bytes: ' + file);
    verifyPreservedFile(file, expected);
  }
});

for (const [name, file, mutate] of [
  ['duplicate v2 gate', '.gitlab-ci.yml', text => text.replace(profileV2Gate, profileV2Gate + profileV2Gate)],
  ['displaced v2 gate', '.gitlab-ci.yml', text => text.replace(profileV2Gate, '') + profileV2Gate],
  ['unrelated CI change', '.gitlab-ci.yml', text => text.replace('interruptible: true', 'interruptible: false')],
  ['changed prior README', 'identity/README.md', text => 'unapproved\n' + text],
  ['changed README suffix', 'identity/README.md', text => text.replace(mReadmeSuffix, mReadmeSuffix.replace('cinco asignaciones', 'seis asignaciones'))],
  ['duplicated README suffix', 'identity/README.md', text => text + mReadmeSuffix],
  ['additional preservation-test change', 'test/identity/candidate-preservation.test.mjs', text => text + '\n// unapproved\n'],
]) test('J rejects M preservation drift: ' + name, () => {
  const original = mExpected.get(file), changed = mutate(original);
  assert.notEqual(changed, original, 'negative must change the reviewed bytes');
  assert.throws(() => verifyPreservedFile(file, changed), /J_PRESERVATION/);
});

test('J rejects changes to files outside the three reviewed M evolutions', () => {
  const file = 'package.json';
  assert(!mExpected.has(file));
  assert.throws(() => verifyPreservedFile(file, source(file).toString('utf8') + '\n'), /J_PRESERVATION/);
});

test('J preserves every other published file, including all transports, tools, CI and the four consumer exports', () => {
  const changed = new Set(['scripts/catalog/catalog-foundation-v1-registry.mjs', 'test/architecture/catalog-foundation.test.mjs', 'registry/consumers/catalog-pricing.json', 'registry/contracts.json', 'registry/consumers/index.json', 'registry/README.md',
    'scripts/identity/catalog-recovery-renewal-v2-registry.mjs',
    'test/architecture/identity-producer-admission.test.mjs',
    'test/architecture/catalog-admission.test.mjs', 'test/identity/catalog-admission-v1.test.mjs',
    'test/identity/catalog-recovery-renewal-v2.test.mjs', 'test/identity/catalog-recovery-renewal-admission-v2.test.mjs']);
  // K's validator gains only the separately checked, closed L projection. The
  // original J registry/descriptors and other consumer exports remain exact.
  changed.add('scripts/catalog/catalog-runtime-v1-registry.mjs');
  // N's tooling/CI/documentation evolution is separately and narrowly checked
  // against the immutable post-M source, including adversarial preservation cases.
  for (const file of ['.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'catalog/README.md']) changed.add(file);
  // N checks the exact live adaptation; the immutable M proof above stays intact.
  changed.add('test/identity/candidate-preservation.test.mjs');
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', foundationBase], {cwd: root, encoding: 'utf8'}).trim().split('\n');
  for (const file of files.filter(file => !changed.has(file))) {
    verifyPreservedFile(file, fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'));
  }
});
