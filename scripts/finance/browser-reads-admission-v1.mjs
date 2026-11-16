import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {operationPointers,parseSource,resolveSelection} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {projectPreparationConsumerFile,projectPreparationConsumerDocument,withPreparationConsumersScope} from '../identity/preparation-consumers-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const browserReadsAdmissionSourceRevision = '96d6e4909b08e7406c5bd0289e9cce1b04122349';
export const browserReadsAdmissionSource = createGitReader()(root, browserReadsAdmissionSourceRevision);
const native = file => readFileSync(path.join(root, file));
const text = bytes => new TextDecoder('utf-8', {fatal:true}).decode(bytes).replaceAll('\r\n', '\n');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const registryPath = 'registry/contracts.json';
const previous = JSON.parse(browserReadsAdmissionSource(registryPath));
export const browserReadsAdmissionId = 'finance.f1-14d.public.finance-browser-reads-v1';
const planned = previous.planned.filter(row => row.id === browserReadsAdmissionId);
assert.equal(planned.length, 1, 'BROWSER_ADMISSION_SELECTION');
assert.equal(previous.contracts.length, 223, 'BROWSER_ADMISSION_BASE');
const selected = planned[0];
const document = parseSource(browserReadsAdmissionSource(selected.path), selected.path);
assert.deepEqual([...operationPointers(document).keys()], selected.operations, 'BROWSER_ADMISSION_OPERATIONS');
assert.equal(document.info.version, selected.version, 'BROWSER_ADMISSION_VERSION');
const row = {
  id:selected.id, domain:selected.domain, surface:'http-public', owner:selected.owner, status:'active',
  capability:'finance.browser-operational-reads',
  purpose:'F1-14D selected admission of four browser-compatible operational GETs; no consumer migration or runtime activation.',
  reasonForChange:'Admit immutable source after full exact SHA/ref CI; optional Origin on reads only, with authority and mutations preserved.',
  retirement:'Incompatible changes require a successor and explicitly authorized migration; preserve published bytes.',
  version:selected.version, path:selected.path, commit:browserReadsAdmissionSourceRevision,
  tag:null, tagObject:null, sha256:digest(browserReadsAdmissionSource(selected.path)),
  operations:[...selected.operations], uriMappings:[],
};
const registry = {...previous, contracts:[...previous.contracts, row],
  planned:previous.planned.filter(item => item.id !== selected.id)};
// All selected references are local or same-document: the minimal URI map is empty.
const closure = resolveSelection(browserReadsAdmissionSource, row,
  {version:row.version, operations:row.operations, pointers:[]}, registry);
assert.deepEqual(closure.files.map(file => file.path), [
  'common/http/shared/v3/problem-details-v3.schema.json',
  'finance/fixtures/open-shift/v1/responses.json',
  'finance/http/public/v1/finance-browser-reads-v1.yaml',
  'finance/http/shared/v1/finance-open-shift-v1.schema.json',
  'finance/http/shared/v1/finance-types-v1.schema.json',
  'identity/fixtures/operational-options/v1/problems.json',
], 'BROWSER_ADMISSION_CLOSURE');
export const browserReadsAdmittedRegistry = () => structuredClone(registry);
export const browserReadsAdmissionClosure = () => structuredClone(closure);

const suffix = '\n## F1-14D — Admisión seleccionada de lecturas para navegador\n\n' +
  'Una raíz pública Finance, cuatro GET, desde `' + browserReadsAdmissionSourceRevision + '`, con ' +
  '[CI fuente completa Passed23/23](https://github.com/OpenComerix/contracts/actions/runs/43881646970) ' +
  'verificada por SHA/ref exactos. El descriptor fija versión, operaciones y hash Git; cierre de seis archivos, ' +
  'sin mappings URI innecesarios. 224 raíces, dos planned ajenas y ocho consumidores/locks intactos. ' +
  'Transportes, fixtures, autoridad y mutaciones publicados se preservan; las secciones candidatas anteriores describen su snapshot.\n\n' +
  '[Verificador](../scripts/finance/browser-reads-admission-v1.mjs) y ' +
  '[pruebas](../test/finance/browser-reads-admission-v1.test.mjs): ' +
  '`node scripts/finance/browser-reads-admission-v1.mjs`; ' +
  '`node --test test/finance/browser-reads-admission-v1.test.mjs`. ' +
  'Candidato de admisión pendiente de auditoría, publicación y CI completa propias antes de consumo o gitlink. ' +
  'No activa Gateway/PWA ni demuestra autorización ejecutada, SQL o navegador.\n';
const metadata = new Map([
  [registryPath, encode(registry)],
  ['finance/index.json', encode(domainIndex(registry, 'finance'))],
  ...['finance/README.md', 'registry/README.md'].map(file =>
    [file, Buffer.from(text(browserReadsAdmissionSource(file)) + suffix)]),
]);
export const browserReadsAdmissionMetadata = () => new Map([...metadata].map(([file, bytes]) => [file, Buffer.from(bytes)]));
const delta = new Map(metadata);
for (const file of [...closure.files.map(item => item.path), 'finance/fixtures/browser-reads/v1/origin-cases.json'])
  delta.set(file, browserReadsAdmissionSource(file));
export const browserReadsAdmissionScopeFiles = Object.freeze([...delta.keys()]);
const inputs = new Map(delta);
for (const file of [
  ...[...previous.contracts, ...previous.preservedFiles].map(item => item.path),
  'package.json', 'pnpm-lock.yaml', '.github/workflows/ci.yml', 'registry/consumers/index.json',
  ...previous.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json'),
]) if (!inputs.has(file)) inputs.set(file, browserReadsAdmissionSource(file));
export const browserReadsAdmissionInputPaths = Object.freeze([...inputs.keys()]);
export function validateBrowserReadsAdmissionInput(file, bytes) {
  bytes = projectPreparationConsumerFile(file, bytes);
  assert(inputs.has(file), 'BROWSER_ADMISSION_UNKNOWN_INPUT:' + file);
  assert.equal(text(bytes), text(inputs.get(file)), 'BROWSER_ADMISSION_BYTES:' + file);
}
export function validateBrowserReadsAdmission(read = native) {
  return withPreparationConsumersScope([], read, (_paths, read) => {
  for (const file of browserReadsAdmissionInputPaths) validateBrowserReadsAdmissionInput(file, read(file));
  return {admitted:1, roots:224, priorRoots:223, planned:2, consumers:8, closureFiles:6, runtimeDemonstrated:false};
  });
}

// Pure exact-value projections. They prove only the supplied value, not a live tree.
export function projectBrowserReadsAdmissionFile(file, bytes) {
  bytes = projectPreparationConsumerFile(file, bytes);
  const expected = metadata.get(file);
  if (!expected) return bytes;
  try {return text(bytes) === text(expected) ? browserReadsAdmissionSource(file) : bytes;} catch {return bytes;}
}
export function projectBrowserReadsAdmissionDocument(file, value) {
  value = projectPreparationConsumerDocument(file, value);
  const expected = metadata.get(file);
  if (!expected || !file.endsWith('.json')) return value;
  return isDeepStrictEqual(value, JSON.parse(expected)) ? JSON.parse(browserReadsAdmissionSource(file)) : value;
}
// Old owner gates already check preservation. Their context checks this delta
// once, never the whole admission validator for each historical file/fixture.
export function withBrowserReadsAdmissionScope(paths, read, verify, label = 'BROWSER_ADMISSION_BYTES') {
  let active = true;
  const current = new Map();
  const raw = file => {
    assert(active, 'BROWSER_ADMISSION_CONTEXT_CLOSED');
    if (!current.has(file)) current.set(file, Buffer.from(read(file)));
    return Buffer.from(current.get(file));
  };
  try {
    const bytes = raw(registryPath);
    let value;
    try {value = JSON.parse(bytes);} catch {throw Error(label + ':' + registryPath);}
    if (!isDeepStrictEqual(value, registry)) {
      assert(!value.contracts?.some(item => item.id === selected.id), 'BROWSER_ADMISSION_PARTIAL_SCOPE');
      const result = verify(paths, raw);
      assert(!result || typeof result.then !== 'function', 'BROWSER_ADMISSION_SYNCHRONOUS');
      return result;
    }
    return withPreparationConsumersScope(paths, raw, (paths, prepared) => {
      for (const [file, expected] of delta)
        assert.equal(text(prepared(file)), text(expected), label + ':' + file);
      const result = verify([...new Set([...paths, ...browserReadsAdmissionScopeFiles])],
        file => projectBrowserReadsAdmissionFile(file, prepared(file)));
      assert(!result || typeof result.then !== 'function', 'BROWSER_ADMISSION_SYNCHRONOUS');
      return result;
    });
  } finally {active = false; current.clear();}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'BROWSER_ADMISSION_OPTIONS');
  console.log(JSON.stringify(validateBrowserReadsAdmission()));
}
