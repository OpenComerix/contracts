import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { issueProfile, acceptsProfile } from './catalog-workload-profiles-v1-semantics.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
export const policy=read('identity/http/shared/v1/identity-catalog-workload-profiles-v1.json');
export const vectors=read('identity/fixtures/catalog-workload/v1/catalog-workload-profiles-v1-vectors.json');
export function validateProfiles(candidate=policy) {
  assert.equal(candidate.policy_version,1); assert.equal(candidate.status,'candidate');
  assert.equal(candidate.owner,'identity-tenancy'); assert.equal(candidate.runtime_demonstrated,false); assert.equal(candidate.production_enabled,false);
  const tuples=[['notifications','notifications','identity-tenancy.delivery-material'],['gateway-bff','gateway-bff','identity-tenancy.gateway'],['gateway-bff.catalog-recovery','gateway-bff','identity-tenancy.catalog-recovery'],['catalog-pricing','catalog-pricing','identity-tenancy.catalog-authority'],['catalog-pricing.catalog-recovery','catalog-pricing','identity-tenancy.catalog-recovery']];
  assert.deepEqual(candidate.profiles,tuples.map(([client_id,caller,audience])=>({client_id,caller,audience,type:'service',maximum_seconds:300})));
  assert.deepEqual(candidate.source_pin,{path:'openapi/identity-internal-auth-v1.yaml',commit:'26e8c5b50d04508adec5d1a56f38660944faa27c',sha256:'4a8624be6f2cae9116ac634bc6e64d59f5382cad91a7f9d0a6eba2dd9b7e451b'});
  const pin=candidate.source_pin;
  const bytes=execFileSync('git',['show',pin.commit+':'+pin.path],{cwd:root,maxBuffer:1024*1024});
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);
  assert.equal(fs.readFileSync(path.join(root,pin.path),'utf8').replaceAll('\r\n','\n'),bytes.toString('utf8'));
  assert.equal(vectors.runtime_demonstrated,false); assert.equal(vectors.accepted.length,5);
  for (const row of vectors.accepted) {
    const result=issueProfile(candidate,row.client_id,vectors.request,true);
    assert.equal(result.status,200); assert.deepEqual(result.claims,{caller:row.caller,aud:row.audience,type:'service'});
    assert.equal(acceptsProfile(candidate,row.client_id,result.claims,true),true);
    assert.equal(issueProfile(candidate,row.client_id,vectors.request,false).status,401);
    for (const request of vectors.rejected_requests) assert.equal(issueProfile(candidate,row.client_id,request,true).status,400);
  }
  for (const client of vectors.unknown_clients) assert.equal(issueProfile(candidate,client,vectors.request,true).status,401);
  const cross=issueProfile(candidate,vectors.cross_purpose.client_id,vectors.request,true);
  assert.notEqual(cross.claims.aud,vectors.cross_purpose.requested_audience);
  return {profiles:5,rejected_requests:vectors.rejected_requests.length,unknown_clients:vectors.unknown_clients.length,runtime_demonstrated:false};
}
if (import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  assert.equal(process.argv.length,2,'usage: node scripts/identity/validate-catalog-workload-profiles-v1.mjs');
  console.log('F1-08I workload profile candidate gate: '+JSON.stringify(validateProfiles()));
}
