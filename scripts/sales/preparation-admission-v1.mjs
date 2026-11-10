import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {gitReader, resolveSelection} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {projectAcceptanceConsumerFile} from './acceptance-consumer-v1.mjs';

export const admissionSourceCommit = '748cb69b9301243a32c169b01e2c340b7102f020';
export const root = path.resolve(import.meta.dirname, '../..');
export const admissionSource = gitReader(root, admissionSourceCommit);
const registryPath = 'registry/contracts.json';
const problem = 'common/http/shared/v3/problem-details-v3.schema.json';
const specifications = [
  ['inventory.sale-context.http.v1', 'http-private', '1.0.0', ['checkInventorySaleContext']],
  ['inventory.sale-context.schema.v1', 'schema', 'v1', []],
  ['finance.sale-context.http.v1', 'http-private', '1.0.0', ['checkFinanceSaleContext']],
  ['finance.sale-context.schema.v1', 'schema', 'v1', []],
  ['sales.context-check-authority.http.v1', 'http-private', '1.0.0', ['authorizeSaleContextCheck']],
  ['sales.context-check-authority.schema.v1', 'schema', 'v1', []],
  ['identity.sale-preparation-workloads.policy.v1', 'policy', 'v1', []],
  ['sales.preparation.fixtures.v1', 'validation', 'v1', []],
];
export const admissionIds = Object.freeze(specifications.map(row => row[0]));
export const admissionToolFiles = Object.freeze([
  'scripts/sales/preparation-admission-v1.mjs', 'test/sales/preparation-admission-v1.test.mjs',
]);
const text = bytes => new TextDecoder('utf-8', {fatal:true}).decode(bytes).replaceAll('\r\n', '\n');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const native = file => fs.readFileSync(path.join(root, file));
let immutable, closures;
function facts() {
  if (immutable) return immutable;
  const before = JSON.parse(admissionSource(registryPath));
  assert.equal(before.contracts.length, 206); assert.equal(before.preservedFiles.length, 236);
  assert.equal(before.requiredConsumers.length, 8);
  const intentions = before.planned.filter(row => row.materializeIn === 'F1-13A');
  assert.deepEqual(intentions.map(row => row.id), admissionIds);
  const rows = specifications.map(([id, surface, version, operations]) => {
    const intention = intentions.find(row => row.id === id), file = intention.path;
    const mappings = surface === 'http-private'
      ? [intentions.find(row => row.id === id.replace('.http.', '.schema.')).path, problem]
      : surface === 'schema' ? [file] : [];
    return {id, domain:intention.domain, surface, owner:intention.owner, status:'active',
      capability:id.replace(/\.(http|schema|policy|fixtures)\.v1$/, ''),
      purpose:'F1-13A selected admission of read-only owner context preparation; consumer migration and owner runtime remain separate.',
      reasonForChange:'Audited source 748cb69 with complete exact CI 42681353002 (23/23); no transport bytes or prior pins changed.',
      retirement:'Preserve source bytes and prior admissions; incompatible evolution requires a successor and explicit migration.',
      version, path:file, commit:admissionSourceCommit, tag:null, tagObject:null, sha256:hash(admissionSource(file)),
      operations:[...operations], uriMappings:mappings.map(path => ({uri:'https://contracts.opencomerix.example/' + path, path}))};
  });
  const registry = {...before, contracts:[...before.contracts, ...rows], planned:before.planned.filter(row => !admissionIds.includes(row.id))};
  const metadata = new Map([[registryPath, encode(registry)]]);
  const section = '\n## F1-13A — Admisión seleccionada de preparación (candidata)\n\n' +
    'Ocho raíces desde `'+admissionSourceCommit+'`: tres puertos/schema privados, cuatro perfiles Identity en una política y fixtures sintéticas. ' +
    '[CI fuente completa 23/23](https://github.com/OpenComerix/contracts/actions/runs/42681353002) verificada por SHA/ref exactos. ' +
    '214 admisiones, 236 artefactos preservados y dos planned ajenos; ocho consumidores, locks y pins intactos. ' +
    'Las secciones de fuente candidata describen su corte histórico; sus indicadores publicados no se reescriben. ' +
    'La admisión requiere auditoría/publicación y CI completa propias antes del consumo; no activa runtime ni producción, no actualiza gitlinks ni cierra A. ' +
    'Los gates de fuente conservan su vista histórica; el gate de admisión informa el registro actual. ' +
    'Gates: `node scripts/sales/preparation-admission-v1.mjs`; `node --test test/sales/preparation-admission-v1.test.mjs`.\n';
  for (const domain of ['inventory', 'finance', 'sales', 'identity']) {
    metadata.set(domain + '/index.json', encode(domainIndex(registry, domain)));
    metadata.set(domain + '/README.md', Buffer.from(text(admissionSource(domain + '/README.md')) + section));
  }
  metadata.set('registry/README.md', Buffer.from(text(admissionSource('registry/README.md')) + section));
  immutable = {before, rows, registry, metadata};
  return immutable;
}
export const admittedRegistry = () => structuredClone(facts().registry);
export const admissionRows = () => structuredClone(facts().rows);
export const admissionMetadata = () => new Map([...facts().metadata].map(([file, bytes]) => [file, Buffer.from(bytes)]));

// Pure exact-value adaptation. Never read/approve another current input, invoke
// a historical gate or repair an unknown, partial or altered supplied value.
export function projectPreparationAdmissionFile(file, bytes) {
  const expected = facts().metadata.get(file);
  return expected && text(bytes) === text(expected) ? Buffer.from(admissionSource(file)) : bytes;
}
export function projectPreparationAdmissionDocument(file, value) {
  if (!file.endsWith('.json')) return value;
  const expected = facts().metadata.get(file);
  return expected && isDeepStrictEqual(value, JSON.parse(expected)) ? JSON.parse(admissionSource(file)) : value;
}
export function withPreparationAdmissionScope(paths, read) {
  const registry = read(registryPath);
  if (projectPreparationAdmissionFile(registryPath, registry) === registry) {
    assert(!JSON.parse(text(registry)).contracts.some(row => admissionIds.includes(row.id)), 'PREPARATION_ADMISSION_PARTIAL_SCOPE');
    return new Set(paths);
  }
  for (const [file, expected] of facts().metadata)
    assert(text(file === registryPath ? registry : read(file)) === text(expected), 'PREPARATION_ADMISSION_METADATA:' + file);
  return new Set([...paths, ...facts().metadata.keys(), ...admissionToolFiles]);
}
export function admissionClosures() {
  closures ??= facts().rows.map(row => ({id:row.id, ...resolveSelection(admissionSource, row,
    {version:row.version, operations:row.operations, pointers:row.operations.length ? [] : ['']}, facts().registry)}));
  return structuredClone(closures);
}
export function validatePreparationAdmission(read = native) {
  const checked = new Map();
  const current = file => {if (!checked.has(file)) checked.set(file, read(file)); return checked.get(file);};
  for (const [file, expected] of facts().metadata)
    assert(text(current(file)) === text(expected), 'PREPARATION_ADMISSION_METADATA:' + file);
  const protectedFiles = new Set(['registry/consumers/index.json',
    ...facts().before.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')]);
  for (const closure of admissionClosures()) {
    const row = facts().rows.find(row => row.id === closure.id);
    assert.equal(closure.files.find(file => file.path === row.path).sha256, row.sha256, 'PREPARATION_ADMISSION_ROOT_HASH');
    for (const file of closure.files) protectedFiles.add(file.path);
  }
  for (const file of protectedFiles)
    assert(text(projectAcceptanceConsumerFile(file, current(file))) === text(admissionSource(file)), 'PREPARATION_ADMISSION_SOURCE:' + file);
  return {admitted:8, roots:214, preserved:236, planned:2, consumers:8, closureFiles:9, runtime_demonstrated:false};
}
export function materializePreparationAdmission() {
  // Refuse to overwrite unrelated work, even when only some own metadata was
  // materialized by an interrupted invocation. No source/consumer file writes.
  for (const [file, expected] of facts().metadata) {
    const stat = fs.lstatSync(path.join(root, file));
    assert(stat.isFile() && !stat.isSymbolicLink(), 'PREPARATION_ADMISSION_METADATA_LINK');
    const actual = text(native(file));
    assert(actual === text(admissionSource(file)) || actual === text(expected), 'PREPARATION_ADMISSION_OVERWRITE:' + file);
  }
  for (const [file, bytes] of facts().metadata) fs.writeFileSync(path.join(root, file), bytes);
  return validatePreparationAdmission();
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--write'), 'Explicit --write only');
  console.log(JSON.stringify(process.argv[2] === '--write' ? materializePreparationAdmission() : validatePreparationAdmission()));
}
