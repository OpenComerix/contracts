import assert from 'node:assert/strict';
import { candidateReadView } from '../inventory/candidate-v1.mjs';
import {projectReviewedRegistry,reviewedCandidateRevision} from '../../tools/architecture/validation-history.mjs';
import { consumerReadView, consumerChangedFiles } from './catalog-workload-consumers-v2-registry.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, resolveSelection, worktreeReader } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const workloadSource = '9223c3b6b7c5077d7230d14d16da26a8129d0c51';
const source = gitReader(root, workloadSource);
export const workloadSourceRegistry = () => JSON.parse(source('registry/contracts.json'));
export const workloadSelection = Object.freeze([
  Object.freeze(['identity.catalog-workload-profiles.policy.v2', 'identity/http/shared/v2/identity-catalog-workload-profiles-v2.json', 'policy', '2', 'bc868e4970bc8900c8053fce5f79ab34bc2fcf61fa42dffe90e717a144258626']),
  Object.freeze(['identity.catalog-workload-profiles.fixtures.v2', 'identity/fixtures/catalog-workload/v2/catalog-workload-profiles-v2-vectors.json', 'validation', 'v2', '22f8e4cd30d6a58dae2fed234eda4ef3cf107091697ed09e844a06eaba09a621']),
]);
const ids = new Set(workloadSelection.map(([id]) => id));
export const workloadReadmeSuffix = '\n## F1-08O3 — Admisión seleccionada de perfiles H1A v2\n\n' +
  'Se admiten únicamente la política v2 y sus vectores desde contracts ' + workloadSource + ', con hashes Git exactos y [CI fuente Passed, 14/14](https://gitlab.com/opencomerix/contracts/-/pipelines/2980742219). El registro conserva las 119 raíces anteriores, 236 artefactos preservados y tres intenciones pendientes: total 121 raíces. La política y los vectores publicados conservan sus bytes y estado candidato; active describe esta admisión contractual, sin afirmar habilitación productiva.\n\n' +
  '| ID | Superficie / versión |\n| --- | --- |\n' +
  '| identity.catalog-workload-profiles.policy.v2 | policy / 2 |\n' +
  '| identity.catalog-workload-profiles.fixtures.v2 | validation / v2 |\n\n' +
  'El [validador de admisión](../scripts/identity/catalog-workload-profiles-v2-registry.mjs) comprueba el paquete completo antes de proyectarlo para los controles históricos; sus [pruebas externas](../test/identity/catalog-workload-profiles-admission-v2.test.mjs) verifican procedencia, cierre y negativos. Política v1, seis perfiles aislados, herramientas genéricas, CI, dependencias, manifiestos/locks/exports y runtime permanecen intactos. La migración consumidora y la composición operativa requieren cortes y permisos propios. Esta admisión no cierra O/F1-08 ni acredita SQL, criptografía o despliegue.\n';

// Reconstruct from immutable Git. CI is verified operationally by exact SHA/ref,
// never inferred from the presence of this revision or its candidate documents.
export function workloadAdmissionRows() {
  return workloadSelection.map(([id, file, surface, version, hash]) => {
    assert.equal(sha256(source(file)), hash, 'O3_WORKLOAD_SOURCE_HASH');
    return { id, domain: 'identity', surface, owner: 'identity-tenancy', status: 'active',
      capability: 'identity.catalog-workload-profiles',
      purpose: 'Admit purpose-bound H1A v2 policy and validation vectors only; no consumer migration or runtime activation.',
      reasonForChange: 'F1-08O3 selected admission from published immutable sources with exact source CI verified.',
      retirement: 'Preserve published bytes; incompatible evolution requires a versioned successor and explicit consumer migration.',
      version, path: file, commit: workloadSource, tag: null, tagObject: null, sha256: hash,
      operations: [], uriMappings: [] };
  });
}
export function workloadAdmittedRegistry() {
  const previous = workloadSourceRegistry();
  assert.equal(previous.contracts.length, 119, 'O3_WORKLOAD_BASE');
  return { ...previous, contracts: [...previous.contracts, ...workloadAdmissionRows()] };
}
export function validateWorkloadRegistry(registry = JSON.parse(fs.readFileSync(path.join(root, 'registry/contracts.json'), 'utf8')), read = worktreeReader(root)) {
  registry = projectReviewedRegistry(reviewedCandidateRevision,registry);
  assert(isDeepStrictEqual(registry, workloadAdmittedRegistry()), 'O3_WORKLOAD_REGISTRY');
  for (const row of workloadAdmissionRows()) {
    const closure = resolveSelection(source, row, { version: row.version, operations: [], pointers: [''] }, registry);
    assert.deepEqual(closure.files, [{ path: row.path, sha256: row.sha256 }], 'O3_WORKLOAD_CLOSURE');
    const actual = read(row.path), expected = source(row.path);
    assert(actual.equals(expected) || Buffer.from(actual.toString('utf8').replaceAll('\r\n', '\n')).equals(expected), 'O3_WORKLOAD_BYTES:' + row.path);
  }
  return { admitted: 2, roots: 121, prior_roots: 119, preserved: 236, planned: 3, runtime_demonstrated: false };
}

// Historical fixtures retain their own diagnostics. Any partial/new suffix must
// pass the complete closed transition before only these two rows are removed.
export function workloadRegistryView(registry, read = worktreeReader(root)) {
  registry = projectReviewedRegistry(reviewedCandidateRevision,registry);
  if (!registry.contracts?.some(row => ids.has(row.id))) return registry;
  validateWorkloadRegistry(registry, read);
  return { ...registry, contracts: registry.contracts.slice(0, 119) };
}

// Exact metadata views for old byte-preservation checks. A caller-supplied reader
// is retained, so altered files cannot be replaced by an unrelated clean checkout.
// The current O3 package gate separately requires every complete new artifact.
export function workloadReadView(read = worktreeReader(root)) {
  const consumers = consumerReadView(read);
  return file => {
    const bytes = consumers(file);
    if (file === 'registry/contracts.json') {
      const registry = JSON.parse(bytes);
      if (workloadRegistryView(registry, read) !== registry) return source(file);
    }
    if (file === 'identity/index.json') {
      const index = JSON.parse(bytes);
      if (index.contracts?.some(id => ids.has(id)) || index.contracts?.length > 43) {
        assert(isDeepStrictEqual(index, domainIndex(workloadAdmittedRegistry(), 'identity')), 'O3_WORKLOAD_INDEX');
        return source(file);
      }
    }
    if (file === 'identity/README.md') {
      const text = bytes.toString('utf8').replaceAll('\r\n', '\n');
      if (text.includes('\n## F1-08O3')) {
        assert.equal(text, source(file).toString('utf8') + workloadReadmeSuffix, 'O3_WORKLOAD_README');
        return source(file);
      }
    }
    return bytes;
  };
}
export function validateWorkloadPackage(read = worktreeReader(root)) {
  read = candidateReadView(read);
  const registry = JSON.parse(read('registry/contracts.json'));
  const result = validateWorkloadRegistry(registry, read);
  assert(isDeepStrictEqual(JSON.parse(read('identity/index.json')), domainIndex(registry, 'identity')), 'O3_WORKLOAD_INDEX');
  assert.equal(read('identity/README.md').toString('utf8').replaceAll('\r\n', '\n'), source('identity/README.md').toString('utf8') + workloadReadmeSuffix, 'O3_WORKLOAD_README');
  return result;
}

// Closed review surface; this does not exempt contents from the gates above or
// the independently pinned historical proof checks and isolated audit.
export const workloadChangedFiles = Object.freeze([
  ...consumerChangedFiles,
  'registry/contracts.json', 'identity/index.json', 'identity/README.md',
  'scripts/identity/catalog-workload-profiles-v2-registry.mjs',
  'test/identity/catalog-workload-profiles-admission-v2.test.mjs',
  'scripts/catalog/asyncapi-admission-v1.mjs',
  'scripts/catalog/catalog-delivery-v1-registry.mjs',
  'scripts/catalog/catalog-operational-recovery-v1-registry.mjs',
  'test/architecture/asyncapi-admission-v1.test.mjs',
  'test/architecture/catalog-delivery.test.mjs',
  'test/architecture/catalog-operational-recovery.test.mjs',
  'test/architecture/catalog-foundation.test.mjs',
  'test/architecture/catalog-lifecycle.test.mjs',
  'test/identity/catalog-recovery-renewal-admission-v2.test.mjs',
  'test/catalog/asyncapi-preservation-v1.test.mjs',
]);
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert.equal(process.argv.length, 2, 'usage: node scripts/identity/catalog-workload-profiles-v2-registry.mjs');
  console.log('F1-08O3 selected H1A v2 admission: ' + JSON.stringify(validateWorkloadPackage()));
}
