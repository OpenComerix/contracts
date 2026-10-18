import assert from 'node:assert/strict';
import test from 'node:test';
import { issueProfile, acceptsProfile } from '../../scripts/identity/catalog-workload-profiles-v1-semantics.mjs';
import { policy, vectors, validateProfiles } from '../../scripts/identity/validate-catalog-workload-profiles-v1.mjs';

test('five purpose-bound profiles preserve pinned H1A and published request',()=>validateProfiles());
for(const expected of policy.profiles) test('isolates token purpose: '+expected.client_id,()=> {
  const issued=issueProfile(policy,expected.client_id,vectors.request,true);
  for(const destination of policy.profiles) assert.equal(acceptsProfile(policy,destination.client_id,issued.claims,true),destination.client_id===expected.client_id);
  for(const claims of [{...issued.claims,aud:[issued.claims.aud]},{...issued.claims,aud:'user-api'},{...issued.claims,type:'delegated-user'},{...issued.claims,caller:'browser'}]) assert.equal(acceptsProfile(policy,expected.client_id,claims,true),false);
  assert.equal(acceptsProfile(policy,expected.client_id,issued.claims,false),false);
});
test('caller and audience remain server policy even if the client sends selectors',()=> {
  for(const request of vectors.rejected_requests) assert.equal(issueProfile(policy,'gateway-bff',request,true).status,400);
  assert.equal(issueProfile(policy,'OWNER',vectors.request,true).status,401);
  assert.equal(issueProfile(policy,'catalog-pricing',null,false).status,401);
  assert.equal(issueProfile(policy,'gateway-bff',{grant_type:'password'},true).error,'unsupported_grant_type');
  assert.equal(issueProfile(policy,'gateway-bff',{grant_type:'client_credentials',audience:'override'},true).error,'invalid_request');
});
test('policy drift cannot silently replace a known client, audience or lifetime',()=> {
  for(const mutate of [candidate=>{candidate.profiles[1].audience='identity-tenancy.catalog-recovery';},candidate=>{candidate.profiles[2].client_id='gateway-bff';},candidate=>{candidate.profiles[0].maximum_seconds=900;},candidate=>{candidate.runtime_demonstrated=true;}]) {
    const candidate=structuredClone(policy);mutate(candidate);assert.throws(()=>validateProfiles(candidate));
  }
});
