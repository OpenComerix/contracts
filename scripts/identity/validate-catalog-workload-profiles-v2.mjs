import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { issueProfile, acceptsProfile } from './catalog-workload-profiles-v1-semantics.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
export const policy = read('identity/http/shared/v2/identity-catalog-workload-profiles-v2.json');
export const vectors = read('identity/fixtures/catalog-workload/v2/catalog-workload-profiles-v2-vectors.json');
export function validateProfiles(candidate = policy) {
  assert.equal(candidate.policy_version, 2);
  assert.equal(candidate.status, 'candidate');
  assert.equal(candidate.owner, 'identity-tenancy');
  assert.equal(candidate.runtime_demonstrated, false);
  assert.equal(candidate.production_enabled, false);
  assert.equal(candidate.supersedes.path, 'identity/http/shared/v1/identity-catalog-workload-profiles-v1.json');
  const priorPath = path.join(root, candidate.supersedes.path);
  assert.equal(createHash('sha256').update(fs.readFileSync(priorPath)).digest('hex'), candidate.supersedes.sha256);
  const tuples = [
    ['notifications', 'notifications', 'identity-tenancy.delivery-material'],
    ['gateway-bff', 'gateway-bff', 'identity-tenancy.gateway'],
    ['gateway-bff.catalog-recovery', 'gateway-bff', 'identity-tenancy.catalog-recovery'],
    ['catalog-pricing', 'catalog-pricing', 'identity-tenancy.catalog-authority'],
    ['catalog-pricing.catalog-recovery', 'catalog-pricing', 'identity-tenancy.catalog-recovery'],
    ['catalog-pricing.history-recovery', 'catalog-pricing', 'catalog-pricing.history-recovery'],
  ];
  assert.deepEqual(candidate.profiles, tuples.map(([client_id, caller, audience]) => ({ client_id, caller, audience, type: 'service', maximum_seconds: 300 })));
  assert.equal(vectors.runtime_demonstrated, false);
  assert.equal(vectors.accepted.length, 6);
  for (const row of vectors.accepted) {
    const result = issueProfile(candidate, row.client_id, vectors.request, true);
    assert.equal(result.status, 200);
    assert.deepEqual(result.claims, { caller: row.caller, aud: row.audience, type: 'service' });
    assert.equal(acceptsProfile(candidate, row.client_id, result.claims, true), true);
    for (const request of vectors.rejected_requests) assert.equal(issueProfile(candidate, row.client_id, request, true).status, 400);
  }
  for (const client of vectors.unknown_clients) assert.equal(issueProfile(candidate, client, vectors.request, true).status, 401);
  const cross = issueProfile(candidate, vectors.cross_purpose.client_id, vectors.request, true);
  assert.notEqual(cross.claims.aud, vectors.cross_purpose.requested_audience);
  return { profiles: 6, rejected_requests: vectors.rejected_requests.length, unknown_clients: vectors.unknown_clients.length, runtime_demonstrated: false };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  assert.equal(process.argv.length, 2, 'usage: node scripts/identity/validate-catalog-workload-profiles-v2.mjs');
  console.log('F1-08M workload profile successor candidate gate: ' + JSON.stringify(validateProfiles()));
}
