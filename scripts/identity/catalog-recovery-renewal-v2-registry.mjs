import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gitReader} from '../../tools/architecture/graph.mjs';
export const root=path.resolve(import.meta.dirname,'../..');
export const renewalBase='a6cf430dcdbafb515fa3f34b29ec5d98b976e0e7';
export const renewalIntentions=['http','schema','policy','fixtures'].map(surface=>({
  id:'identity.catalog-recovery-renewal.'+surface+'.v2',domain:'identity',owner:'identity-tenancy',materializeIn:'F1-08I',status:'planned',
  constraint:'Candidate renewal v2 after one proven direct step-up credential rotation only. Preserve R3 v1, verification v2, all admissions and consumers; separate publication, CI and admission before runtime.',
}));
const ids=new Set(renewalIntentions.map(row=>row.id));

// Strip only this exact closed suffix for the historical H/I validators. The
// original metadata/descriptors stay visible to those validators, not replaced
// by a trusted baseline. Current candidate validation below checks the full tree.
export function renewalCandidateView(registry) {
  assert(!registry.contracts.some(row=>ids.has(row.id)),'RENEWAL_NOT_ADMITTED');
  if (!registry.planned.some(row=>ids.has(row.id))) return registry;
  assert.deepEqual(registry.planned.slice(-4),renewalIntentions,'RENEWAL_CLOSED_INTENTIONS');
  assert.equal(registry.planned.filter(row=>ids.has(row.id)).length,4,'RENEWAL_CLOSED_INTENTIONS');
  return {...registry,planned:registry.planned.slice(0,-4)};
}

export function validateRenewalCandidate(registry=JSON.parse(fs.readFileSync(path.join(root,'registry/contracts.json'),'utf8'))) {
  const baseline=JSON.parse(gitReader(root,renewalBase)('registry/contracts.json'));
  assert.deepEqual(registry,{...baseline,planned:[...baseline.planned,...renewalIntentions]},'RENEWAL_REGISTRY_PRESERVATION');
  return {admitted:0,planned:4,prior_roots:115,preserved:236,runtime_demonstrated:false};
}
