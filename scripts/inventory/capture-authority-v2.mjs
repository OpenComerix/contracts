import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { gitReader } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { fingerprint } from './authority-v1.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const base = 'e9ab2798c9f0b581ff44c64137acfc8ff1e5e5a0';
const reader = gitReader(root, base), immutable = new Map();
export const source = file => {
  if (!immutable.has(file)) immutable.set(file, reader(file));
  return Buffer.from(immutable.get(file));
};
export const actual = file => fs.readFileSync(path.join(root, file));
export const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
export const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const previous = file => JSON.parse(source(file));
export const httpPath = 'inventory/http/private/v2/inventory-catalog-capture-authority-v2.yaml';
export const schemaPath = 'inventory/http/shared/v2/inventory-capture-authority-v2.schema.json';
export const fixturePath = 'inventory/fixtures/catalog-capture-authority/v2/binding.json';
export const verifierPath = 'scripts/inventory/capture-authority-v2.mjs';
export const runnerPath = 'scripts/inventory/run-capture-authority-v2.mjs';
export const testPath = 'test/inventory/capture-authority-v2.test.mjs';
export const bridgePath = 'scripts/sales/inventory-step-consumer-v1.mjs';
export const sourceFiles = Object.freeze([httpPath, schemaPath, fixturePath, verifierPath,
  runnerPath, testPath, bridgePath, 'registry/contracts.json', 'inventory/index.json',
  'inventory/README.md', 'registry/README.md', '.gitlab-ci.yml']);
const route = '/internal/inventory/catalog-capture-authorizations';
export const intentions = Object.freeze([
  ['inventory.catalog-capture-authority.http.v2', httpPath],
  ['inventory.catalog-capture-authority.schema.v2', schemaPath],
].map(([id, file]) => ({ id, domain: 'inventory', owner: 'inventory', materializeIn: 'F1-11B', status: 'planned',
  constraint: 'Candidate source ' + file + ' only; exact capture body binding using capture_fingerprint (JCS/SHA-256). No functional admission, consumer migration or runtime; preserve published v1 and its closure.' })));

export function successorSchema() {
  const schema = previous('inventory/http/shared/v1/inventory-capture-authority-v1.schema.json');
  schema.$id = 'https://contracts.opencomerix.example/' + schemaPath;
  schema.title = 'Inventory preparation verification v2; exact physical capture body binding';
  for (const name of ['Request', 'Decision']) {
    schema.$defs[name].required.push('capture_fingerprint');
    schema.$defs[name].properties.capture_fingerprint = {
      type: 'string', pattern: '^[0-9a-f]{64}$',
      description: 'Lowercase SHA-256 of RFC 8785 JCS UTF-8 of the complete validated CaptureRequest sent to Catalog, including organization_id, operation_id, preparation_id, request_hash and ordered lines. No normalization, omitted fields or excluded hash fields. Different from the original human inventory-request-v1 request_hash. Catalog computes this value; Inventory compares it with its own preparation before rechecking the original human authority. Decision echoes it unchanged.',
      'x-data-classification': { sensitivity: 'RESTRICTED', categories: ['SECURITY', 'OPERATIONAL'] },
      'x-data-purpose': 'bound short-lived physical capture verification',
      'x-log-policy': 'no payload, field values or raw digest; bounded diagnostic codes only',
      'x-retention-profile': 'ephemeral_authority',
    };
  }
  return schema;
}
export function successorHttp() {
  const document = previous('inventory/http/private/v1/inventory-internal-v1.yaml');
  document.info = { ...document.info, title: 'Inventory physical catalogue capture preparation authority v2', version: '2.0.0',
    description: 'F1-11B candidate successor for authorizeInventoryCatalogCapture only. Adds exact capture_fingerprint binding; no functional admission or runtime. Published v1 and its closure remain unchanged.' };
  const operation = structuredClone(document.paths[route]);
  document.paths = { [route]: JSON.parse(JSON.stringify(operation).replaceAll(
    '../../shared/v1/inventory-capture-authority-v1.schema.json', '../../shared/v2/inventory-capture-authority-v2.schema.json')) };
  document.paths[route].post.description += ' Catalog must validate the complete physical CaptureRequest and compute capture_fingerprint as lowercase SHA-256 of RFC 8785 JCS UTF-8 of that entire body, without normalization or excluding any field. Inventory compares tenant, operation, preparation, original human request_hash, target and capture_fingerprint with its own preparation, then revalidates the original human authority. A changed line, quantity, reference, version or order fails closed; never trust a caller-supplied fingerprint without recomputation. Decision echoes the exact fingerprint and binding. This does not change inventory-request-v1 request_hash. All existing deadlines, RAM-only delegation and no-stock-effect rules remain.';
  document.components.securitySchemes = { workload: document.components.securitySchemes.workload };
  return document;
}
export function successorRegistry() {
  const registry = previous('registry/contracts.json');
  registry.planned.push(...structuredClone(intentions));
  return registry;
}
export const captureFingerprint = value => fingerprint(value);
export function bindingFixture() {
  const capture = structuredClone(previous('catalog/fixtures/inventory-capture/v1/capture.json').request);
  capture.lines.push({ ...capture.lines[0], line_id: '019a0000-0000-7000-8000-000000000031', quantity: '3' });
  const { organization_id, operation_id, preparation_id, request_hash } = capture;
  const query = { organization_id, operation_id, preparation_id, request_hash, target: 'catalog-pricing.inventory-capture', capture_fingerprint: captureFingerprint(capture) };
  const decision = { organization_id, operation_id, preparation_id, request_hash, authorized: true,
    caller: 'catalog-pricing', audience: 'inventory.catalog-capture-authority', checked_at: '2026-10-28T12:00:00Z',
    preparation_expires_at: '2026-10-28T12:00:59Z', valid_for_ms: 2000, capture_fingerprint: query.capture_fingerprint };
  return { capture, query, decision };
}
// Contractual oracle only: does not verify signatures, clocks, Identity or RAM lifecycle.
export function validateCaptureBinding(capture, query, decision) {
  assert.equal(query.target, 'catalog-pricing.inventory-capture', 'IC2_TARGET');
  assert.equal(query.capture_fingerprint, captureFingerprint(capture), 'IC2_CAPTURE_FINGERPRINT');
  for (const key of ['organization_id', 'operation_id', 'preparation_id', 'request_hash']) {
    assert.equal(query[key], capture[key], 'IC2_QUERY_BINDING:' + key);
    assert.equal(decision[key], query[key], 'IC2_DECISION_BINDING:' + key);
  }
  assert.equal(decision.capture_fingerprint, query.capture_fingerprint, 'IC2_DECISION_FINGERPRINT');
  assert.equal(decision.authorized, true, 'IC2_AUTHORIZED');
  assert.equal(decision.caller, 'catalog-pricing', 'IC2_CALLER');
  assert.equal(decision.audience, 'inventory.catalog-capture-authority', 'IC2_AUDIENCE');
}
function insertOnce(value, anchor, addition) {
  assert.equal(value.split(anchor).length, 2, 'IC2_BRIDGE_ANCHOR');
  return value.replace(anchor, anchor + addition);
}
export function bridgeBytes() {
  let value = text(source(bridgePath));
  const anchor = "import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';\n\nexport const root =";
  assert.equal(value.split(anchor).length, 2, 'IC2_BRIDGE_IMPORT');
  value = value.replace(anchor, "import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';\nimport { captureHistoricalFile, captureHistoricalRegistry, sourceFiles } from '../inventory/capture-authority-v2.mjs';\n\nexport const root =");
  value = value.replace('export function validateSalesAdmission(readFile = read) {',
    'export function validateSalesAdmission(rawReadFile = read) {\n  const readFile = file => captureHistoricalFile(file, rawReadFile(file));');
  value = value.replace('export const admissionScope = [...salesChangedPaths,...guardTransitionFiles.filter(file=>!salesChangedPaths.includes(file))];',
    'export const admissionScope = [...new Set([...salesChangedPaths,...guardTransitionFiles.filter(file=>!salesChangedPaths.includes(file)),...sourceFiles])];');
  value = insertOnce(value, 'export function salesHistoricalFile(file, bytes) {', '\n  bytes = captureHistoricalFile(file, bytes);');
  value = insertOnce(value, 'export function salesHistoricalRegistry(value) {', '\n  value = captureHistoricalRegistry(value);');
  return Buffer.from(value);
}
export const readmeSuffix = '\n## F1-11B — Verificación de captura física v2 (candidato)\n\n' +
  '[HTTP privado v2](http/private/v2/inventory-catalog-capture-authority-v2.yaml) y [schema v2](http/shared/v2/inventory-capture-authority-v2.schema.json) agregan `capture_fingerprint` a consulta y decisión de `authorizeInventoryCatalogCapture`. Conservan ruta `/api/v1/internal/inventory/catalog-capture-authorizations`, caller Catalog, audiencia Inventory y plazos previos. Catalog calcula SHA-256 del JCS RFC 8785 del cuerpo completo de captura validado; Inventory compara esa huella con la preparación propia y revalida la autoridad humana original. `request_hash` sigue identificando la solicitud humana, con semántica `inventory-request-v1`. Líneas, cantidades, referencias, versiones y orden quedan ligados sin reutilizar un hash declarado por el caller.\n\n' +
  'Se preservan bytes y admisiones publicados v1. Las dos intenciones nuevas son `planned`: fuente candidata sin admisión, consumidor ni runtime. Preparación <=60 s, delegado exclusivamente RAM durante la solicitud, autoridad fresca <=2000 ms y rechazo tras reinicio/revocación/expiración siguen siendo requisitos runtime pendientes. No acredita SQL, criptografía, stock ni ajustes.\n\n' +
  '[Fixture](fixtures/catalog-capture-authority/v2/binding.json), [verificador](../scripts/inventory/capture-authority-v2.mjs) y [tests](../test/inventory/capture-authority-v2.test.mjs). Gates: `node --test test/inventory/capture-authority-v2.test.mjs`; `node scripts/inventory/run-capture-authority-v2.mjs openapi [--offline]`; `node scripts/inventory/run-capture-authority-v2.mjs schema`. Redocly 2.53.3 y Sourcemeta 16.10.0 verifican transporte/schemas positivos y negativos; no sustituyen la integración real. Fuente auditada/publicada y CI exacta preceden a admisión y consumo.\n';
export function expectedContents() {
  const registry = successorRegistry();
  let ci = text(source('.gitlab-ci.yml'));
  ci = insertOnce(ci, '    - node scripts/identity/run-inventory-authority-v1-1.mjs prepare .ci-artifacts/inventory-v1-authority-1-1-ci',
    '\n    - node scripts/inventory/run-capture-authority-v2.mjs openapi\n    - node scripts/inventory/run-capture-authority-v2.mjs prepare .ci-artifacts/inventory-v1-capture-authority-v2-ci');
  ci = insertOnce(ci, '    - sh scripts/inventory/validate-v1.sh .ci-artifacts/inventory-v1-authority-1-1-ci',
    '\n    - sh scripts/inventory/validate-v1.sh .ci-artifacts/inventory-v1-capture-authority-v2-ci');
  return new Map([
    [httpPath, encode(successorHttp())], [schemaPath, encode(successorSchema())], [fixturePath, encode(bindingFixture())],
    ['registry/contracts.json', encode(registry)], ['inventory/index.json', encode(domainIndex(registry, 'inventory'))],
    ['inventory/README.md', Buffer.from(text(source('inventory/README.md')) + readmeSuffix)],
    ['registry/README.md', Buffer.from(text(source('registry/README.md')) + '\n## F1-11B — Fuente de preparación física v2\n\nDos intenciones `planned` identifican el sucesor HTTP/schema Inventory con `capture_fingerprint` JCS/SHA-256 del cuerpo completo de captura. Se preservan las 200 raíces admitidas, 236 artefactos históricos, dos intenciones previas y seis consumidores/locks/pins. [Mapa, límites y gates](../inventory/README.md#f1-11b--verificación-de-captura-física-v2-candidato). La proyección histórica solo acepta el delta completo verificado; drift y omisiones siguen rechazados. Auditoría, publicación/CI exacta y admisión seleccionada preceden al consumo.\n')],
    ['.gitlab-ci.yml', Buffer.from(ci)], [bridgePath, bridgeBytes()],
  ]);
}
let expectedCache;
const expectedSnapshot = () => expectedCache ??= expectedContents();
const historicalPaths = new Set(['registry/contracts.json', 'inventory/index.json',
  'inventory/README.md', 'registry/README.md', '.gitlab-ci.yml', bridgePath]);
export function validateCaptureSource(read = actual) {
  for (const [file, bytes] of expectedSnapshot())
    assert.equal(text(read(file)), text(bytes), 'IC2_EXACT_SOURCE:' + file);
  const before = previous('registry/contracts.json');
  for (const entry of [...before.contracts, ...before.preservedFiles]) {
    const bytes = read(entry.path);
    assert(hash(bytes) === entry.sha256 || hash(Buffer.from(text(bytes))) === entry.sha256, 'IC2_PUBLISHED_BYTES:' + entry.path);
  }
  for (const file of ['package.json', 'pnpm-lock.yaml', 'registry/consumers/index.json',
    ...before.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')])
    assert.equal(text(read(file)), text(source(file)), 'IC2_CONSUMER_OR_DEPENDENCY:' + file);
  for (const file of [verifierPath, runnerPath, testPath]) assert(read(file).length > 0, 'IC2_TOOL_MISSING:' + file);
  const result = { admitted: 0, addedPlanned: 2, roots: before.contracts.length, preserved: before.preservedFiles.length,
    consumers: before.requiredConsumers.length, runtime_demonstrated: false };
  return result;
}
export function validateSourceScope() {
  validateCaptureSource();
  const allowed = new Set(sourceFiles);
  for (const args of [['diff', '--name-only', base], ['diff', '--cached', '--name-only'], ['ls-files', '--others', '--exclude-standard']])
    for (const file of execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean))
      assert(allowed.has(file), 'IC2_UNDECLARED_PATH:' + file);
  return { paths: sourceFiles.length };
}
// Exact delta projection for prior gates, never a repair of mutated caller bytes.
export function captureHistoricalFile(file, bytes) {
  if (!historicalPaths.has(file)) return bytes;
  const expected = expectedSnapshot().get(file);
  if (!expected || text(bytes) !== text(expected)) return bytes;
  validateCaptureSource();
  return source(file);
}
export function captureHistoricalRegistry(value) {
  const expected = JSON.parse(expectedSnapshot().get('registry/contracts.json'));
  if (!isDeepStrictEqual(value, expected)) return value;
  validateCaptureSource();
  return previous('registry/contracts.json');
}
