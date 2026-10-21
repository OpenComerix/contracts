import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,renewalBase,renewalSource,renewalSourceRegistry,renewalCandidateView,
  validateRenewalCandidate,validateRenewalRegistry} from '../../scripts/identity/catalog-recovery-renewal-v2-registry.mjs';
import {gitReader,makeLock,resolveSelection,impactForConsumer} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {sha256} from '../../tools/architecture/consumer-gate.mjs';
import {validateIdentityAdmission} from '../../scripts/identity/validate-catalog-admission-v1.mjs';
import {validateHistoryRegistry} from '../../scripts/catalog/validate-history-protection-v1.mjs';
import {foundationBase,foundationRegistryView} from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';
import {validateContract as validateRecoveryContract} from '../../scripts/catalog/validate-history-recovery-v1.mjs';

const registry=JSON.parse(fs.readFileSync(path.join(root,'registry/contracts.json'),'utf8'));
const baseline=renewalSourceRegistry(),source=gitReader(root,renewalSource);
// N independently checks live tooling and this exact proof adaptation.
const preN=gitReader(root,'77bc15a4cc8d13867ef5a66945ed8e3de79696cc');
const nToolingFiles=new Set(['.gitlab-ci.yml','catalog/README.md','package.json','pnpm-lock.yaml']);
const selected=[
  ['identity.catalog-recovery-renewal.http.v2','identity/http/private/v2/identity-catalog-recovery-renewal-v2.yaml','http-private','2.0.0','b3d2dbaea72884ff736e413228e15e0c5643ad53fe09dcb6d9fc7b81d5e9312f',5],
  ['identity.catalog-recovery-renewal.schema.v2','identity/http/shared/v2/identity-catalog-recovery-renewal-v2.schema.json','schema','v2','e9cc0bd60958e0a05ad9a84532db6b1cedd094d3c5d8acdb4fe2ca04e868654f',3],
  ['identity.catalog-recovery-renewal.policy.v2','identity/http/shared/v2/identity-catalog-recovery-renewal-v2-policy.json','policy','2','335e7af3e2df7c0d4ff0544672f7c32adb2244dd7826e9a7c0bf26d4fef1d84e',1],
  ['identity.catalog-recovery-renewal.fixtures.v2','identity/fixtures/catalog-recovery/v2/catalog-recovery-renewal-v2-vectors.json','validation','v2','4a69548779e4b9dc04ac8a8312513a5d197a7ab4272198d136137e66e7c0ad42',1],
];
const manifest=(row,role,operations=row.operations,pointers=[''])=>({formatVersion:1,service:'identity-tenancy',
  contracts:[{id:row.id,role,version:row.version,operations,pointers,purpose:'Test selected admission in memory; no consumer migration.',gates:['node --test test/identity/*.test.mjs']}],assets:[],bindings:[]});
const bytes=value=>Buffer.from(JSON.stringify(value));
const first=r=>r.contracts.find(row=>row.id===selected[0][0]);

test('renewal admission is exactly four roots; prior descriptors, metadata and three intentions survive unchanged',()=>{
  assert.deepEqual(validateRenewalRegistry(),{phase:'admitted',admitted:4,planned:0,prior_roots:115,preserved:236,runtime_demonstrated:false});
  assert.equal(registry.contracts.length,119);assert.equal(registry.preservedFiles.length,236);
  const {contracts,planned,...metadata}=foundationRegistryView(registry),{contracts:prior,planned:oldPlanned,...oldMetadata}=baseline;
  assert.deepEqual(metadata,oldMetadata);assert.deepEqual(contracts.slice(0,115),prior);
  assert.deepEqual(contracts.slice(115).map(row=>row.id),selected.map(([id])=>id));
  assert.deepEqual(planned,oldPlanned.slice(0,3));
  assert.deepEqual(planned.map(row=>row.id),['sales.complete-snapshot.successor','common.data-lifecycle-policy.v1','catalog.history-policy.v1']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'identity/index.json'),'utf8')),domainIndex(registry,'identity'));
});

test('historical source candidate and complete current admission are checked before the same H/I projection',()=>{
  assert.equal(validateRenewalCandidate(baseline).admitted,0);
  assert.equal(validateRenewalRegistry(baseline).phase,'candidate');
  const prior=JSON.parse(gitReader(root,renewalBase)('registry/contracts.json'));
  assert.deepEqual(renewalCandidateView(baseline),prior);
  assert.deepEqual(renewalCandidateView(registry),prior);
  assert.equal(validateIdentityAdmission(registry).admitted,6);
  assert.equal(validateHistoryRegistry(registry).admitted,24);
  // Removing the entire transition must not pass the current renewal gate,
  // while older H/I registries remain independently meaningful to their gates.
  assert.throws(()=>validateRenewalRegistry(prior),/RENEWAL_REGISTRY_PRESERVATION/);
});

for(const [id,file,surface,version,hash,fileCount] of selected) test('renewal source and closed lock stay pinned: '+id,()=>{
  const row=registry.contracts.find(item=>item.id===id);
  assert.deepEqual([row.path,row.surface,row.version,row.owner,row.domain,row.status],[file,surface,version,'identity-tenancy','identity','active']);
  assert.deepEqual([row.commit,row.tag,row.tagObject,row.sha256],[renewalSource,null,null,hash]);
  assert.equal(sha256(source(file)),hash);
  for(const role of ['producer','consumer','semantic-owner','validation','documentation']) {
    const m=manifest(row,role),body=bytes(m);
    assert.throws(()=>makeLock(root,m,body,baseline),/Unknown\/unmaterialized contract/);
    const lock=makeLock(root,m,body,registry),entry=lock.entries[0];
    const resolved=resolveSelection(source,row,m.contracts[0],registry);
    assert.equal(entry.commit,renewalSource);assert.equal(entry.files.length,fileCount);
    assert.deepEqual(entry.files,resolved.files);assert.deepEqual(entry.units,resolved.units);
    assert.equal(entry.selectionSha256,resolved.selectionSha256);assert.equal(entry.runtimeSha256,resolved.runtimeSha256);
    assert.deepEqual(makeLock(root,m,body,registry,lock.entries),lock);
    assert.deepEqual(impactForConsumer({manifest:m,lock},registry,source),{service:'identity-tenancy',affected:false,dependencies:[]});
    for(const item of entry.files) {
      assert.equal(item.sha256,sha256(source(item.path)));
      assert(!registry.contracts.some(contract=>contract.status==='draft'&&contract.path===item.path));
      assert.equal(fs.readFileSync(path.join(root,item.path),'utf8').replaceAll('\r\n','\n'),source(item.path).toString('utf8'));
    }
  }
});

test('operation selection includes both credentials, grant parameter and server without selecting v1 operations',()=>{
  const row=first(registry),m=manifest(row,'producer',['renewCatalogRecoveryGrantV2'],[]);
  const entry=makeLock(root,m,bytes(m),registry).entries[0];
  for(const pointer of ['/components/securitySchemes/gatewayServiceBearer','/components/securitySchemes/currentSessionCookie','/components/parameters/GrantId','/servers'])
    assert(entry.units.some(unit=>unit.path===row.path&&unit.pointer===pointer),pointer);
  assert(!entry.units.some(unit=>unit.path.includes('/private/v1/')&&unit.pointer.startsWith('/paths/')));
  assert(entry.files.some(file=>file.path===selected[1][1]));
  assert(entry.files.some(file=>file.path==='catalog/http/shared/v1/catalog-history-recovery-v1.schema.json'));
  const unrelated=manifest(row,'producer',['issueCatalogRecoveryGrant'],[]);
  assert.throws(()=>makeLock(root,unrelated,bytes(unrelated),registry),/Unknown selected operation/);
});

test('transitive drafts still block functional use, pinned regeneration and impact',()=>{
  for(const targetId of ['identity.catalog-recovery-authority.v1.schema','catalog.history-recovery.schema.v1']) {
    const blocked=structuredClone(registry);blocked.contracts.find(row=>row.id===targetId).status='draft';
    for(const role of ['producer','consumer','semantic-owner']) {
      const row=first(registry),m=manifest(row,role),body=bytes(m),lock=makeLock(root,m,body,registry);
      const forbidden=error=>error instanceof assert.AssertionError&&error.message==='New use of a draft is forbidden: '+targetId;
      assert.throws(()=>makeLock(root,m,body,blocked),forbidden);
      assert.throws(()=>makeLock(root,m,body,blocked,lock.entries),forbidden);
      const report=impactForConsumer({manifest:m,lock},blocked,source);
      assert.equal(report.affected,true);assert.equal(report.dependencies[0].classification,'unresolved');
    }
  }
});

test('live R4 entry point recognizes the full renewal admission and rejects changes before historical projection',()=>{
  assert.equal(validateRecoveryContract(registry).runtime_demonstrated,false);
  for(const mutate of [r=>r.contracts.pop(),r=>{first(r).sha256='0'.repeat(64);},
    r=>r.contracts.splice(r.contracts.findIndex(row=>row.id==='catalog.history-recovery.http.v1'),1),
    r=>{r.contracts.find(row=>row.id==='identity.catalog-recovery-verification.http.v2').status='draft';}]) {
    const changed=structuredClone(registry);mutate(changed);
    assert.throws(()=>validateRecoveryContract(changed),/RENEWAL_SELECTED_ROOTS|RENEWAL_PROVENANCE|RENEWAL_PRIOR_DESCRIPTORS/);
  }
});

for(const [name,mutate,reason] of [
  ['partial',r=>r.contracts.pop(),'RENEWAL_SELECTED_ROOTS'],
  ['duplicate',r=>r.contracts.push(structuredClone(first(r))),'RENEWAL_SELECTED_ROOTS'],
  ['reordered',r=>r.contracts.splice(115,2,...r.contracts.slice(115,117).reverse()),'RENEWAL_SELECTED_ROOTS'],
  ['unknown-root',r=>r.contracts.push({...first(r),id:'identity.unapproved'}),'RENEWAL_SELECTED_ROOTS'],
  ['mixed-planned',r=>r.planned.push(baseline.planned.at(-1)),'RENEWAL_REMAINING_INTENTIONS'],
  ['old-planned-removed',r=>r.planned.pop(),'RENEWAL_REMAINING_INTENTIONS'],
  ['unapproved-planned',r=>r.planned.push({id:'identity.unapproved',status:'planned'}),'RENEWAL_REMAINING_INTENTIONS'],
  ['old-descriptor',r=>{r.contracts[0].purpose='changed';},'RENEWAL_PRIOR_DESCRIPTORS'],
  ['old-draft',r=>{r.contracts.find(row=>row.status==='draft').status='active';},'RENEWAL_PRIOR_DESCRIPTORS'],
  ['preserved-file',r=>r.preservedFiles.pop(),'RENEWAL_REGISTRY_METADATA'],
  ['consumer-coverage',r=>r.requiredConsumers.push('catalog-pricing'),'RENEWAL_REGISTRY_METADATA'],
  ['wrong-commit',r=>{first(r).commit=renewalBase;},'RENEWAL_PROVENANCE'],
  ['wrong-hash',r=>{first(r).sha256='0'.repeat(64);},'RENEWAL_PROVENANCE'],
  ['invented-tag',r=>{first(r).tag='catalog-contracts-v1.0.0';},'RENEWAL_PROVENANCE'],
  ['invented-tag-object',r=>{first(r).tagObject='0'.repeat(40);},'RENEWAL_PROVENANCE'],
  ['missing-operation',r=>{first(r).operations=[];},'RENEWAL_OPERATIONS'],
  ['unknown-operation',r=>first(r).operations.push('issueCatalogRecoveryGrant'),'RENEWAL_OPERATIONS'],
  ['missing-uri',r=>first(r).uriMappings.pop(),'RENEWAL_URI_MAPPINGS'],
  ['redirected-uri',r=>{first(r).uriMappings[0].path=selected[1][1];},'RENEWAL_URI_MAPPINGS'],
  ['unrelated-uri',r=>first(r).uriMappings.push({uri:'https://unapproved.example',path:selected[2][1]}),'RENEWAL_URI_MAPPINGS'],
  ['wrong-path',r=>{first(r).path=selected[1][1];},'RENEWAL_DESCRIPTOR'],
  ['wrong-version',r=>{first(r).version='3.0.0';},'RENEWAL_DESCRIPTOR'],
  ['wrong-owner',r=>{first(r).owner='gateway-bff';},'RENEWAL_DESCRIPTOR'],
  ['wrong-domain',r=>{first(r).domain='catalog';},'RENEWAL_DESCRIPTOR'],
  ['draft-root',r=>{first(r).status='draft';},'RENEWAL_DESCRIPTOR'],
  ['missing-purpose',r=>{delete first(r).purpose;},'RENEWAL_DESCRIPTOR'],
]) test('renewal and H/I entry points reject altered admission: '+name,()=>{
  const changed=structuredClone(registry);mutate(changed);
  for(const validate of [validateRenewalRegistry,renewalCandidateView,validateIdentityAdmission,validateHistoryRegistry])
    assert.throws(()=>validate(changed),new RegExp(reason));
});

test('all source payloads, semantic oracles, generic tools, CI, consumers and other indexes retain published bytes',()=>{
  const files=execFileSync('git',['ls-tree','-r','--name-only',renewalSource],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const excluded=new Set(['registry/contracts.json','identity/index.json','identity/README.md','registry/README.md',
    'scripts/identity/catalog-recovery-renewal-v2-registry.mjs','scripts/identity/validate-catalog-recovery-renewal-v2.mjs',
    'test/identity/catalog-recovery-renewal-v2.test.mjs','test/identity/catalog-recovery-renewal-admission-v2.test.mjs',
    'test/identity/candidate-preservation.test.mjs','test/catalog/history-recovery-v1.test.mjs']);
  // Only these historical proofs evolved with F1-08I; live sources and other consumers stay strict.
  const historical=gitReader(root,'e3f39131b32ed136b17acea0a3289fad718029d6');
  const producerProofs=new Set(['registry/consumers/identity-tenancy.json',
    'test/architecture/catalog-admission.test.mjs','test/identity/catalog-admission-v1.test.mjs']);
  const ciHead=execFileSync('git',['show','ff393889f32426d3674a92ae0bd4a30b50077d18:.gitlab-ci.yml'],{cwd:root,encoding:'utf8'});
  const profileV1='    - node scripts/identity/validate-catalog-workload-profiles-v1.mjs\n';
  assert(ciHead.includes(profileV1),'F1-08M base CI must contain the published v1 profile gate');
  const expectedCi=ciHead.replace(profileV1,profileV1+'    - node scripts/identity/validate-catalog-workload-profiles-v2.mjs\n');
  for(const file of files.filter(file=>!excluded.has(file))) {
    const actual=nToolingFiles.has(file) ? preN(file)
      : file==='registry/consumers/index.json' ? gitReader(root,foundationBase)(file)
      : producerProofs.has(file) ? historical(file) : fs.readFileSync(path.join(root,file));
    const expected=file==='.gitlab-ci.yml' ? expectedCi : source(file).toString('utf8');
    assert.equal(actual.toString('utf8').replaceAll('\r\n','\n'),expected,file);
  }
});
