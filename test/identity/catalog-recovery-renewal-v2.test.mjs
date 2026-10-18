import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parse} from 'yaml';
import {renew,assessRenewal} from '../../scripts/identity/catalog-recovery-renewal-v2-semantics.mjs';
import {assess as assessV1} from '../../scripts/identity/catalog-recovery-authority-v1-semantics.mjs';
import {verify as verifyV2} from '../../scripts/identity/catalog-recovery-verification-v2-semantics.mjs';
import {root,read,scenario,change,validatePolicy,validateContract,prepare,policyPath,vectorsPath} from '../../scripts/identity/validate-catalog-recovery-renewal-v2.mjs';
import {renewalBase,renewalSource,renewalIntentions,renewalCandidateView,validateRenewalCandidate} from '../../scripts/identity/catalog-recovery-renewal-v2-registry.mjs';
import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {validateIdentityAdmission} from '../../scripts/identity/validate-catalog-admission-v1.mjs';
import {validateHistoryRegistry} from '../../scripts/catalog/validate-history-protection-v1.mjs';
const vectors=read(vectorsPath), liveRegistry=read('registry/contracts.json');
// Keep the published planned lifecycle independently testable after admission.
const registry=JSON.parse(gitReader(root,renewalSource)('registry/contracts.json'));
const source=gitReader(root,renewalBase), baseline=JSON.parse(source('registry/contracts.json'));

test('renewal v2 contract, policy, source pins and complete negative inventory agree',()=>validateContract());
for(const row of vectors.negative) test('renewal v2 rejects: '+row.id,()=>assert.equal(assessRenewal(change(scenario(),row.changes)),row.expected));

test('v2 accepts one proven direct step-up; the unchanged v1 oracle still rejects its rotated credential',()=>{
  const value=scenario(), original=structuredClone(value);
  assert.equal(assessV1({...value,operation:'renew'}),'identity_catalog_recovery_not_authorized');
  const result=renew(value);
  assert.deepEqual(result,{response:value.grant,previous_grant_changed:false});
  assert.deepEqual(value,original);
  result.response.binding.selection.versions.push('10');assert.deepEqual(value,original);
});

test('unchanged credential keeps original fresh-MFA semantics; changing only the hash still fails',()=>{
  const value=scenario();delete value.rotation;
  value.context.session.credential_version=value.previous_grant.authority.session_credential_version;
  value.grant.authority.session_credential_version=value.context.session.credential_version;
  assert.equal(assessRenewal(value),'identity_catalog_recovery_not_authorized');
  value.context.session.credential_hash=value.previous_state.credential_hash;
  assert.equal(assessRenewal(value),null);
  assert.equal(assessV1({...value,operation:'renew'}),null);
  value.rotation=scenario().rotation;assert.equal(assessRenewal(value),'identity_catalog_recovery_not_authorized');
});

test('a skipped version or list of rotation proofs cannot become a direct transition',()=>{
  const value=scenario();value.context.session.credential_version=value.grant.authority.session_credential_version=value.rotation.after.credential_version='5';
  assert.equal(assessRenewal(value),'identity_catalog_recovery_not_authorized');
  const chain=scenario();chain.rotation=[chain.rotation,structuredClone(chain.rotation)];
  assert.equal(assessRenewal(chain),'identity_catalog_recovery_not_authorized');
});

test('MFA accepts the exact 300-second boundary and rejects one millisecond later',()=>{
  const value=scenario();value.context.now='2026-10-16T12:15:00.000Z';assert.equal(assessRenewal(value),null);
  value.context.now='2026-10-16T12:15:00.001Z';assert.equal(assessRenewal(value),'identity_catalog_recovery_mfa_required');
});

test('grant interval and identity clock are checked independently of structural date validation',()=>{
  for(const changes of [
    {'grant.expires_at':'2026-10-16T12:10:00Z'},
    {'grant.issued_at':'2026-10-16T12:09:59Z','grant.expires_at':'2026-10-16T12:24:59Z'},
    {'grant.issued_at':'2026-10-16T12:10:02Z','grant.expires_at':'2026-10-16T12:25:02Z'},
    {'grant.authority.organization_version':'5'},
    {'grant.authority.decision_id':scenario().previous_grant.authority.decision_id},
  ])assert.equal(assessRenewal(change(scenario(),changes)),'identity_catalog_recovery_invalid_request');
});

test('verification v1/v2 never inherit the credential exception or rehabilitate the old grant',()=>{
  const input=scenario(), context={...input.context,workload_caller:'catalog-pricing'};
  const request={grant_reference:input.previous_grant.grant_reference,binding:input.previous_grant.binding,required_permission:'catalog.history.recover',checked_at:context.now};
  assert.equal(assessV1({operation:'verify',grant:input.previous_grant,context,request}),'identity_catalog_recovery_not_authorized');
  assert.equal(verifyV2({grant:input.previous_grant,context,request}).rejection,'identity_catalog_recovery_not_authorized');
  const next=renew(input).response;
  assert.equal(verifyV2({grant:next,context,request:{...request,grant_reference:next.grant_reference}}).response.issued_at,next.issued_at);
});

test('missing/malformed trusted records fail closed without incidental TypeError',()=>{
  for(const value of [null,{}, {context:{authority_available:true}},change(scenario(),{'context.now':'invalid'}),change(scenario(),{'rotation.before':null}),change(scenario(),{'context.account.active':'true'})]) {
    const rejection=assessRenewal(value);assert.equal(typeof rejection,'string');
    assert(rejection.startsWith('identity_catalog_recovery_'));
  }
});

for(const [name,mutate,reason] of [
  ['credential wildcard',p=>{p.rules.credential_exception='any-rotation';},'RENEWAL_POLICY_RULES'],
  ['skip audit',p=>p.rules.rotation_atomicity.pop(),'RENEWAL_POLICY_RULES'],
  ['longer MFA',p=>{p.rules.mfa_maximum_age_seconds=900;},'RENEWAL_POLICY_RULES'],
  ['verification bridge',p=>{p.rules.verification='allow-bridge';},'RENEWAL_POLICY_RULES'],
  ['extend retention',p=>{p.rotation_retention.extend_on_read_or_renewal=true;},'RENEWAL_RETENTION'],
  ['unknown storage',p=>p.storage_inventory.rotation_evidence.push('raw_credential'),'RENEWAL_STORAGE'],
  ['omit classification',p=>p.field_inventory.pop(),'RENEWAL_CLASSIFICATION'],
  ['wrong source hash',p=>{p.source_pins[0].sha256='0'.repeat(64);},'RENEWAL_SOURCE_HASH'],
])test('renewal policy rejects '+name,()=>{const p=read(policyPath);mutate(p);assert.throws(()=>validatePolicy(p),new RegExp(reason));});

test('schema extraction is from actual refs, includes positive/negative DTOs and refuses overwrite',()=>{
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'oc-renewal-v2-')),output=path.join(parent,'new');
  try {
    const result=prepare(output), rows=fs.readFileSync(path.join(output,'cases.tsv'),'utf8').trim().split('\n');
    assert.equal(rows.length,result.schema_positive+result.schema_negative);assert(result.schema_negative>20);assert.equal(result.schema_positive,5);
    const request=readAbsolute(path.join(output,'RenewRequest.schema.json'));
    assert.equal(request.additionalProperties,false);assert(!Object.hasOwn(request.properties,'rotation'));
    assert.throws(()=>prepare(output),/RENEWAL_OUTPUT_EXISTS/);
  }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
const readAbsolute=file=>JSON.parse(fs.readFileSync(file,'utf8'));

test('four candidates only: all 115 descriptors, 236 preserved artifacts and old planned rows are exact',()=>{
  assert.deepEqual(validateRenewalCandidate(registry),{admitted:0,planned:4,prior_roots:115,preserved:236,runtime_demonstrated:false});
  assert.deepEqual(renewalCandidateView(registry),baseline);
  assert.deepEqual(read('identity/index.json'),domainIndex(liveRegistry,'identity'));
  assert.equal(validateIdentityAdmission(registry).admitted,6);assert.equal(validateHistoryRegistry(registry).admitted,24);
  for(const item of renewalIntentions)for(const role of ['validation','documentation','producer','consumer','semantic-owner'])
    assert.throws(()=>makeLock(root,{contracts:[{id:item.id,role,version:'2',operations:[],pointers:['']}],assets:[]},Buffer.from('{}'),registry),/Unknown\/unmaterialized contract/);
});

for(const [name,mutate] of [
  ['partial',r=>r.planned.pop()],['duplicate',r=>r.planned.push(structuredClone(r.planned.at(-1)))],
  ['reordered',r=>r.planned.reverse()],['wrong-owner',r=>{r.planned.at(-1).owner='gateway-bff';}],
  ['arbitrary',r=>r.planned.push({id:'identity.unapproved',status:'planned'})],
  ['changed-admission',r=>{r.contracts[109].sha256='0'.repeat(64);}],
  ['old-planned-removed',r=>r.planned.shift()],['promoted-draft',r=>{r.contracts.find(row=>row.status==='draft').status='active';}],
])test('full candidate and H/I entry points reject registry regression: '+name,()=>{
  const changed=structuredClone(registry);mutate(changed);
  assert.throws(()=>validateRenewalCandidate(changed));
  assert.throws(()=>validateIdentityAdmission(changed));assert.throws(()=>validateHistoryRegistry(changed));
});

test('published transports, fixtures, oracles, tools, consumers and package pins retain exact bytes',()=>{
  const files=execFileSync('git',['ls-tree','-r','--name-only',renewalBase],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const keep=files.filter(file=>/^(identity\/(http|fixtures)\/|openapi\/|catalog\/|common\/|events\/|commands\/|errors\/|registry\/consumers\/|tools\/)/.test(file));
  keep.push(...files.filter(file=>/^scripts\/identity\//.test(file)&&!file.endsWith('/validate-catalog-admission-v1.mjs')),'package.json','pnpm-lock.yaml');
  for(const file of keep)assert.equal(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),source(file).toString('utf8'),file);
});

test('CI appends only real renewal lint/bundle/extraction/schema commands to the two I jobs',()=>{
  const before=parse(source('.gitlab-ci.yml').toString('utf8')),expected=structuredClone(before),current=parse(fs.readFileSync(path.join(root,'.gitlab-ci.yml'),'utf8'));
  expected['validate:identity-catalog-contracts'].script.push(
    'npx --yes @redocly/cli@2.53.3 lint identity/http/private/v2/identity-catalog-recovery-renewal-v2.yaml',
    'node scripts/validate-redocly-no-warnings.mjs identity/http/private/v2/identity-catalog-recovery-renewal-v2.yaml',
    'npx --yes @redocly/cli@2.53.3 bundle identity/http/private/v2/identity-catalog-recovery-renewal-v2.yaml --dereferenced --ext json --output .ci-artifacts/catalog-recovery-renewal-v2.bundle.json',
    'node scripts/identity/validate-catalog-recovery-renewal-v2.mjs .ci-artifacts/catalog-recovery-renewal-v2 .ci-artifacts/catalog-recovery-renewal-v2.bundle.json');
  expected['validate:identity-catalog-contracts'].artifacts.paths.push('.ci-artifacts/catalog-recovery-renewal-v2.bundle.json','.ci-artifacts/catalog-recovery-renewal-v2/');
  expected['validate:identity-catalog-schema'].script.push('jsonschema metaschema identity/http/shared/v2/identity-catalog-recovery-renewal-v2.schema.json --verbose','sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-recovery-renewal-v2');
  assert.deepEqual(current,expected);assert.equal(Object.keys(current).filter(key=>key.startsWith('validate:')).length,12);
});
