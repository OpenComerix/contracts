import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {projectBrowserReadsAdmissionFile,projectBrowserReadsAdmissionDocument,withBrowserReadsAdmissionScope} from './browser-reads-admission-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const browserReadsBase = '02365abfe474a49afcfa1a35322e77489c7eced6';
const source = createGitReader()(root, browserReadsBase);
const text = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes).replaceAll('\r\n', '\n');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const native = file => readFileSync(path.join(root, file));
export const browserReadsPath = 'finance/http/public/v1/finance-browser-reads-v1.yaml';
export const browserReadsFixturesPath = 'finance/fixtures/browser-reads/v1/origin-cases.json';
export const browserReadsId = 'finance.f1-14d.public.finance-browser-reads-v1';
export const browserReadsOperations = Object.freeze([
  'listCashRegisters', 'getCashShift', 'getCashShiftExpected', 'getOpenCashShift',
]);
export const browserReadsPreservedFiles = Object.freeze([
  'finance/http/public/v1/finance-v1.yaml',
  'finance/http/public/v1/finance-open-shift-v1.yaml',
]);
const predecessors = browserReadsPreservedFiles;
const originals = predecessors.map(file => JSON.parse(source(file)));
const originDescription = 'Optional on read-only GET: same-origin browsers may omit Origin. ' +
  'If present, require exactly one explicitly allowed origin; reject foreign, null, malformed or duplicate origins. ' +
  'Absence grants no authority: current session, device, MFA, membership, permission, tenant, branch/POS scopes and resource ownership remain required. ' +
  'No credentialed wildcard. Mutation Origin/CSRF requirements are unchanged.';
const document = structuredClone(originals[0]);
document.info.title = 'Finance browser operational reads v1';
document.info.description = 'F1-14D selected source successor for four read-only operations. ' +
  'Optional Origin for same-origin browser GET; no admission, consumer migration or runtime demonstrated.';
document.paths = {};
document['x-policy'] = originals[1]['x-policy'];
for (const original of originals) {
  assert.deepEqual(original.security, document.security, 'BROWSER_READS_SECURITY_BASE');
  assert.deepEqual(original.components, document.components, 'BROWSER_READS_COMPONENTS_BASE');
  for (const [route, item] of Object.entries(original.paths)) {
    if (!browserReadsOperations.includes(item.get?.operationId)) continue;
    const operation = structuredClone(item.get);
    const origins = operation.parameters.filter(parameter => parameter.in === 'header' && parameter.name === 'Origin');
    assert.equal(origins.length, 1, 'BROWSER_READS_ORIGIN_BASE');
    assert.equal(origins[0].required, true, 'BROWSER_READS_ORIGIN_BASE');
    origins[0].required = false;
    origins[0].description = originDescription;
    document.paths[route] = {get: operation};
  }
}
assert.deepEqual(Object.values(document.paths).map(item => item.get.operationId), browserReadsOperations);
const fixtures = {
  format_version: 1, status: 'candidate', runtime_demonstrated: false,
  operations: [...browserReadsOperations],
  allowed_origin: 'https://pos.opencomerix.example',
  cases: [
    {id: 'same-origin-browser', origins: [], origin_check: 'continue-to-authority'},
    {id: 'explicit-allowed', origins: ['https://pos.opencomerix.example'], origin_check: 'continue-to-authority'},
    {id: 'foreign', origins: ['https://foreign.example'], origin_check: 'reject'},
    {id: 'opaque', origins: ['null'], origin_check: 'reject'},
    {id: 'empty', origins: [''], origin_check: 'reject'},
    {id: 'malformed', origins: ['not-an-origin'], origin_check: 'reject'},
    {id: 'duplicate-allowed', origins: ['https://pos.opencomerix.example', 'https://pos.opencomerix.example'], origin_check: 'reject'},
    {id: 'allowed-and-foreign', origins: ['https://pos.opencomerix.example', 'https://foreign.example'], origin_check: 'reject'},
  ],
  authority_controls: [
    'invalid-session', 'unapproved-device', 'missing-mfa', 'inactive-membership',
    'missing-permission', 'foreign-tenant', 'out-of-scope-branch', 'out-of-scope-pos',
    'foreign-resource', 'open-shift-other-responsible',
  ],
  constraints: 'Fixtures specify acceptance cases, not runtime authorization evidence. Missing Origin must never bypass authority. ' +
    'Browser/Gateway and owner integration tests are required at consumer admission. No changes to mutations or history.',
};
const registryPath = 'registry/contracts.json';
const registry = JSON.parse(source(registryPath));
registry.planned.push({
  id: browserReadsId, domain: 'finance', owner: 'finance', materializeIn: 'F1-14D',
  status: 'planned', path: browserReadsPath, version: '1.0.0', operations: [...browserReadsOperations],
  constraint: 'Selected source successor: optional Origin only for four operational GETs. Preserve published bytes and mutation Origin/CSRF. ' +
    'Audited publication, full exact SHA/ref CI and separate selected admission precede consumption; no runtime grant.',
});
const suffix = '\n## F1-14D — Consultas operativas desde navegador (fuente candidata)\n\n' +
  '[Sucesor público](http/public/v1/finance-browser-reads-v1.yaml) para `listCashRegisters`, `getCashShift`, ' +
  '`getCashShiftExpected` y `getOpenCashShift`: GET admite ausencia de `Origin`, propia del navegador del mismo origen; ' +
  'si está presente debe ser único y permitido. Conserva sesión, dispositivo/MFA, membresía, permisos, tenant, scopes, ' +
  'propiedad y responsable original. Mutaciones, historia y fuentes publicadas permanecen intactas. ' +
  '[Casos de aceptación](fixtures/browser-reads/v1/origin-cases.json); fixtures no acreditan autorización ejecutada.\n\n' +
  'Una intención planned, sin admisión ni cambios de consumidores/locks. Auditoría, publicación y CI completa exacta de la fuente ' +
  'preceden la admisión seleccionada y las pruebas Gateway/navegador; luego continúa la PWA. ' +
  'Gates: `node scripts/finance/browser-reads-v1.mjs`; `node --test test/finance/browser-reads-v1.test.mjs`; ' +
  '`node scripts/finance/run-gate-v1.mjs openapi --offline` incluye esta fuente una vez en el job Finance existente.\n';
const gatePath = 'scripts/finance/run-gate-v1.mjs';
const oldGate = text(source(gatePath));
const gateNeedle = "export const openapis=['finance/http/public/v1/finance-v1.yaml',";
assert.equal(oldGate.split(gateNeedle).length, 2, 'BROWSER_READS_GATE_BASE');
const metadata = new Map([
  [registryPath, encode(registry)],
  ['finance/index.json', encode(domainIndex(registry, 'finance'))],
  ['finance/README.md', Buffer.from(text(source('finance/README.md')) + suffix)],
  [gatePath, Buffer.from(oldGate.replace(gateNeedle, "export const openapis=['" + browserReadsPath + "','finance/http/public/v1/finance-v1.yaml',"))],
]);
const inputs = new Map([...metadata, [browserReadsPath, encode(document)], [browserReadsFixturesPath, encode(fixtures)]]);
export const browserReadsFiles = Object.freeze([...inputs.keys()]);
export const browserReadsCandidate = () => new Map([...inputs].map(([file, bytes]) => [file, Buffer.from(bytes)]));

// Pure exact-value projections: no live I/O, recursive gates or remembered approval.
export function projectBrowserReadsFile(file, bytes) {
  bytes = projectBrowserReadsAdmissionFile(file, bytes);
  const expected = metadata.get(file);
  if (!expected) return bytes;
  try {return text(bytes) === text(expected) ? source(file) : bytes;} catch {return bytes;}
}
export function projectBrowserReadsDocument(file, value) {
  value = projectBrowserReadsAdmissionDocument(file, value);
  const expected = metadata.get(file);
  if (!expected || !file.endsWith('.json')) return value;
  return isDeepStrictEqual(value, JSON.parse(expected)) ? JSON.parse(source(file)) : value;
}
export function validateBrowserReadsInput(file, bytes) {
  bytes = projectBrowserReadsAdmissionFile(file, bytes);
  assert(inputs.has(file), 'BROWSER_READS_UNKNOWN_INPUT:' + file);
  assert.equal(text(bytes), text(inputs.get(file)), 'BROWSER_READS_BYTES:' + file);
}
export function validateBrowserReads(read = native) {
  return withBrowserReadsAdmissionScope([], read, (_paths, read) => {
  for (const file of browserReadsFiles) validateBrowserReadsInput(file, read(file));
  for (const file of predecessors) assert.equal(text(read(file)), text(source(file)), 'BROWSER_READS_PREDECESSOR:' + file);
  return {operations: 4, planned: 1, admitted: 0, runtimeDemonstrated: false};
  }, 'BROWSER_READS_BYTES');
}
// One bounded context validates the new delta once. Older owner gates receive
// their exact historical inputs; caller drift and partial metadata never project.
export function withBrowserReadsScope(paths, read, verify, label = 'BROWSER_READS_BYTES') {
  return withBrowserReadsAdmissionScope(paths, read, (paths, read) => withSourceScope(paths, read, verify, label), label);
}
function withSourceScope(paths, read, verify, label) {
  let active = true;
  const live = new Map();
  const raw = file => {
    assert(active, 'BROWSER_READS_CONTEXT_CLOSED');
    if (!live.has(file)) live.set(file, Buffer.from(read(file)));
    return Buffer.from(live.get(file));
  };
  try {
    const bytes = raw(registryPath);
    let value;
    try {value = JSON.parse(bytes);} catch {throw Error(label + ':' + registryPath);}
    if (!isDeepStrictEqual(value, registry)) {
      assert(![...(value.planned ?? []), ...(value.contracts ?? [])].some(row => row.id === browserReadsId), 'BROWSER_READS_PARTIAL_SCOPE');
      return verify(paths, raw);
    }
    validateBrowserReads(raw);
    const result = verify([...new Set([...paths, ...browserReadsFiles, ...predecessors])], file => projectBrowserReadsFile(file, raw(file)));
    assert(!result || typeof result.then !== 'function', 'BROWSER_READS_SYNCHRONOUS');
    return result;
  } finally {active = false; live.clear();}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'BROWSER_READS_OPTIONS');
  console.log(JSON.stringify(validateBrowserReads()));
}
