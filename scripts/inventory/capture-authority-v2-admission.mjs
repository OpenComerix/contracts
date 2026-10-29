import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { gitReader, resolveSelection } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';
import { captureConsumerFiles, withCaptureConsumers, captureConsumerReadView, captureConsumerHistoricalFile, captureConsumerHistoricalRegistry } from './capture-consumers-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const admissionBase = '49b32eb7a7e8694a68a0bc9d58252c5d68dfab13';
export const sourceCommit = 'f08aae6f1fdd062c36e09853d24e0eb8395f9e88';
export const admissionSource = gitReader(root, admissionBase);
const transportSource = gitReader(root, sourceCommit);
const registryPath = 'registry/contracts.json';
const verifierPath = 'scripts/inventory/capture-authority-v2.mjs';
const runnerPath = 'scripts/inventory/run-capture-authority-v2.mjs';
const modulePath = 'scripts/inventory/capture-authority-v2-admission.mjs';
const testPath = 'test/inventory/capture-authority-v2-admission.test.mjs';
export const httpPath = 'inventory/http/private/v2/inventory-catalog-capture-authority-v2.yaml';
export const schemaPath = 'inventory/http/shared/v2/inventory-capture-authority-v2.schema.json';
export const admissionIds = Object.freeze([
  'inventory.catalog-capture-authority.http.v2', 'inventory.catalog-capture-authority.schema.v2',
]);
export const admissionFiles = Object.freeze([
  registryPath, 'inventory/index.json', 'inventory/README.md', 'registry/README.md',
  verifierPath, modulePath, testPath, ...captureConsumerFiles,
]);
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let baseCache, rowsCache, registryCache;
const before = () => baseCache ??= JSON.parse(admissionSource(registryPath));
const mapping = file => ({ uri: 'https://contracts.opencomerix.example/' + file, path: file });

export function admissionRows() {
  if (rowsCache) return structuredClone(rowsCache);
  const previous = before();
  rowsCache = [
    ['inventory.http.private.v1', admissionIds[0], httpPath, '2.0.0',
      ['authorizeInventoryCatalogCapture'], [schemaPath, 'common/http/shared/v3/problem-details-v3.schema.json']],
    ['inventory.capture-authority.v1', admissionIds[1], schemaPath, 'v2', [], [schemaPath]],
  ].map(([originalId, id, file, version, operations, mappings]) => ({
    ...previous.contracts.find(row => row.id === originalId), id, version, path: file,
    capability: 'inventory.catalog-capture-authority',
    purpose: 'F1-11B selected admission of exact physical capture authority v2; no consumer migration or runtime activation.',
    reasonForChange: 'Admit reviewed published full-body capture_fingerprint binding; source bytes preserved through GitHub migration and full CI verified.',
    commit: sourceCommit, tag: null, tagObject: null, sha256: hash(transportSource(file)),
    operations, uriMappings: mappings.map(mapping),
  }));
  return structuredClone(rowsCache);
}
function registrySnapshot() {
  if (registryCache) return registryCache;
  const previous = before();
  assert.equal(previous.contracts.length, 200, 'IC2A_BASE_ROOTS');
  assert.equal(previous.preservedFiles.length, 236, 'IC2A_BASE_PRESERVED');
  assert.deepEqual(previous.planned.slice(-2).map(row => row.id), admissionIds, 'IC2A_BASE_INTENTIONS');
  registryCache = { ...previous, contracts: [...previous.contracts, ...admissionRows()],
    planned: previous.planned.filter(row => !admissionIds.includes(row.id)) };
  return registryCache;
}
export const admittedRegistry = () => structuredClone(registrySnapshot());

const commonSuffix = '\n## F1-11B — Admisión seleccionada de preparación física v2\n\n' +
  'Se admiten únicamente `inventory.catalog-capture-authority.http.v2` (2.0.0, operación `authorizeInventoryCatalogCapture`) y `inventory.catalog-capture-authority.schema.v2` (v2), desde la fuente publicada `' + sourceCommit + '`. Sus bytes Git y cierre se conservan en `' + admissionBase + '`, con [CI completa Passed](https://github.com/opencomerix/contracts/actions/runs/40792015065) por SHA/ref exactos. Se fijan hashes y mappings mínimos; 202 raíces, 236 artefactos preservados, dos intenciones previas y seis consumidores/pins intactos. Las secciones fuente anteriores describen su snapshot histórico.\n\n';
const inventorySuffix = commonSuffix +
  '[Verificador de admisión](../scripts/inventory/capture-authority-v2-admission.mjs) y [pruebas externas](../test/inventory/capture-authority-v2-admission.test.mjs): `node --test --test-reporter=tap test/inventory/capture-authority-v2*.test.mjs`. La transición completa se valida antes de proyectar exclusivamente metadata exacta hacia los controles fuente; alteraciones u omisiones posteriores siguen rechazadas. Candidato pendiente de auditoría/publicación, sin migración consumidora ni runtime; no acredita SQL, ES256, preparación RAM o integración Identity–Inventory–Catalog.\n';
const registrySuffix = commonSuffix +
  'Solo se deriva el índice Inventory y se retiran las dos intenciones seleccionadas. El [gate de admisión](../scripts/inventory/capture-authority-v2-admission.mjs) preserva las admisiones anteriores, CI y dependencias; rechaza admisiones parciales, cierre/procedencia alterados y consumidores agregados. [Mapa Inventory](../inventory/README.md#f1-11b--admisión-seleccionada-de-preparación-física-v2). Candidato pendiente de auditoría/publicación; consumo y runtime requieren sus cortes propios.\n';

// The bridge is derived from the published implementation; no old guard is weakened.
export function sourceVerifierBytes() {
  let value = text(admissionSource(verifierPath));
  const replaceOnce = (anchor, replacement) => {
    assert.equal(value.split(anchor).length, 2, 'IC2A_BRIDGE_ANCHOR:' + anchor);
    value = value.replace(anchor, replacement);
  };
  replaceOnce("import { prepareToolingCI } from '../ci/pipeline-v1.mjs';",
    "import { prepareToolingCI } from '../ci/pipeline-v1.mjs';\nimport { admissionFiles, withAdmissionDelta, admissionHistoricalFile, admissionHistoricalRegistry } from './capture-authority-v2-admission.mjs';");
  replaceOnce('...Object.keys(retirementHashes)]);', '...Object.keys(retirementHashes), ...admissionFiles]);');
  replaceOnce('export function validateCaptureSource(read = actual) {',
    'export function validateCaptureSource(rawRead = actual) {\n  return withAdmissionDelta(rawRead, read => {');
  replaceOnce('  return result;\n}', '  return result;\n  });\n}');
  replaceOnce('export function captureHistoricalFile(file, bytes) {',
    'export function captureHistoricalFile(file, bytes) {\n  bytes = admissionHistoricalFile(file, bytes);');
  replaceOnce('export function captureHistoricalRegistry(value) {',
    'export function captureHistoricalRegistry(value) {\n  value = admissionHistoricalRegistry(value);');
  return Buffer.from(value);
}
export function admissionMetadata() {
  const registry = admittedRegistry();
  return new Map([
    [registryPath, encode(registry)],
    ['inventory/index.json', encode(domainIndex(registry, 'inventory'))],
    ['inventory/README.md', Buffer.from(text(admissionSource('inventory/README.md')) + inventorySuffix)],
    ['registry/README.md', Buffer.from(text(admissionSource('registry/README.md')) + registrySuffix)],
    [verifierPath, sourceVerifierBytes()],
  ]);
}

// Only immutable expectations are cached. Every public validation/projection rereads
// the live checkout, including after an earlier successful call in this process.
let expectedCache;
const expected = () => expectedCache ??= admissionMetadata();
let inputsCache;
function immutableInputs() {
  if (inputsCache) return inputsCache;
  const inputs = new Map();
  const add = (file, bytes, code) => {
    if (!inputs.has(file)) inputs.set(file, { value: text(bytes), code });
  };
  for (const [file, bytes] of expected()) add(file, bytes, 'IC2A_EXACT_METADATA');
  const previous = before(), registry = registrySnapshot();
  const closureFiles = new Set();
  for (const row of admissionRows()) {
    assert.equal(hash(admissionSource(row.path)), row.sha256, 'IC2A_MIGRATED_SOURCE:' + row.path);
    const selection = { version: row.version, operations: row.operations, pointers: row.operations.length ? [] : [''] };
    const closure = resolveSelection(transportSource, row, selection, registry);
    assert.deepEqual(closure.files.map(file => file.path).sort(),
      [...new Set([row.path, ...row.uriMappings.map(item => item.path)])].sort(), 'IC2A_MINIMAL_CLOSURE:' + row.id);
    for (const file of closure.files) {
      closureFiles.add(file.path);
      assert.equal(hash(admissionSource(file.path)), file.sha256, 'IC2A_MIGRATED_CLOSURE:' + file.path);
      add(file.path, transportSource(file.path), 'IC2A_CLOSURE_BYTES');
    }
  }
  for (const entry of [...previous.contracts, ...previous.preservedFiles])
    add(entry.path, admissionSource(entry.path), 'IC2A_PRESERVED');
  for (const file of ['package.json', 'pnpm-lock.yaml', '.gitignore', '.github/workflows/ci.yml',
    'registry/consumers/index.json', 'inventory/fixtures/catalog-capture-authority/v2/binding.json',
    runnerPath, 'test/inventory/capture-authority-v2.test.mjs',
    'scripts/sales/inventory-step-consumer-v1.mjs', 'scripts/ci/retired-gitlab-v1.mjs',
    ...previous.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')])
    add(file, admissionSource(file), 'IC2A_UNCHANGED');
  // Publish the immutable expectations only after the entire Git closure is checked.
  inputsCache = { inputs, result: { admitted: 2, roots: 202, priorRoots: 200, preserved: 236, planned: 2,
    consumers: 6, closureFiles: closureFiles.size, runtimeDemonstrated: false } };
  return inputsCache;
}
export function validateAdmission(rawRead = readRepositoryFile) {
  return withCaptureConsumers(rawRead, read => {
  const { inputs, result } = immutableInputs();
  for (const [file, { value, code }] of inputs)
    assert.equal(text(read(file)), value, code + ':' + file);
  for (const file of [modulePath, testPath]) assert(read(file).length > 0, 'IC2A_TOOL_MISSING:' + file);
  return { ...result };
  });
}

// Compose the exact admission delta with the complete existing source guard.
// That guard still rereads published sources, closures, consumers and CI; the
// independent validateAdmission entry above continues to check all of them too.
// No live reads or successful checks survive this synchronous invocation.
export function withAdmissionDelta(rawRead, verifySource) {
  return withCaptureConsumers(rawRead, read => {
  const { inputs } = immutableInputs(); // Immutable source closure, never the checkout.
  for (const [file, bytes] of expected())
    assert.equal(text(read(file)), text(bytes), 'IC2A_EXACT_METADATA:' + file);
  // The legacy source guard checks this tool's presence, not its exact bytes.
  assert.equal(text(read(runnerPath)), inputs.get(runnerPath).value, 'IC2A_UNCHANGED:' + runnerPath);
  for (const file of [modulePath, testPath]) assert(read(file).length > 0, 'IC2A_TOOL_MISSING:' + file);
  return verifySource(file => {
    const bytes = read(file), target = expected().get(file);
    return target && text(bytes) === text(target) ? admissionSource(file) : bytes;
  });
  });
}

// Caller mutations are passed through; projection is not a repair mechanism.
// Reusing a view never retains proof that its live reader is still valid.
export function admissionReadView(read = readRepositoryFile) {
  const view = captureConsumerReadView(read);
  return file => {
    const target = expected().get(file);
    if (target) validateAdmission(read);
    const bytes = view(file);
    if (!target || text(bytes) !== text(target)) return bytes;
    return admissionSource(file);
  };
}
export function admissionHistoricalFile(file, bytes) {
  bytes = captureConsumerHistoricalFile(file, bytes);
  const target = expected().get(file);
  if (!target || text(bytes) !== text(target)) return bytes;
  validateAdmission();
  return admissionSource(file);
}
export function admissionHistoricalRegistry(registry) {
  registry = captureConsumerHistoricalRegistry(registry);
  if (!isDeepStrictEqual(registry, registrySnapshot())) return registry;
  validateAdmission();
  return structuredClone(before());
}
