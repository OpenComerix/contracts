import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from 'yaml';
import {sourceCandidateDocument} from './internal-auth-v2-admission.mjs';

export const root=path.resolve(import.meta.dirname,'../..');
export const base='e80e760d0ba9f4194beb38a6c385ee35b9675e53';
export const files=Object.freeze({
  api:'identity/http/private/v2/identity-internal-auth-v2.yaml',
  prior:'openapi/identity-internal-auth-v1.yaml',
  policy:'identity/http/shared/v2/identity-workload-token-reuse-policy-v2.json',
  schema:'identity/http/shared/v2/identity-workload-token-reuse-policy-v2.schema.json',
  cases:'identity/fixtures/internal-auth/v2/policy-cases-v2.json',
});
const read=file=>readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const profiles=[
  {client_id:'inventory.sales-process-authority',caller:'inventory',audience:'sales-pos.process-authority'},
  {client_id:'sales-pos.inventory-results',caller:'sales-pos',audience:'inventory.process-results'},
];
export function validatePolicy(policy){
  assert.deepEqual(Object.keys(policy).sort(),['policy_version','status','owner','runtime_demonstrated','production_enabled','contract','supersedes','profiles','storage','lifetime','acquisition','authorization','retirement','errors','activation'].sort(),'Policy field inventory');
  assert.equal(policy.policy_version,2);
  assert.equal(policy.status,'candidate');
  assert.equal(policy.owner,'identity-tenancy');
  assert.equal(policy.runtime_demonstrated,false);
  assert.equal(policy.production_enabled,false);
  assert.equal(policy.contract,files.api);
  assert.equal(policy.supersedes,files.prior);
  assert.deepEqual(policy.profiles,profiles,'Only the two approved fixed-purpose profiles');
  assert.deepEqual(policy.storage,{location:'private_process_ram',entries_per_profile_generation:1,acquisitions_in_flight_per_profile_generation:1,http_cache:false,persistence:false,logs_or_events:false,tenant_or_session_keyed:false});
  assert.deepEqual(policy.lifetime,{maximum_seconds:300,reuse_min_remaining_ms_exclusive:2000,expires_in_anchor:'before_request',effective_expiry:'earliest_verified_exp_wall_and_monotonic_expires_in',sliding_expiry:false,short_token:'use_once_with_remaining_budget',clock_rollback:'discard'});
  assert.deepEqual(policy.acquisition,{trigger:'on_demand',proactive_refresh:false,shared_per_profile_generation:true,waiter_deadlines:'independent',shared_deadline:'fixed_never_extended_by_followers',waiter_cancel:'does_not_cancel_others',late_retired_generation:'discard',restart:'empty'});
  assert.deepEqual(policy.authorization,{verify_credential_each_use:true,verify_at_receiver:true,cache_human_authority:false,cache_step_authority:false,step_authority:'fresh_per_attempt',inventory_authority_http_timeout_ms:1000,sales_result_total_budget_ms:2000});
  assert.deepEqual(policy.retirement,{secret_removal:'blocks_new_issuance_only',maximum_issued_token_seconds:300,existing_token:'may_remain_usable_until_effective_expiry_subject_to_receiver_keys',key_retirement:'receiver_policy_unchanged',jwks_freshness:'existing_inventory_max_30_seconds_less_age_not_a_universal_revocation_guarantee',reconfiguration:'discard_local_entry_and_in_flight_generation'});
  assert.deepEqual(policy.errors,{expired_fallback:false,automatic_operation_retry:false,authentication_rejection:'discard_and_propagate',domain_denial:'propagate_without_oauth_retry'});
  assert.equal(typeof policy.activation,'string');
  assert(policy.activation.includes('Candidate only.'));
  return policy;
}
function normalizeExamples(value,directory){
  if(Array.isArray(value))return value.map(item=>normalizeExamples(item,directory));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='externalValue'?path.posix.normalize(path.posix.join(directory,item)):normalizeExamples(item,directory)]));
}
export function validateWire(api,prior){
  assert.equal(api.info.version,'2.0.0');
  assert.deepEqual(api['x-workload-token-reuse-policy'],{$ref:'../../shared/v2/identity-workload-token-reuse-policy-v2.json'});
  assert(api.info.description.includes('RAM'));
  assert(api.components.headers.NoStore.description.includes('RAM'));
  const current=normalizeExamples(structuredClone(api),path.posix.dirname(files.api));
  const old=normalizeExamples(structuredClone(prior),path.posix.dirname(files.prior));
  delete current['x-workload-token-reuse-policy'];
  for(const document of [current,old]){
    delete document.info.version;
    delete document.info.description;
    delete document.components.headers.NoStore.description;
  }
  assert.deepEqual(current,old,'H1A request/response/security/JWKS wire shape and examples must stay unchanged');
}
export function mutatePolicy(policy,{pointer,value}){
  assert(/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(pointer),'Mutation pointer must be a closed local path');
  const copy=structuredClone(policy),parts=pointer.slice(1).split('/');
  let object=copy;
  for(const part of parts.slice(0,-1)){assert(Object.hasOwn(object,part),'Unknown mutation parent');object=object[part];}
  object[parts.at(-1)]=structuredClone(value);
  return copy;
}
export function readCandidate(){return {api:parse(read(files.api)),prior:parse(read(files.prior)),policy:json(files.policy),schema:json(files.schema),cases:json(files.cases)};}
export function validateCandidate(candidate=readCandidate()){
  validatePolicy(candidate.policy);
  validateWire(candidate.api,candidate.prior);
  assert.equal(candidate.schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(candidate.schema.$id,'https://contracts.opencomerix.example/'+files.schema);
  assert.equal(candidate.cases.format_version,1);
  assert.equal(candidate.cases.runtime_demonstrated,false);
  assert.equal(candidate.cases.positive,files.policy);
  assert.equal(candidate.cases.negative_mutations.length,19);
  assert.equal(new Set(candidate.cases.negative_mutations.map(row=>row.id)).size,19);
  for(const row of candidate.cases.negative_mutations){
    assert(/^[a-z][a-z0-9-]*$/.test(row.id));
    assert.throws(()=>validatePolicy(mutatePolicy(candidate.policy,row)),'Security mutation must be rejected: '+row.id);
  }
  return {candidate:true,profiles:profiles.length,policyNegativeVectors:19,runtime_demonstrated:false};
}
export function verifyPreservation(){
  const published=file=>execFileSync('git',['-C',root,'show',base+':'+file],{maxBuffer:4*1024*1024});
  assert.equal(read(files.prior).replaceAll('\r\n','\n'),published(files.prior).toString('utf8').replaceAll('\r\n','\n'),'Published H1A v1 bytes');
  const priorRegistry=JSON.parse(published('registry/contracts.json'));
  const registry=sourceCandidateDocument('registry/contracts.json',json('registry/contracts.json'));
  for(const key of Object.keys(priorRegistry).filter(key=>key!=='planned'))assert.deepEqual(registry[key],priorRegistry[key],'Existing registry field changed: '+key);
  const priorIds=new Set(priorRegistry.planned.map(row=>row.id));
  assert.deepEqual(registry.planned.filter(row=>priorIds.has(row.id)),priorRegistry.planned,'Existing intentions changed');
  const additions=registry.planned.filter(row=>!priorIds.has(row.id));
  assert.deepEqual(additions.map(row=>[row.id,row.path,row.domain,row.owner,row.materializeIn,row.status]),[
    ['identity.internal-auth.v2',files.api,'identity','identity-tenancy','F1-ECO-M6','planned'],
    ['identity.workload-token-reuse.policy.v2',files.policy,'identity','identity-tenancy','F1-ECO-M6','planned'],
    ['identity.workload-token-reuse.schema.v2',files.schema,'identity','identity-tenancy','F1-ECO-M6','planned'],
    ['identity.internal-auth.fixtures.v2',files.cases,'identity','identity-tenancy','F1-ECO-M6','planned'],
  ],'Only the complete candidate intent set is allowed');
  const oldIndex=JSON.parse(published('identity/index.json')),index=sourceCandidateDocument('identity/index.json',json('identity/index.json'));
  assert.deepEqual({...index,planned:oldIndex.planned},oldIndex,'Existing Identity index changed');
  assert.deepEqual(index.planned,[...oldIndex.planned,...additions.map(row=>row.id)]);
  return {view:'published_source_candidate',publishedV1Preserved:true,existingAdmissionsPreserved:true,planned:additions.length};
}
export function prepareNative(bundleFile){
  const candidate=readCandidate();
  validateCandidate(candidate);
  const bundle=JSON.parse(readFileSync(bundleFile,'utf8'));
  assert.equal(bundle.info.version,'2.0.0');
  const directory=path.join(root,'.ci-artifacts/identity-internal-auth-v2');
  if(existsSync(directory))assert(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink(),'Artifact directory link forbidden');
  mkdirSync(directory,{recursive:true});
  const write=(file,value,raw=false)=>{
    const target=path.join(directory,file);
    if(existsSync(target))assert(lstatSync(target).isFile()&&!lstatSync(target).isSymbolicLink(),'Artifact link forbidden');
    writeFileSync(target,raw?value:JSON.stringify(value,null,2)+'\n');
  };
  const schemas=new Map(),cases=[];
  const add=(id,schema,data,valid=true)=>{
    assert(/^[a-z0-9-]+$/.test(id));
    const normalized={$schema:'https://json-schema.org/draft/2020-12/schema',...schema};
    const encoded=JSON.stringify(normalized),hash=createHash('sha256').update(encoded).digest('hex');
    let name=schemas.get(hash);
    if(!name){name='schema-'+hash.slice(0,16)+'.json';schemas.set(hash,name);write(name,normalized);}
    const fixture='fixture-'+id+'.json';write(fixture,data);cases.push([id,valid?'valid':'invalid',name,fixture]);
  };
  add('reuse-policy',candidate.schema,candidate.policy);
  for(const row of candidate.cases.negative_mutations)add(row.id,candidate.schema,mutatePolicy(candidate.policy,row),false);
  const examples=(entry,id,schema)=>{
    if(Object.hasOwn(entry,'example'))add(id+'-inline',schema,entry.example);
    for(const [name,example] of Object.entries(entry.examples??{})){
      const data=example.externalValue?json(path.posix.normalize(path.posix.join(path.posix.dirname(files.api),example.externalValue))):example.value;
      assert(data!==undefined,'Unresolved example');add((id+'-'+name).replaceAll('_','-'),schema,data);
    }
  };
  for(const [route,pathItem] of Object.entries(bundle.paths))for(const [method,operation] of Object.entries(pathItem)){
    if(!['get','post'].includes(method))continue;
    const prefix=route.endsWith('/token')?'token':'jwks';
    for(const media of Object.values(operation.requestBody?.content??{}))examples(media,prefix+'-request',media.schema);
    for(const [status,response] of Object.entries(operation.responses)){
      for(const media of Object.values(response.content??{}))examples(media,prefix+'-'+status,media.schema);
      for(const [name,header] of Object.entries(response.headers??{}))examples(header,(prefix+'-'+status+'-'+name).toLowerCase(),header.schema);
    }
  }
  add('missing-grant',bundle.components.schemas.ClientCredentialsRequest,json('openapi/examples/identity-internal-auth-v1/token-request-missing-grant-type.json'),false);
  add('private-jwk',bundle.components.schemas.JsonWebKeySet,json('openapi/examples/identity-internal-auth-v1/jwks-private-key-rejected.json'),false);
  assert.equal(cases.filter(row=>row[1]==='valid').length,15,'Complete positive inventory');
  assert.equal(cases.filter(row=>row[1]==='invalid').length,21,'Complete negative inventory');
  write('cases.tsv',cases.map(row=>row.join('\t')).join('\n')+'\n',true);
  return {schemas:schemas.size,positive:15,negative:21,scope:'contract schema examples, not runtime behavior'};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  assert([2,3].includes(process.argv.length),'usage: node scripts/identity/validate-internal-auth-v2.mjs [dereferenced-bundle.json]');
  const result={...validateCandidate(),...verifyPreservation()};
  if(process.argv[2])result.native=prepareNative(process.argv[2]);
  console.log('H1A v2 candidate: '+JSON.stringify(result));
}
