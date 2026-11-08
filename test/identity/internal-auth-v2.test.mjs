import assert from 'node:assert/strict';
import test from 'node:test';
import {readCandidate,validateCandidate,validatePolicy,validateWire,mutatePolicy,verifyPreservation} from '../../scripts/identity/validate-internal-auth-v2.mjs';
const candidate=readCandidate();
test('H1A v2 retains wire shape and fixes only two bounded private-RAM workload profiles',()=>{
  assert.deepEqual(validateCandidate(candidate),{candidate:true,profiles:2,policyNegativeVectors:19,runtime_demonstrated:false});
});
test('published H1A v1, registry admissions and prior intentions stay intact',()=>{
  assert.deepEqual(verifyPreservation(),{view:'published_source_candidate',publishedV1Preserved:true,existingAdmissionsPreserved:true,planned:4});
});
for(const row of candidate.cases.negative_mutations)test('reject policy violation: '+row.id,()=>{
  assert.throws(()=>validatePolicy(mutatePolicy(candidate.policy,row)));
});
test('a client-selected audience cannot be introduced into the OAuth request',()=>{
  const changed=structuredClone(candidate.api);
  changed.components.schemas.ClientCredentialsRequest.properties.audience={type:'string'};
  assert.throws(()=>validateWire(changed,candidate.prior));
});
test('receiver verification or token lifetime cannot change behind a documentary successor',()=>{
  const changed=structuredClone(candidate.api);
  changed.components.schemas.TokenResponse.properties.expires_in.maximum=600;
  assert.throws(()=>validateWire(changed,candidate.prior));
});
test('HTTP no-store and its policy link cannot be removed',()=>{
  const changed=structuredClone(candidate.api);
  changed.components.headers.NoStore.schema.const='private';
  assert.throws(()=>validateWire(changed,candidate.prior));
  const missing=structuredClone(candidate.api);delete missing['x-workload-token-reuse-policy'];
  assert.throws(()=>validateWire(missing,candidate.prior));
});
