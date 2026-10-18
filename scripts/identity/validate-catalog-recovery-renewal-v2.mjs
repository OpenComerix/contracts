import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parse} from 'yaml';
import {extractSchema} from '../catalog/validate-history-recovery-v1.mjs';
import {renew} from './catalog-recovery-renewal-v2-semantics.mjs';
import {root,renewalBase,validateRenewalCandidate} from './catalog-recovery-renewal-v2-registry.mjs';
export {root};
export const apiPath='identity/http/private/v2/identity-catalog-recovery-renewal-v2.yaml';
export const schemaPath='identity/http/shared/v2/identity-catalog-recovery-renewal-v2.schema.json';
export const policyPath='identity/http/shared/v2/identity-catalog-recovery-renewal-v2-policy.json';
export const vectorsPath='identity/fixtures/catalog-recovery/v2/catalog-recovery-renewal-v2-vectors.json';
export const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
export const scenario=()=>read(vectorsPath).positive;
export function change(input,changes) {
  const copy=structuredClone(input);
  for(const [address,value] of Object.entries(changes)) {
    const parts=address.split('.'); const parent=parts.slice(0,-1).reduce((node,key)=>node[key],copy);
    parent[parts.at(-1)]=structuredClone(value);
  }
  return copy;
}
const strip=value=>Array.isArray(value)?value.map(strip):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['$schema','$id'].includes(key)).map(([key,child])=>[key,strip(child)])):value;
export function validatePolicy(policy=read(policyPath)) {
  assert.equal(policy.policy_version,2);assert.equal(policy.status,'candidate');assert.equal(policy.owner,'identity-tenancy');
  assert.equal(policy.runtime_demonstrated,false);assert.equal(policy.production_enabled,false);
  assert.deepEqual(policy.workload,{caller:'gateway-bff',audience:'identity-tenancy.catalog-recovery',type:'service',cookie:'__Host-oc_session'});
  assert.deepEqual(policy.rules,{
    original_grant:'active-unexpired-unchanged',binding:'exact-account-session-organization-membership-device-selection-destination-purpose-permissions',
    other_authority_versions:'all-must-match',mfa_maximum_age_seconds:300,new_mfa_after_original_issuance:true,new_decision_required:true,
    credential_exception:'one-direct-completed-step-up-only',rotation_operation:'completeSessionStepUp',rotation_origin:'identity-local-step-up-transaction',
    rotation_atomicity:['credential-rotation','mfa-consumption','rotation-evidence','mandatory-audit'],credential_hashes:'server-side-digests-only-never-wire',
    credential_versions:'before-equals-original-after-equals-current-and-before-plus-one',missing_or_ambiguous_proof:'fail-closed',
    unchanged_credential:'original-fresh-MFA-renewal-checks-no-bridge',old_grant:'never-extend-rehabilitate-or-rewrite',
    new_grant:'distinct-id-reference-current-snapshot-valid-1-to-900-second-interval',verification:'v1-and-v2-remain-unchanged-no-credential-bridge',retries:'no-automatic-retry-of-uncertain-issuance',
  },'RENEWAL_POLICY_RULES');
  const retention=policy.rotation_retention;
  assert.deepEqual([retention.anchor,retention.seconds,retention.minimum_seconds,retention.maximum_seconds,retention.extend_on_read_or_renewal],['source-grant-original-expires-at',86400,86400,86400,false],'RENEWAL_RETENTION');
  assert.match(retention.purge,/independent audit/);
  assert.deepEqual(policy.field_inventory.map(row=>row.path).sort(),['/$defs/Grant','/$defs/Problem','/$defs/RenewRequest','/storage_inventory/rotation_evidence'].sort(),'RENEWAL_CLASSIFICATION');
  const storage=['proof_id','audit_id','operation','origin','account_id','session_id','organization_id','membership_id','device_id','mfa_event_id','occurred_at','before_credential_version','after_credential_version','before_credential_hash','after_credential_hash','source_grant_id','source_grant_original_expires_at'];
  assert.deepEqual(policy.storage_inventory.rotation_evidence,storage,'RENEWAL_STORAGE');
  for(const row of policy.field_inventory) {
    const profile=policy.profiles[row.profile];assert(profile,row.path);
    assert.equal(profile.owner,'identity-tenancy');assert.equal(profile.sensitivity,'RESTRICTED');assert.equal(profile.log_policy,'prohibited-values');
    for(const key of ['categories','purpose','base','consumers','access','encryption','retention','export_correction','third_parties_regions'])assert(profile[key],row.path+':'+key);
  }
  assert.deepEqual(policy.source_pins.map(pin=>pin.path).sort(),[
    'identity/http/private/v1/identity-catalog-recovery-authority-v1.yaml','identity/http/shared/v1/identity-catalog-recovery-authority-v1.schema.json',
    'identity/fixtures/catalog-recovery/v1/catalog-recovery-authority-v1-fixtures.json','identity/http/private/v2/identity-catalog-recovery-verification-v2.yaml',
    'identity/http/shared/v2/identity-catalog-recovery-verification-v2.schema.json','identity/http/shared/v1/identity-catalog-workload-profiles-v1.json',
  ].sort(),'RENEWAL_SOURCE_COVERAGE');
  for(const pin of policy.source_pins) {
    assert.equal(pin.commit,renewalBase,'RENEWAL_SOURCE_REVISION');
    const bytes=execFileSync('git',['show',pin.commit+':'+pin.path],{cwd:root,maxBuffer:2*1024*1024});
    assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,'RENEWAL_SOURCE_HASH');
    assert.equal(fs.readFileSync(path.join(root,pin.path),'utf8').replaceAll('\r\n','\n'),bytes.toString('utf8'),'RENEWAL_SOURCE_BYTES');
  }
}

export function validateContract(bundle) {
  validatePolicy();validateRenewalCandidate();
  const api=parse(fs.readFileSync(path.join(root,apiPath),'utf8')), schema=read(schemaPath), vectors=read(vectorsPath);
  assert.equal(api.openapi,'3.1.0');assert.equal(api.info.version,'2.0.0');
  assert.deepEqual(Object.keys(api.paths),['/internal/v2/identity/catalog/recovery-grants/{grant_id}/renew']);
  const operation=Object.values(api.paths)[0].post;
  assert.equal(operation.operationId,'renewCatalogRecoveryGrantV2');
  assert.deepEqual(operation['x-workload'],{caller:'gateway-bff',audience:'identity-tenancy.catalog-recovery',type:'service'});
  assert.deepEqual(operation.security,[{gatewayServiceBearer:[],currentSessionCookie:[]}]);
  assert.equal(api.components.securitySchemes.currentSessionCookie.name,'__Host-oc_session');
  assert.deepEqual(Object.keys(operation.responses).map(Number),[201,400,401,403,404,409,410,503]);
  assert.deepEqual(Object.keys(schema.$defs),['RenewRequest','Grant','Problem']);
  for(const key of Object.keys(schema.$defs))assert.deepEqual(schema.$defs[key],{$ref:'../v1/identity-catalog-recovery-authority-v1.schema.json#/$defs/'+key});
  assert.equal(vectors.runtime_demonstrated,false);assert.equal(vectors.status,'planned');
  assert.equal(new Set(vectors.negative.map(row=>row.id)).size,vectors.negative.length);
  const input=scenario(), original=structuredClone(input), result=renew(input);
  assert.deepEqual(result,{response:input.grant,previous_grant_changed:false});assert.deepEqual(input,original);
  for(const row of vectors.negative)assert.equal(renew(change(input,row.changes)).rejection,row.expected,row.id);
  if(bundle) {
    const bundled=Object.values(bundle.paths)[0].post;
    assert.deepEqual(strip(bundled.requestBody.content['application/json'].schema),strip(extractSchema('RenewRequest',schemaPath)),'RENEWAL_BUNDLE_REQUEST');
    assert.deepEqual(strip(bundled.responses['201'].content['application/json'].schema),strip(extractSchema('Grant',schemaPath)),'RENEWAL_BUNDLE_GRANT');
    assert.equal(bundled.responses['201'].headers['Cache-Control'].schema.const,'no-store');
  }
  return {semantic_negatives:vectors.negative.length,runtime_demonstrated:false};
}

export function prepare(output,bundle) {
  const summary=validateContract(bundle);assert(!fs.existsSync(output),'RENEWAL_OUTPUT_EXISTS');
  const input=scenario(), cases=[];
  const add=(definition,id,expected,value)=>cases.push({definition,id,expected,value});
  for(const [definition,value] of Object.entries({RenewRequest:input.request,Grant:renew(input).response,Problem:{type:'urn:opencomerix:problem:identity_catalog_recovery_not_authorized',title:'Autoridad de recuperación rechazada',status:403,code:'identity_catalog_recovery_not_authorized',retryable:false}})) {
    add(definition,definition+'-valid','accept',value);
    for(const key of Object.keys(value)) {const missing=structuredClone(value);delete missing[key];add(definition,definition+'-missing-'+key,'reject',missing);}
    add(definition,definition+'-extra','reject',{...value,unsafe_extra:true});
  }
  add('RenewRequest','request-proof-injection','reject',{...input.request,rotation:input.rotation});
  add('RenewRequest','request-version-injection','reject',{...input.request,session_credential_version:'4'});
  add('RenewRequest','request-purpose-permission','reject',{...input.request,requested_permissions:['catalog.history.configure']});
  add('Grant','grant-zero-lifetime','reject',{...input.grant,lifetime_seconds:0});
  add('Grant','grant-too-long','reject',{...input.grant,lifetime_seconds:901});
  add('Grant','grant-credential-leak','reject',{...input.grant,credential_hash:input.context.session.credential_hash});
  add('Grant','grant-invalid-reference','reject',{...input.grant,grant_reference:'wrong'});
  add('Grant','grant-invalid-date','reject',{...input.grant,issued_at:'tomorrow'});
  const configure=structuredClone(input);
  for(const object of [configure.request,configure.previous_grant,configure.grant])object.binding.purpose='restricted-history-configuration';
  configure.request.requested_permissions=configure.previous_grant.permissions=configure.grant.permissions=['catalog.history.configure'];
  assert(renew(configure).response);add('Grant','grant-configure','accept',renew(configure).response);add('RenewRequest','request-configure','accept',configure.request);
  fs.mkdirSync(output,{recursive:true});
  for(const definition of ['RenewRequest','Grant','Problem'])fs.writeFileSync(path.join(output,definition+'.schema.json'),JSON.stringify(extractSchema(definition,schemaPath))+'\n',{flag:'wx'});
  for(const row of cases)fs.writeFileSync(path.join(output,row.id+'.json'),JSON.stringify(row.value)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(output,'cases.tsv'),cases.map(row=>[row.id,row.expected,row.definition+'.schema.json',row.id+'.json'].join('\t')).join('\n')+'\n',{flag:'wx'});
  return {...summary,schema_positive:cases.filter(row=>row.expected==='accept').length,schema_negative:cases.filter(row=>row.expected==='reject').length};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  assert.equal(process.argv.length,4,'usage: node scripts/identity/validate-catalog-recovery-renewal-v2.mjs <new-output> <real-dereferenced-bundle>');
  const output=path.resolve(process.argv[2]);assert(output.startsWith(path.join(root,'.ci-artifacts')+path.sep),'RENEWAL_OUTPUT_SCOPE');
  console.log('F1-08I renewal v2 gate passed: '+JSON.stringify(prepare(output,JSON.parse(fs.readFileSync(process.argv[3],'utf8')))));
}
