import {projectOperationalConsumerFile,projectOperationalConsumerToolingFile,withOperationalConsumersScope} from './operational-context-consumers-v1.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {operationPointers, parseSource, resolveSelection} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';

export const admissionSourceRevision = '362d9fc3ee816d08bc541a0f93fe2907f2f8d764';
const root = path.resolve(import.meta.dirname, '../..');
export const admissionSource = createGitReader()(root, admissionSourceRevision);
export const admissionRead = file => fs.readFileSync(path.join(root, file));
const registryPath = 'registry/contracts.json';
const text = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes).replaceAll('\r\n', '\n');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const previous = JSON.parse(admissionSource(registryPath));
const selected = previous.planned.filter(row => row.materializeIn === 'F1-14A');
const selectedPaths = [
  'identity/http/public/v1/identity-operational-options-v1.yaml',
  'identity/http/private/v1/identity-operational-options-v1.yaml',
  'identity/http/shared/v1/identity-operational-options-v1.schema.json',
  'identity/http/shared/v1/identity-operational-context-policy-v1.json',
  'identity/http/private/v1/identity-finance-operational-authority-v1.yaml',
  'identity/http/shared/v1/identity-finance-operational-authority-v1.schema.json',
  'finance/http/public/v1/finance-open-shift-v1.yaml',
  'finance/http/private/v1/finance-open-shift-v1.yaml',
  'finance/http/shared/v1/finance-open-shift-v1.schema.json',
];
assert.equal(previous.contracts.length, 214, 'OPERATIONAL_ADMISSION_BASE');
assert.deepEqual(selected.map(row => row.path), selectedPaths, 'OPERATIONAL_ADMISSION_SELECTION');
export const admissionIds = Object.freeze(selected.map(row => row.id));

// Expectations below use only immutable Git objects. No successful live check
// or mutable caller input is retained between invocations.
const mappings = new Map();
for (const row of previous.contracts) for (const mapping of row.uriMappings) {
  assert(!mappings.has(mapping.uri) || mappings.get(mapping.uri) === mapping.path,
    'OPERATIONAL_ADMISSION_MAPPING_CONFLICT');
  mappings.set(mapping.uri, mapping.path);
}
for (const file of selectedPaths) {
  const document = parseSource(admissionSource(file), file);
  if (document.$id) mappings.set(document.$id, file);
}
const selection = row => ({version: row.version, operations: row.operations,
  pointers: row.operations.length ? [] : ['']});
const rows = selected.map(row => {
  const document = parseSource(admissionSource(row.path), row.path);
  return {
    id: row.id, domain: row.domain,
    surface: 'http-' + row.path.split('/')[2], owner: row.owner, status: 'active',
    capability: row.domain + '.' + (row.path.includes('finance-operational-authority')
      ? 'finance-operational-authority' : row.path.includes('operational-context-policy')
        ? 'operational-context' : row.domain === 'finance' ? 'open-shift' : 'operational-options'),
    purpose: 'F1-14A selected admission of read-only operational context; no consumer migration or runtime activation.',
    reasonForChange: 'Admit reviewed immutable source after full exact SHA/ref CI; preserve all existing transports and consumers.',
    retirement: 'Incompatible changes require a successor and explicitly authorized migration; preserve published bytes.',
    version: document.info?.version ?? 'v1', path: row.path,
    commit: admissionSourceRevision, tag: null, tagObject: null,
    sha256: digest(admissionSource(row.path)), operations: [...operationPointers(document).keys()],
    uriMappings: [...mappings].map(([uri, file]) => ({uri, path: file})),
  };
});
const registrySnapshot = {...previous, contracts: [...previous.contracts, ...rows],
  planned: previous.planned.filter(row => !admissionIds.includes(row.id))};
const closures = new Map();
for (const row of rows) {
  const full = resolveSelection(admissionSource, row, selection(row), registrySnapshot);
  const needed = new Set();
  const documents = new Map(full.files.map(file => [file.path, parseSource(admissionSource(file.path), file.path)]));
  const visit = (value, file) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === '$ref' || key === 'externalValue') && typeof child === 'string') {
        const raw = child.split('#')[0];
        if (raw) {
          const id = key === '$ref' && documents.get(file).$id;
          const uri = id ? new URL(raw, id).href : raw;
          if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) needed.add(uri);
        }
      } else visit(child, file);
    }
  };
  for (const unit of full.values) visit(unit.value, unit.path);
  row.uriMappings = row.uriMappings.filter(mapping => needed.has(mapping.uri));
  const minimal = resolveSelection(admissionSource, row, selection(row), registrySnapshot);
  assert.deepEqual(minimal, full, 'OPERATIONAL_ADMISSION_MINIMAL_MAPPING:' + row.id);
  closures.set(row.id, minimal);
}
export const admittedRegistry = () => structuredClone(registrySnapshot);
export const admissionClosures = () => structuredClone([...closures].map(([id, closure]) => ({id, ...closure})));
export function validateAdmissionRegistry(value) {
  assert.deepEqual(value, registrySnapshot, 'OPERATIONAL_ADMISSION_REGISTRY');
}

const suffix = '\n## F1-14A — Admisión seleccionada de contexto operativo\n\n' +
  'Nueve raíces Identity/Finance desde `' + admissionSourceRevision + '`, con ' +
  '[CI fuente completa Passed23/23](https://github.com/OpenComerix/contracts/actions/runs/43714557745) ' +
  'verificada por SHA/ref exactos. El registro fija versiones, operaciones, hashes Git y mappings del cierre: ' +
  '223 raíces registradas, dos planned ajenas y ocho consumidores/locks intactos. Se preservan los395 paths ' +
  'preexistentes y todos los bytes del paquete fuente; las secciones candidatas anteriores describen su snapshot publicado. ' +
  'La matriz fuente sigue siendo un mapa, no un lock consumidor.\n\n' +
  '[Verificador](../scripts/identity/operational-context-admission-v1.mjs) y ' +
  '[pruebas](../test/identity/operational-context-admission-v1.test.mjs): ' +
  '`node scripts/identity/operational-context-admission-v1.mjs`; ' +
  '`node --test test/identity/operational-context-admission-v1.test.mjs`. ' +
  'Candidato de admisión pendiente de auditoría/publicación y CI completa propias antes del gitlink o consumo. ' +
  'No activa runtime B–F, productores, consumidores ni producción; no acredita SQL, ES256 o autoridad ejecutada.\n';
const metadata = new Map([[registryPath, encode(registrySnapshot)],
  ...['identity', 'finance'].map(domain => [domain + '/index.json', encode(domainIndex(registrySnapshot, domain))]),
  ...['identity/README.md', 'finance/README.md', 'registry/README.md']
    .map(file => [file, Buffer.from(text(admissionSource(file)) + suffix)]),
]);
export const admissionMetadata = () => new Map([...metadata].map(([file, bytes]) => [file, Buffer.from(bytes)]));
const inputs = new Map(metadata);
const add = file => {if (!inputs.has(file)) inputs.set(file, admissionSource(file));};
for (const closure of closures.values()) for (const file of closure.files) add(file.path);
for (const row of [...previous.contracts, ...previous.preservedFiles]) add(row.path);
const sourceInventory = /export const operationalHashes=Object.freeze\(([\s\S]*?)\);/
  .exec(text(admissionSource('scripts/identity/operational-context-history-v1.mjs')));
assert(sourceInventory, 'OPERATIONAL_ADMISSION_SOURCE_INVENTORY');
for (const file of Object.keys(JSON.parse(sourceInventory[1]))) {
  if (file !== 'scripts/identity/operational-context-v1.mjs') add(file);
}
for (const file of ['package.json', 'pnpm-lock.yaml', '.github/workflows/ci.yml',
  'registry/consumers/index.json', ...previous.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json'),
  'identity/fixtures/operational-options/v1/consumption-map.json',
  'identity/fixtures/operational-options/v1/authority-cases.json']) add(file);
export const admissionInputPaths = Object.freeze([...inputs.keys()]);
export function validateAdmissionInput(file, bytes) {
  bytes=projectOperationalConsumerToolingFile(file,projectOperationalConsumerFile(file,bytes));
  assert(inputs.has(file), 'OPERATIONAL_ADMISSION_UNKNOWN_INPUT:' + file);
  assert.equal(text(bytes), text(inputs.get(file)), 'OPERATIONAL_ADMISSION_BYTES:' + file);
}
export function validateAdmission(read = admissionRead) {
  return withOperationalConsumersScope([],read,(_paths,read)=>{
  for (const file of admissionInputPaths) validateAdmissionInput(file, read(file));
  return {admitted: 9, roots: 223, priorRoots: 214, planned: 2, consumers: 8,
    closureFiles: new Set([...closures.values()].flatMap(closure => closure.files.map(file => file.path))).size,
    runtimeDemonstrated: false};
  },'OPERATIONAL_ADMISSION_BYTES');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'OPERATIONAL_ADMISSION_OPTIONS');
  console.log(JSON.stringify(validateAdmission()));
}
