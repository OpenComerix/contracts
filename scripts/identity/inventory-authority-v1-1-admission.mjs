import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, resolveSelection } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { consumerFiles, inventoryConsumerReadView, inventoryConsumerHistoricalFile } from './inventory-authority-consumer-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const admissionBase = '0bff3a242784599c400875f37e1c2d3ef64f4538';
export const admissionSource = gitReader(root, admissionBase);
export const admissionId = 'identity.inventory-authority.http.v1-1';
export const admissionPath = 'identity/http/private/v1/identity-inventory-authority-v1-1.yaml';
export const admissionHash = '3044f3772481bd5fcb8d1b46dd5a0c7db491caa31c48a0174c78001074e10d21';
const registryPath = 'registry/contracts.json';
const testPath = 'test/identity/inventory-authority-v1-1.test.mjs';
export const admissionFiles = Object.freeze([
  registryPath, 'identity/index.json', 'identity/README.md', 'registry/README.md',
  'scripts/identity/inventory-authority-v1-1.mjs', testPath,
  'scripts/identity/inventory-authority-v1-1-admission.mjs',
  'test/identity/inventory-authority-v1-1-admission.test.mjs',
  ...consumerFiles,
]);
export const admissionRead = inventoryConsumerReadView();
const normalize = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
const digest = bytes => createHash('sha256').update(normalize(bytes)).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const previous = () => JSON.parse(admissionSource(registryPath));

export function admissionRow() {
  const original = previous().contracts.find(row => row.id === 'identity.inventory-authority.http.v1');
  assert.equal(digest(admissionSource(admissionPath)), admissionHash, 'IA11A_SOURCE_HASH');
  return { ...original, id: admissionId,
    purpose: 'F1-11A selected admission of published inventory authority HTTP 1.1.0; no consumer migration or runtime activation.',
    reasonForChange: 'Admit the reviewed published source with 400 identity_invalid_request and exact SHA/ref CI verified.',
    version: '1.1.0', path: admissionPath, commit: admissionBase, tag: null, tagObject: null,
    sha256: admissionHash };
}
export function admittedRegistry() {
  const before = previous();
  assert.equal(before.contracts.length, 199, 'IA11A_BASE_ROOTS');
  assert.equal(before.planned.filter(row => row.id === admissionId).length, 1, 'IA11A_BASE_INTENTION');
  return { ...before, contracts: [...before.contracts, admissionRow()],
    planned: before.planned.filter(row => row.id !== admissionId) };
}
export const admissionSuffix = '\n## F1-11A — Admisión seleccionada HTTP 1.1.0\n\n' +
  'La selección local `identity.inventory-authority.http.v1-1` admite únicamente el HTTP 1.1.0 desde contracts `' + admissionBase + '`, con [CI fuente Passed, 22/22](https://gitlab.com/opencomerix/contracts/-/pipelines/2993915529) verificada por SHA/ref exactos. Fija las operaciones `createInventoryDelegation` y `checkInventoryAuthorization`, el hash Git y cuatro URI mappings del cierre de cinco archivos. Conserva las 199 raíces anteriores, 236 artefactos preservados y cinco consumidores/locks/pins; total 200 raíces y dos planned previos. Las secciones fuente anteriores describen su snapshot publicado.\n\n';
const identitySuffix = admissionSuffix +
  'El [verificador de admisión](../scripts/identity/inventory-authority-v1-1-admission.mjs) y sus [pruebas externas](../test/identity/inventory-authority-v1-1-admission.test.mjs) comprueban la transición completa antes de proyectar metadata para la preservación histórica. Gate: `node --test --test-reporter=tap test/identity/inventory-authority-v1-1*.test.mjs`. Transporte y paquete fuente, CI, dependencias y consumidores permanecen intactos. Candidato pendiente de auditoría/publicación; no acredita runtime, HTTP ejecutado, ES256 o PostgreSQL ni autoriza migrar consumidores.\n';
const registrySuffix = admissionSuffix +
  'El índice Identity deriva exclusivamente este alta. El [gate de admisión](../scripts/identity/inventory-authority-v1-1-admission.mjs) rechaza admisiones parciales, drift y consumo agregado; preserva los negativos de los controles históricos. [Mapa y pruebas](../identity/README.md#f1-11a--admisión-seleccionada-http-110). Candidato pendiente de auditoría/publicación; no migra consumidores ni habilita runtime.\n';
export function admissionMetadata() {
  const registry = admittedRegistry();
  return new Map([
    [registryPath, encode(registry)],
    ['identity/index.json', encode(domainIndex(registry, 'identity'))],
    ['identity/README.md', Buffer.from(normalize(admissionSource('identity/README.md')) + identitySuffix)],
    ['registry/README.md', Buffer.from(normalize(admissionSource('registry/README.md')) + registrySuffix)],
    [testPath, Buffer.from(normalize(admissionSource(testPath)).replace(
      "test('only the exact derived intention and two existing Inventory CI scripts change'",
      "test('historical source view retains the exact intention and two Inventory CI scripts'"))],
  ]);
}
export function validateAdmission(read = admissionRead) {
  const expected = admissionMetadata();
  for (const [file, bytes] of expected)
    assert.equal(normalize(read(file)), normalize(bytes), 'IA11A_EXACT_METADATA:' + file);
  const before = previous(), row = admissionRow(), registry = admittedRegistry();
  const closure = resolveSelection(admissionSource, row,
    { version: row.version, operations: row.operations, pointers: [] }, registry);
  assert.deepEqual(closure.files.map(file => file.path).sort(),
    [admissionPath, ...row.uriMappings.map(mapping => mapping.path)].sort(), 'IA11A_CLOSURE');
  for (const file of closure.files)
    assert.equal(digest(read(file.path)), file.sha256, 'IA11A_CLOSURE_BYTES:' + file.path);
  for (const entry of [...before.contracts, ...before.preservedFiles])
    assert.equal(digest(read(entry.path)), digest(admissionSource(entry.path)), 'IA11A_PRESERVED:' + entry.path);
  for (const file of ['package.json', 'pnpm-lock.yaml', '.gitlab-ci.yml', 'registry/consumers/index.json',
    'identity/fixtures/inventory-authority/v1/http-1-1-package.json',
    ...before.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')])
    assert.equal(digest(read(file)), digest(admissionSource(file)), 'IA11A_UNCHANGED:' + file);
  return { admitted: 1, roots: 200, prior_roots: 199, preserved: 236, planned: 2,
    operations: 2, closure_files: closure.files.length, runtime_demonstrated: false };
}

// First validate the caller's entire transition. Only exact reviewed metadata
// can then be projected; mutated caller bytes remain visible to old guards.
export function admissionReadView(read = admissionRead) {
  let checked = false;
  const expected = admissionMetadata();
  return file => {
    if (!checked) { validateAdmission(read); checked = true; }
    const bytes = read(file), target = expected.get(file);
    return target && normalize(bytes) === normalize(target) ? admissionSource(file) : bytes;
  };
}
const currentView = admissionReadView();
const historicalMetadata = admissionMetadata();
export function admissionHistoricalFile(file, bytes) {
  bytes = inventoryConsumerHistoricalFile(file, bytes);
  const reviewed = currentView(file);
  const expected = historicalMetadata.get(file);
  return expected && normalize(bytes) === normalize(expected) ? reviewed : bytes;
}
export function admissionHistoricalRegistry(registry) {
  if (!isDeepStrictEqual(registry, admittedRegistry())) return registry;
  currentView(registryPath);
  return previous();
}
