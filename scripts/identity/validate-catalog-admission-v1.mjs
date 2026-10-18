import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitReader, operationPointers, parseSource, resolveSelection } from '../../tools/architecture/graph.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const identityAdmissionSource = 'f92a68a0bba46a7d96d69b8af8aa6c0d00187d7a';
export const identityAdmission = [
  ['identity.catalog-history-permissions.http.v1', 'identity/http/private/v1/identity-catalog-history-permissions-v1.yaml', 'http-private', '1.0.0'],
  ['identity.catalog-history-permissions.schema.v1', 'identity/http/shared/v1/identity-catalog-history-permissions-v1.schema.json', 'schema', 'v1'],
  ['identity.catalog-history-permissions.policy.v1', 'identity/http/shared/v1/identity-catalog-history-permissions-v1-policy.json', 'policy', '1'],
  ['identity.catalog-history-permissions.fixtures.v1', 'identity/fixtures/catalog-history-permissions/v1/catalog-history-permissions-v1-vectors.json', 'validation', 'v1'],
  ['identity.catalog-workload-profiles.policy.v1', 'identity/http/shared/v1/identity-catalog-workload-profiles-v1.json', 'policy', '1'],
  ['identity.catalog-workload-profiles.fixtures.v1', 'identity/fixtures/catalog-workload/v1/catalog-workload-profiles-v1-vectors.json', 'validation', 'v1'],
].map(row => Object.freeze(row));
Object.freeze(identityAdmission);
const ids = new Set(identityAdmission.map(([id]) => id));
const source = gitReader(root, identityAdmissionSource);
export const identitySourceRegistry = () => JSON.parse(source('registry/contracts.json'));

// Pure descriptor construction from the immutable source; it does not admit a
// consumer, write a lock or treat the presence of a Git revision as CI evidence.
export function identityAdmissionRows() {
  const baseline = identitySourceRegistry();
  const mappings = new Map(baseline.contracts.flatMap(row => row.uriMappings).map(row => [row.uri, row]));
  const rows = identityAdmission.map(([id, file, surface, version]) => {
    const intent = baseline.planned.find(row => row.id === id);
    assert(intent?.owner === 'identity-tenancy' && intent.domain === 'identity', 'I_SOURCE_INTENTION');
    const bytes = source(file), document = parseSource(bytes, file);
    if (document.$id) {
      assert(!mappings.has(document.$id), 'I_AMBIGUOUS_MAPPING');
      mappings.set(document.$id, { uri: document.$id, path: file });
    }
    return {
      id, domain: 'identity', surface, owner: 'identity-tenancy', status: 'active',
      capability: id.includes('catalog-history-permissions') ? 'identity.catalog-history-permissions' : 'identity.catalog-workload-profiles',
      purpose: 'Admit explicit membership history-permission administration or purpose-bound H1A evidence; no runtime or consumer migration.',
      reasonForChange: 'F1-08I selected admission from audited immutable sources with exact CI verified before this cut.',
      retirement: 'Preserve published bytes; incompatible evolution requires a versioned successor and explicit consumer migration.',
      version, path: file, commit: identityAdmissionSource, tag: null, tagObject: null,
      sha256: sha256(bytes), operations: [...operationPointers(document).keys()], uriMappings: [],
    };
  });
  for (const row of rows) {
    const closure = resolveSelection(source, { ...row, uriMappings: [...mappings.values()] },
      { version: row.version, operations: row.operations, pointers: [''] }, baseline);
    const files = new Set(closure.files.map(file => file.path));
    row.uriMappings = [...mappings.values()].filter(mapping => files.has(mapping.path));
  }
  return rows;
}

// Project only the closed I suffix back to its planned form so historical H
// checks keep their own invariants/errors. The caller must validate the full I
// transition as well; this projection by itself never proves admission.
export function historyRegistryView(registry) {
  if (!registry.contracts.some(row => ids.has(row.id))) return registry;
  return { ...registry, contracts: registry.contracts.filter(row => !ids.has(row.id)),
    planned: [...registry.planned, ...identitySourceRegistry().planned.filter(row => ids.has(row.id))] };
}

export function validateIdentityAdmission(registry = JSON.parse(fs.readFileSync(path.join(root, 'registry/contracts.json'), 'utf8'))) {
  const baseline = identitySourceRegistry();
  const { contracts, planned, ...metadata } = registry;
  const { contracts: prior, planned: priorPlanned, ...priorMetadata } = baseline;
  assert.deepEqual(metadata, priorMetadata, 'I_REGISTRY_METADATA');
  assert.deepEqual(contracts.slice(0, prior.length), prior, 'I_PRIOR_DESCRIPTORS');
  if (contracts.length === prior.length) {
    assert.deepEqual(planned, priorPlanned, 'I_CANDIDATE_INTENTIONS');
    return { phase: 'candidate', admitted: 0, runtime_demonstrated: false };
  }
  const added = contracts.slice(prior.length), expected = identityAdmissionRows();
  assert.deepEqual(added.map(row => row.id), [...ids], 'I_SELECTED_ROOTS');
  assert.deepEqual(planned, priorPlanned.filter(row => !ids.has(row.id)), 'I_REMAINING_INTENTIONS');
  for (const [index, row] of added.entries()) {
    const canonical = expected[index];
    assert.deepEqual([row.path, row.surface, row.version, row.domain, row.owner, row.status],
      [canonical.path, canonical.surface, canonical.version, canonical.domain, canonical.owner, canonical.status], 'I_DESCRIPTOR');
    assert.deepEqual([row.commit, row.tag, row.tagObject, row.sha256],
      [canonical.commit, null, null, canonical.sha256], 'I_PROVENANCE');
    assert.deepEqual(row.operations, canonical.operations, 'I_OPERATIONS');
    assert.deepEqual(row.uriMappings, canonical.uriMappings, 'I_URI_MAPPINGS');
    assert.deepEqual(row, canonical, 'I_EVOLUTION_METADATA');
    const closure = resolveSelection(source, row, { version: row.version, operations: row.operations, pointers: [''] }, registry);
    for (const file of closure.files) {
      assert(!contracts.some(item => item.status === 'draft' && item.path === file.path), 'I_DRAFT_CLOSURE');
      assert.equal(file.sha256, sha256(source(file.path)), 'I_SOURCE_HASH');
      assert.equal(fs.readFileSync(path.join(root, file.path), 'utf8').replaceAll('\r\n', '\n'),
        source(file.path).toString('utf8'), 'I_SOURCE_BYTES');
    }
  }
  return { phase: 'admitted', admitted: added.length, runtime_demonstrated: false };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert.equal(process.argv.length, 2, 'usage: node scripts/identity/validate-catalog-admission-v1.mjs');
  console.log('F1-08I selected admission: ' + JSON.stringify(validateIdentityAdmission()));
}
