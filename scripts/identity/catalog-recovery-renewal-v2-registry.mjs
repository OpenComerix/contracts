import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gitReader,operationPointers,parseSource,resolveSelection} from '../../tools/architecture/graph.mjs';
import {sha256} from '../../tools/architecture/consumer-gate.mjs';
export const root=path.resolve(import.meta.dirname,'../..');
export const renewalBase='a6cf430dcdbafb515fa3f34b29ec5d98b976e0e7';
export const renewalSource='56724471a5460e22d936bd09bef448efe46d87e6';
export const renewalIntentions=['http','schema','policy','fixtures'].map(surface=>({
  id:'identity.catalog-recovery-renewal.'+surface+'.v2',domain:'identity',owner:'identity-tenancy',materializeIn:'F1-08I',status:'planned',
  constraint:'Candidate renewal v2 after one proven direct step-up credential rotation only. Preserve R3 v1, verification v2, all admissions and consumers; separate publication, CI and admission before runtime.',
}));
const ids=new Set(renewalIntentions.map(row=>row.id));
const source=gitReader(root,renewalSource);
export const renewalSourceRegistry=()=>JSON.parse(source('registry/contracts.json'));
export const renewalAdmission=Object.freeze([
  ['http','identity/http/private/v2/identity-catalog-recovery-renewal-v2.yaml','http-private','2.0.0'],
  ['schema','identity/http/shared/v2/identity-catalog-recovery-renewal-v2.schema.json','schema','v2'],
  ['policy','identity/http/shared/v2/identity-catalog-recovery-renewal-v2-policy.json','policy','2'],
  ['fixtures','identity/fixtures/catalog-recovery/v2/catalog-recovery-renewal-v2-vectors.json','validation','v2'],
].map(([surface,...rest])=>Object.freeze(['identity.catalog-recovery-renewal.'+surface+'.v2',...rest])));

// Pure construction from the published source. No lock, consumer or Git write,
// and no inference that a locally available revision has passed CI.
export function renewalAdmissionRows() {
  const baseline=renewalSourceRegistry();
  validateRenewalCandidate(baseline);
  const mappings=new Map(baseline.contracts.flatMap(row=>row.uriMappings).map(row=>[row.uri,row]));
  const rows=renewalAdmission.map(([id,file,surface,version])=>{
    const bytes=source(file),document=parseSource(bytes,file);
    if(document.$id) {
      assert(!mappings.has(document.$id),'RENEWAL_AMBIGUOUS_MAPPING');
      mappings.set(document.$id,{uri:document.$id,path:file});
    }
    return {
      id,domain:'identity',surface,owner:'identity-tenancy',status:'active',
      capability:'identity.catalog-recovery-renewal',
      purpose:'Admit private renewal after one verified direct step-up; no runtime or consumer migration.',
      reasonForChange:'F1-08I selected renewal admission from audited published sources with exact source CI verified before this cut.',
      retirement:'Preserve published bytes; incompatible evolution requires a versioned successor and explicit consumer migration.',
      version,path:file,commit:renewalSource,tag:null,tagObject:null,sha256:sha256(bytes),
      operations:[...operationPointers(document).keys()],uriMappings:[],
    };
  });
  for(const row of rows) {
    const closure=resolveSelection(source,{...row,uriMappings:[...mappings.values()]},
      {version:row.version,operations:row.operations,pointers:['']},baseline);
    const files=new Set(closure.files.map(file=>file.path));
    row.uriMappings=[...mappings.values()].filter(mapping=>files.has(mapping.path));
  }
  return rows;
}

// Validate the complete new transition before projecting only its closed suffix
// for H/I. Older registries pass through, preserving their own adversarial gates.
export function renewalCandidateView(registry) {
  if(!registry.contracts.some(row=>ids.has(row.id))&&!registry.planned.some(row=>ids.has(row.id))) return registry;
  const result=validateRenewalRegistry(registry);
  return result.phase==='candidate'
    ? {...registry,planned:registry.planned.slice(0,-4)}
    : {...registry,contracts:registry.contracts.slice(0,-4)};
}

export function validateRenewalCandidate(registry=JSON.parse(fs.readFileSync(path.join(root,'registry/contracts.json'),'utf8'))) {
  const baseline=JSON.parse(gitReader(root,renewalBase)('registry/contracts.json'));
  assert.deepEqual(registry,{...baseline,planned:[...baseline.planned,...renewalIntentions]},'RENEWAL_REGISTRY_PRESERVATION');
  return {admitted:0,planned:4,prior_roots:115,preserved:236,runtime_demonstrated:false};
}

export function validateRenewalRegistry(registry=JSON.parse(fs.readFileSync(path.join(root,'registry/contracts.json'),'utf8'))) {
  if(!registry.contracts.some(row=>ids.has(row.id))) {
    return {phase:'candidate',...validateRenewalCandidate(registry)};
  }
  const baseline=renewalSourceRegistry();
  const {contracts,planned,...metadata}=registry;
  const {contracts:prior,planned:priorPlanned,...priorMetadata}=baseline;
  assert.deepEqual(metadata,priorMetadata,'RENEWAL_REGISTRY_METADATA');
  assert.deepEqual(contracts.slice(0,prior.length),prior,'RENEWAL_PRIOR_DESCRIPTORS');
  const added=contracts.slice(prior.length),expected=renewalAdmissionRows();
  assert.deepEqual(added.map(row=>row.id),[...ids],'RENEWAL_SELECTED_ROOTS');
  assert.deepEqual(planned,priorPlanned.filter(row=>!ids.has(row.id)),'RENEWAL_REMAINING_INTENTIONS');
  for(const [index,row] of added.entries()) {
    const canonical=expected[index];
    assert.deepEqual([row.commit,row.tag,row.tagObject,row.sha256],
      [canonical.commit,null,null,canonical.sha256],'RENEWAL_PROVENANCE');
    assert.deepEqual(row.operations,canonical.operations,'RENEWAL_OPERATIONS');
    assert.deepEqual(row.uriMappings,canonical.uriMappings,'RENEWAL_URI_MAPPINGS');
    assert.deepEqual(row,canonical,'RENEWAL_DESCRIPTOR');
    const closure=resolveSelection(source,row,{version:row.version,operations:row.operations,pointers:['']},registry);
    for(const file of closure.files) {
      assert(!contracts.some(item=>item.status==='draft'&&item.path===file.path),'RENEWAL_DRAFT_CLOSURE');
      assert.equal(file.sha256,sha256(source(file.path)),'RENEWAL_SOURCE_HASH');
      assert.equal(fs.readFileSync(path.join(root,file.path),'utf8').replaceAll('\r\n','\n'),
        source(file.path).toString('utf8'),'RENEWAL_SOURCE_BYTES');
    }
  }
  return {phase:'admitted',admitted:4,planned:0,prior_roots:115,preserved:236,runtime_demonstrated:false};
}
