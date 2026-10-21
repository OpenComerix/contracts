import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { gitReader, makeLock, resolveSelection, impactForConsumer } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { root, identityAdmissionSource, identitySourceRegistry, validateIdentityAdmission } from '../../scripts/identity/validate-catalog-admission-v1.mjs';
import { validateHistoryRegistry } from '../../scripts/catalog/validate-history-protection-v1.mjs';
import { foundationBase } from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';

const source = gitReader(root, identityAdmissionSource);
// N separately checks the live tooling files and this exact proof adaptation.
// Keep the original admission comparisons against the immutable pre-N source.
const preN = gitReader(root, '77bc15a4cc8d13867ef5a66945ed8e3de79696cc');
const nToolingFiles = new Set(['catalog/README.md', 'catalog/index.json', 'package.json', 'pnpm-lock.yaml']);
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const liveRegistry = read('registry/contracts.json');
const registry = JSON.parse(gitReader(root, 'a6cf430dcdbafb515fa3f34b29ec5d98b976e0e7')('registry/contracts.json'));
const selected = [
  ['identity.catalog-history-permissions.http.v1', 'identity/http/private/v1/identity-catalog-history-permissions-v1.yaml', 'edc5e3202fcd22165484fd6cd3fd96517d622810f90b92946facb4f181adf70d'],
  ['identity.catalog-history-permissions.schema.v1', 'identity/http/shared/v1/identity-catalog-history-permissions-v1.schema.json', '627e1a7e67e01e6a9441d5174226b878bdd0255dcde3a5f54c2d8288cc00cd78'],
  ['identity.catalog-history-permissions.policy.v1', 'identity/http/shared/v1/identity-catalog-history-permissions-v1-policy.json', '6da050f84136196fe0db8a26ce6b36eb8ee4e1c66e1d1fce2571f1c8d6eec5d1'],
  ['identity.catalog-history-permissions.fixtures.v1', 'identity/fixtures/catalog-history-permissions/v1/catalog-history-permissions-v1-vectors.json', '8bf1e94bb4f0a5d8c8f274a3ac91ea24a683afcc77c409720db51f60624812de'],
  ['identity.catalog-workload-profiles.policy.v1', 'identity/http/shared/v1/identity-catalog-workload-profiles-v1.json', '9d1552e9c3d941e66101be4be993d912c6d4d3207d45c8b93829e6cad7ddc59d'],
  ['identity.catalog-workload-profiles.fixtures.v1', 'identity/fixtures/catalog-workload/v1/catalog-workload-profiles-v1-vectors.json', 'b2158aae641f06e84b43cf16a4fad0c3655d4497443e76b3f174d8198f4a221f'],
];
const dependency = (row, role, operations = row.operations, pointers = ['']) => ({
  formatVersion: 1, service: 'identity-tenancy', contracts: [{ id: row.id, role, version: row.version, operations, pointers,
    purpose: 'Verify selected admission in memory only; do not migrate a consumer.', gates: ['node --test test/identity/*.test.mjs'] }], assets: [], bindings: [],
});
const bytes = manifest => Buffer.from(JSON.stringify(manifest));

test('I admits exactly six roots and preserves all prior registry values and three remaining intentions', () => {
  const previous = identitySourceRegistry();
  assert.equal(previous.contracts.length, 109); assert.equal(previous.preservedFiles.length, 236);
  assert.equal(registry.contracts.length, 115);
  assert.deepEqual(registry.contracts.slice(0, 109), previous.contracts);
  assert.deepEqual(registry.contracts.slice(109).map(row => row.id), selected.map(([id]) => id));
  assert.deepEqual(registry.planned, previous.planned.slice(0, 3));
  assert.deepEqual(registry.planned.map(row => row.id), ['sales.complete-snapshot.successor', 'common.data-lifecycle-policy.v1', 'catalog.history-policy.v1']);
  assert.deepEqual(validateIdentityAdmission(registry), { phase: 'admitted', admitted: 6, runtime_demonstrated: false });
  assert.deepEqual(read('identity/index.json'), domainIndex(liveRegistry, 'identity'));
  assert.deepEqual(validateIdentityAdmission(liveRegistry), { phase: 'admitted', admitted: 6, runtime_demonstrated: false });
});

for (const [id, file, hash] of selected) test('I immutable source, closed graph and pinned regeneration: ' + id, () => {
  const row = registry.contracts.find(item => item.id === id);
  assert.equal(row.path, file); assert.equal(row.sha256, hash); assert.equal(sha256(source(file)), hash);
  assert.equal(row.commit, 'f92a68a0bba46a7d96d69b8af8aa6c0d00187d7a');
  assert.equal(row.tag, null); assert.equal(row.tagObject, null);
  assert.equal(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'), source(file).toString('utf8'));
  for (const role of row.surface === 'validation' ? ['validation'] : ['producer', 'consumer', 'semantic-owner']) {
    const manifest = dependency(row, role), body = bytes(manifest);
    assert.throws(() => makeLock(root, manifest, body, identitySourceRegistry()), /Unknown\/unmaterialized contract/);
    const lock = makeLock(root, manifest, body, registry), entry = lock.entries[0];
    const resolved = resolveSelection(source, row, manifest.contracts[0], registry);
    assert.deepEqual(entry.files, resolved.files); assert.deepEqual(entry.units, resolved.units);
    assert.equal(entry.selectionSha256, resolved.selectionSha256);
    for (const item of entry.files) {
      assert.equal(item.sha256, sha256(source(item.path)));
      assert(!registry.contracts.some(contract => contract.status === 'draft' && contract.path === item.path));
    }
    assert.deepEqual(makeLock(root, manifest, body, registry, lock.entries), lock);
    assert.deepEqual(impactForConsumer({manifest,lock},registry,source), { service:'identity-tenancy', affected:false, dependencies:[] });
  }
});

test('selected GET includes path parameter, both security schemes and only its request context', () => {
  const row = registry.contracts.find(item => item.id === selected[0][0]);
  const manifest = dependency(row, 'producer', ['getCatalogHistoryPermissionAssignment'], []);
  const entry = makeLock(root,manifest,bytes(manifest),registry).entries[0];
  for (const pointer of ['/paths/~1internal~1v1~1identity~1catalog~1history-permissions~1{membership_id}/parameters', '/components/securitySchemes/gatewayServiceBearer', '/components/securitySchemes/currentSessionCookie','/servers'])
    assert(entry.units.some(unit=>unit.path===row.path && unit.pointer===pointer), pointer);
  assert(!entry.units.some(unit=>unit.pointer.endsWith('/put')));
  assert(entry.files.some(file=>file.path==='common/http/shared/v3/problem-details-v3.schema.json'));
  assert(!entry.files.some(file=>file.path.includes('catalog-recovery')));
});

test('draft schema/common dependency fails initial use, pinned regeneration and impact for each functional role', () => {
  const row = registry.contracts.find(item => item.id === selected[0][0]);
  for (const dependencyPath of [selected[1][1], 'common/http/shared/v3/problem-details-v3.schema.json']) {
    const blocked = structuredClone(registry), target = blocked.contracts.find(item=>item.path===dependencyPath);
    assert(target); target.status = 'draft';
    for (const role of ['producer','consumer','semantic-owner']) {
      const manifest=dependency(row,role), body=bytes(manifest), lock=makeLock(root,manifest,body,registry);
      const forbidden = error => error instanceof assert.AssertionError && error.message==='New use of a draft is forbidden: '+target.id;
      assert.throws(()=>makeLock(root,manifest,body,blocked),forbidden);
      assert.throws(()=>makeLock(root,manifest,body,blocked,lock.entries),forbidden);
      const report=impactForConsumer({manifest,lock},blocked,source);
      assert.equal(report.dependencies[0].classification,'unresolved'); assert.equal(report.affected,true);
    }
  }
});

test('I source and historical H admission remain verifiable without enabling runtime', () => {
  assert.deepEqual(validateIdentityAdmission(identitySourceRegistry()), { phase:'candidate', admitted:0, runtime_demonstrated:false });
  assert.deepEqual(validateHistoryRegistry(identitySourceRegistry()), { phase:'admitted',admitted:24 });
  const originalH=JSON.parse(gitReader(root,'e1d073fe5264a4aa97d6d4156ce200101bb20615')('registry/contracts.json'));
  assert.deepEqual(validateHistoryRegistry(originalH), { phase:'admitted',admitted:24 });
});

test('H projection never hides an incomplete or altered I admission', () => {
  for (const [mutate,reason] of [
    [r=>r.contracts.pop(), 'I_SELECTED_ROOTS'],
    [r=>{r.contracts[109].sha256='0'.repeat(64);}, 'I_PROVENANCE'],
    [r=>r.contracts.splice(109,2,...r.contracts.slice(109,111).reverse()), 'I_SELECTED_ROOTS'],
  ]) {
    const changed=structuredClone(registry);mutate(changed);
    assert.throws(()=>validateHistoryRegistry(changed),new RegExp(reason));
  }
});

for (const [name, mutate, reason] of [
  ['partial-package', r=>r.contracts.pop(), 'I_SELECTED_ROOTS'],
  ['duplicate-root', r=>r.contracts.push(structuredClone(r.contracts.at(-1))), 'I_SELECTED_ROOTS'],
  ['reordered-roots', r=>r.contracts.splice(109,2,...r.contracts.slice(109,111).reverse()), 'I_SELECTED_ROOTS'],
  ['unselected-root', r=>r.contracts.push({...r.contracts.at(-1),id:'identity.unapproved'}), 'I_SELECTED_ROOTS'],
  ['missing-entire-package', r=>{r.contracts=r.contracts.slice(0,109);}, 'I_CANDIDATE_INTENTIONS'],
  ['mixed-planned-active', r=>r.planned.push(identitySourceRegistry().planned[3]), 'I_REMAINING_INTENTIONS'],
  ['removed-r1-intention', r=>r.planned.pop(), 'I_REMAINING_INTENTIONS'],
  ['old-descriptor-changed', r=>{r.contracts[0].purpose='changed';}, 'I_PRIOR_DESCRIPTORS'],
  ['old-draft-promoted', r=>{r.contracts.find(row=>row.status==='draft').status='active';}, 'I_PRIOR_DESCRIPTORS'],
  ['preserved-file-removed', r=>r.preservedFiles.pop(), 'I_REGISTRY_METADATA'],
  ['consumer-added', r=>r.requiredConsumers.push('catalog-pricing'), 'I_REGISTRY_METADATA'],
  ['wrong-path', r=>{r.contracts[109].path=selected[1][1];}, 'I_DESCRIPTOR'],
  ['wrong-owner', r=>{r.contracts[109].owner='gateway-bff';}, 'I_DESCRIPTOR'],
  ['wrong-domain', r=>{r.contracts[109].domain='catalog';}, 'I_DESCRIPTOR'],
  ['wrong-version', r=>{r.contracts[109].version='2.0.0';}, 'I_DESCRIPTOR'],
  ['draft-new-root', r=>{r.contracts[109].status='draft';}, 'I_DESCRIPTOR'],
  ['wrong-sha', r=>{r.contracts[109].sha256='0'.repeat(64);}, 'I_PROVENANCE'],
  ['wrong-commit', r=>{r.contracts[109].commit='e1d073fe5264a4aa97d6d4156ce200101bb20615';}, 'I_PROVENANCE'],
  ['invented-tag', r=>{r.contracts[109].tag='catalog-contracts-v1.0.0';}, 'I_PROVENANCE'],
  ['invented-tag-object', r=>{r.contracts[109].tagObject='0'.repeat(40);}, 'I_PROVENANCE'],
  ['missing-operation', r=>r.contracts[109].operations.pop(), 'I_OPERATIONS'],
  ['missing-uri', r=>r.contracts[109].uriMappings.pop(), 'I_URI_MAPPINGS'],
  ['unrelated-uri', r=>r.contracts[109].uriMappings.push({uri:'https://unapproved.example',path:'catalog/http/shared/v1/catalog-common-v1.schema.json'}), 'I_URI_MAPPINGS'],
  ['missing-evolution-metadata', r=>{delete r.contracts[109].retirement;}, 'I_EVOLUTION_METADATA'],
]) test('I gate rejects registry regression: '+name, () => {
  const changed=structuredClone(registry);mutate(changed);assert.throws(()=>validateIdentityAdmission(changed),new RegExp(reason));
});

test('consumer exports, CI jobs, tools, old indexes and all transport sources are unchanged', () => {
  const files=execFileSync('git',['ls-tree','-r','--name-only',identityAdmissionSource],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const keep=files.filter(file=>/^(registry\/consumers\/|tools\/|openapi\/|events\/|commands\/|errors\/|common\/|catalog\/|identity\/(http|fixtures)\/)/.test(file));
  // Preserve the historical admission; F1-08I checks its current identity export separately.
  const historical=gitReader(root,'e3f39131b32ed136b17acea0a3289fad718029d6');
  for (const file of [...keep,'package.json','pnpm-lock.yaml']) {
    const actual=nToolingFiles.has(file) ? preN(file)
      : file==='registry/consumers/index.json' ? gitReader(root,foundationBase)(file)
      : file==='registry/consumers/identity-tenancy.json'
      ? historical(file) : fs.readFileSync(path.join(root,file));
    assert.equal(actual.toString('utf8').replaceAll('\r\n','\n'),source(file).toString('utf8'),file);
  }
  const ci=parse(preN('.gitlab-ci.yml').toString('utf8'));
  assert.equal(Object.keys(ci).filter(key=>key.startsWith('validate:')).length,12);
});
