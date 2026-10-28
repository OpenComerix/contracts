import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock } from '../../tools/architecture/graph.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';
import { salesHistoricalFile } from '../sales/inventory-step-consumer-v1.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const consumerBase = '050ccf40c4ead96fe491715ca30232652744132a';
export const ownerBase = 'dac3474f062a4262e89ead57f59f777ebe646b61';
export const publishedOwnerCommit = 'ba13dcda413d6ee7fd04d30b6365d2a7e4e95f06';
export const consumerSource = gitReader(root, consumerBase);
export const consumerPath = 'registry/consumers/identity-tenancy.json';
export const producerTestPath = 'test/architecture/identity-producer-admission.test.mjs';
export const consumerFiles = Object.freeze([
  consumerPath, 'scripts/identity/inventory-authority-consumer-v1.mjs',
  'test/identity/inventory-authority-consumer-v1.test.mjs', producerTestPath,
]);
export const rawConsumerRead = file => salesHistoricalFile(file, readRepositoryFile(file));
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const baseline = file => JSON.parse(consumerSource(file));
const httpId = 'identity.inventory-authority.http.v1-1';
const purpose = 'F1-11A Identity producer: Inventory human authority only; preserve existing pins and catalog-only/H2 behavior.';
export function producerTestBytes() {
  const original = text(consumerSource(producerTestPath));
  const prior = 'const current=consumerSnapshotView(readJSON(root,file)),registry=';
  assert.equal(original.split(prior).length, 2, 'IA11C_TEST_BASE');
  return Buffer.from("import { inventoryConsumerReadView } from '../../scripts/identity/inventory-authority-consumer-v1.mjs';\n" +
    original.replace(prior, 'const current=consumerSnapshotView(JSON.parse(inventoryConsumerReadView()(file))),registry='));
}
let expected;
export function inventoryConsumerSnapshot() {
  if (!expected) {
    const previous = baseline(consumerPath), registry = baseline('registry/contracts.json');
    assert.equal(previous.manifest.contracts.length, 32, 'IA11C_PRIOR_SELECTIONS');
    const selection = [
      [httpId, 'producer', ['createInventoryDelegation', 'checkInventoryAuthorization'], []],
      ['identity.inventory-authority.schema.v1', 'validation', [], ['']],
      ['identity.inventory-authority.policy.v1', 'semantic-owner', [],
        ['/policy_version', '/owner', '/extends_without_changing', '/profiles/0', '/permissions', '/issuance', '/template']],
      ['common.error-catalog.v9', 'validation', [], ['']],
    ].map(([id, role, operations, pointers]) => {
      const descriptor = registry.contracts.find(row => row.id === id);
      assert.equal(descriptor?.status, 'active', 'IA11C_ADMITTED_SOURCE');
      assert.equal(descriptor.commit, id === httpId ? '0bff3a242784599c400875f37e1c2d3ef64f4538' : '7cd2b548fb909c5eff47d0319c162c498ee68e92', 'IA11C_SOURCE_COMMIT');
      return { id, role, version: descriptor.version, operations, pointers, purpose,
        gates: ['pnpm contracts:metadata', 'pnpm test:all', 'pnpm test:inventory-authority-runtime'] };
    });
    const manifest = { ...previous.manifest, contracts: [...previous.manifest.contracts, ...selection] };
    const lock = makeLock(root, manifest, bytes(manifest), registry, previous.lock.entries);
    assert.deepEqual(lock.entries.slice(0, 32), previous.lock.entries, 'IA11C_PRIOR_PINS');
    expected = { ...previous, publication: 'local-candidate', sourceCommit: ownerBase,
      manifestSha256: sha256(bytes(manifest)), lockSha256: sha256(bytes(lock)), manifest, lock };
  }
  return structuredClone(expected);
}
export function validateInventoryConsumer(snapshot) {
  const candidate = inventoryConsumerSnapshot();
  const expected = snapshot?.publication === 'published'
    ? { ...candidate, publication: 'published', sourceCommit: publishedOwnerCommit }
    : candidate;
  assert(isDeepStrictEqual(snapshot, expected), 'IA11C_EXACT_SNAPSHOT');
  return { service: 'identity-tenancy', prior_preserved: 32, added: 4, selections: 36,
    runtime_demonstrated: false, publication: snapshot.publication };
}
export function verifyPublishedInventoryConsumer(snapshot, readPublished) {
  validateInventoryConsumer(snapshot);
  assert.equal(snapshot.publication, 'published', 'IA11C_PUBLICATION');
  assert.equal(typeof readPublished, 'function', 'IA11C_PUBLISHED_GIT_REQUIRED');
  verifyLocalSnapshot(inventoryConsumerSnapshot(), snapshot, readPublished);
}
export const consumerSuffix = '\n## F1-11A — Selección consumidora Identity para Inventory\n\n' +
  'Selección Identity: HTTP 1.1.0 productor, schema/v9 de validación y política de permisos/perfil `inventory.inventory-authority` como propietario semántico. Conserva las 32 selecciones/pins anteriores y los otros cuatro consumidores; total Identity 36. El [verificador de transición](../scripts/identity/inventory-authority-consumer-v1.mjs) y sus [pruebas](../test/identity/inventory-authority-consumer-v1.test.mjs) comprueban selección/cierre/pins antes de la proyección histórica. No cambia transporte, registro, dependencias ni CI de contracts. El snapshot identifica estado y SHA propietario; published solo admite `'+publishedOwnerCommit+'` con el mismo contenido revisado. La importación canónica verifica Git inmutable; autorización y CI exacta son controles operativos separados y el verificador no infiere runtime.\n';
export function validateInventoryConsumerPackage(read = rawConsumerRead) {
  const snapshot = JSON.parse(read(consumerPath));
  const result = validateInventoryConsumer(snapshot);
  assert.equal(text(read(producerTestPath)), text(producerTestBytes()), 'IA11C_TEST_TRANSITION');
  for (const file of ['identity/README.md', 'registry/README.md'])
    assert.equal(text(read(file)), text(consumerSource(file)) + consumerSuffix, 'IA11C_MAP:' + file);
  for (const file of ['registry/contracts.json', 'identity/index.json', 'registry/consumers/index.json',
    'package.json', 'pnpm-lock.yaml', '.gitlab-ci.yml',
    ...baseline('registry/contracts.json').requiredConsumers.filter(owner => owner !== 'identity-tenancy').map(owner => 'registry/consumers/' + owner + '.json')])
    assert.equal(text(read(file)), text(consumerSource(file)), 'IA11C_UNCHANGED:' + file);
  for (const entry of snapshot.lock.entries.slice(32)) for (const file of entry.files)
    assert.equal(sha256(Buffer.from(text(read(file.path)))), file.sha256, 'IA11C_TRANSPORT:' + file.path);
  return result;
}
// Preserve each historical caller's input: project only the complete exact
// reviewed transition, never sanitize or repair mutated metadata.
export function inventoryConsumerReadView(read = rawConsumerRead) {
  let checked = false;
  return file => {
    const content = read(file);
    const ownSnapshot = file === consumerPath && JSON.parse(content).manifest?.contracts?.some(row => row.id === httpId);
    const ownMap = ['identity/README.md', 'registry/README.md'].includes(file) && text(content).includes('\n## F1-11A — Selección consumidora Identity');
    const ownTest = file === producerTestPath && text(content).includes('inventoryConsumerReadView');
    if (ownSnapshot || ownMap || ownTest) {
      if (!checked) { validateInventoryConsumerPackage(read); checked = true; }
      if (ownSnapshot) validateInventoryConsumer(JSON.parse(content));
      else if (ownTest) assert.equal(text(content), text(producerTestBytes()), 'IA11C_TEST_TRANSITION');
      else assert.equal(text(content), text(consumerSource(file)) + consumerSuffix, 'IA11C_MAP:' + file);
      return consumerSource(file);
    }
    return content;
  };
}
const currentView = inventoryConsumerReadView();
export function inventoryConsumerHistoricalFile(file, content) {
  content = salesHistoricalFile(file, content);
  if (file !== consumerPath && !['identity/README.md', 'registry/README.md', producerTestPath].includes(file)) return content;
  const actual = rawConsumerRead(file);
  const historical = currentView(file);
  return text(content) === text(actual) ? historical : content;
}
