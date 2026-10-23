import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { gitReader, resolveSelection, worktreeReader } from '../../tools/architecture/graph.mjs';

import { workloadRegistryView } from '../identity/catalog-workload-profiles-v2-registry.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const admissionBase = '280d990b81d684c886c87c7998979edd4f84f288';
export const admissionId = 'catalog.events.v1.asyncapi';
const source = gitReader(root, admissionBase);
const baseline = JSON.parse(source('registry/contracts.json'));
const prior = baseline.contracts.find(row => row.id === admissionId);
assert.equal(prior.status, 'draft', 'N_ADMISSION_BASE_STATUS');
export const admissionPurpose = 'Topología lógica de catálogo certificada y admitida; sin broker, consumidor nuevo ni activación runtime.';
export const admissionReason = 'F1-08N: admisión seleccionada tras certificación publicada; preservar transporte y procedencia, sin migrar consumidores.';

export function admittedRegistry() {
  const registry = structuredClone(baseline);
  Object.assign(registry.contracts.find(row => row.id === admissionId), {
    status: 'active', purpose: admissionPurpose, reasonForChange: admissionReason,
  });
  return registry;
}

// Source revisions remain the original published descriptor revisions. The
// certification commit is evidence, not a replacement transport provenance.
export function validateAsyncapiAdmission(registry, read = worktreeReader(root)) {
  registry = workloadRegistryView(registry, read);
  assert(isDeepStrictEqual(registry, admittedRegistry()), 'N_ADMISSION_REGISTRY');
  const row = registry.contracts.find(row => row.id === admissionId);
  const closureFiles = validateClosure(row, registry, read);
  return { admitted: 1, roots: 119, preserved: 236, planned: 3,
    other_drafts: 12, closure_files: closureFiles, runtime_demonstrated: false };
}

function validateClosure(row, registry, read) {
  const closure = resolveSelection(gitReader(root, row.commit), row,
    { version: row.version, operations: [], pointers: [''] }, registry);
  const expected = [row.path, 'events/event-envelope-v1.schema.json',
    'catalog/events/v1/catalog-event-data-v1.schema.json',
    ...['catalog.category', 'catalog.product', 'catalog.presentation', 'pricing.presentation-price']
      .map(name => 'catalog/events/v1/' + name + '.changed.v1.schema.json')];
  assert.deepEqual(closure.files.map(file => file.path).sort(), expected.sort(), 'N_ADMISSION_CLOSURE');
  for (const file of closure.files) {
    assert(!registry.contracts.some(item => item.path === file.path && item.status === 'draft'), 'N_ADMISSION_DRAFT');
    assert(read(file.path).equals(gitReader(root, row.commit)(file.path)), 'N_ADMISSION_BYTES:' + file.path);
  }
  return closure.files.length;
}

// Project only N's exact descriptor, never unrelated metadata or mutations.
// The complete N gate checks the full registry; J/K/L/H/I retain their original
// diagnostics for every other field. Source bytes are checked before projection.
export function asyncapiAdmissionRegistryView(registry) {
  registry = workloadRegistryView(registry);
  const row = registry.contracts?.find(row => row.id === admissionId);
  // A status-only promotion in a historical fixture is still unauthorized and
  // must reach that cut's original descriptor diagnostic, not select N.
  if (row?.purpose !== admissionPurpose && row?.reasonForChange !== admissionReason) return registry;
  const expected = admittedRegistry();
  assert(isDeepStrictEqual(row, expected.contracts.find(item => item.id === admissionId)), 'N_ADMISSION_DESCRIPTOR');
  validateClosure(row, expected, worktreeReader(root));
  return { ...registry, contracts: registry.contracts.map(item => item.id === admissionId ? structuredClone(prior) : item) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'registry/contracts.json'), 'utf8'));
  console.log('F1-08N selected AsyncAPI admission passed: ' + JSON.stringify(validateAsyncapiAdmission(registry)));
}
