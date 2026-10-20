import assert from 'node:assert/strict';
import test from 'node:test';
import { issueProfile, acceptsProfile } from '../../scripts/identity/catalog-workload-profiles-v1-semantics.mjs';
import { policy, vectors, validateProfiles } from '../../scripts/identity/validate-catalog-workload-profiles-v2.mjs';

test('six purpose-bound profiles preserve the five published bindings and add isolated history recovery', () => validateProfiles());
for (const expected of policy.profiles) test('isolates token purpose: ' + expected.client_id, () => {
  const issued = issueProfile(policy, expected.client_id, vectors.request, true);
  for (const destination of policy.profiles) assert.equal(acceptsProfile(policy, destination.client_id, issued.claims, true), destination.client_id === expected.client_id);
  assert.equal(acceptsProfile(policy, expected.client_id, issued.claims, false), false);
});
test('the R3 catalog-recovery credential cannot select the R4 incoming audience', () => {
  const issued = issueProfile(policy, 'catalog-pricing.catalog-recovery', vectors.request, true);
  assert.equal(issued.claims.aud, 'identity-tenancy.catalog-recovery');
  assert.equal(issued.claims.aud === 'catalog-pricing.history-recovery', false);
});
