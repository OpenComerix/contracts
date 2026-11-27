import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonical, sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { includePreparationWindowPaths, projectPreparationWindowDocument, projectPreparationWindowFile } from '../sales/preparation-window-history-v1.mjs';

const root = resolve(import.meta.dirname, '../..');
const base = '910130c668c6e2f47afb9d33be79e36926cb5721';
const before = new Map();
const metadata = new Map([
  ['.github/workflows/ci.yml', '9c829c6834fa1f93b942a30c4216a1945b230241915cfe2a6d2cd4b32ca613c9'],
  ['identity/README.md', '9a3e8835296fe3ac43cefe0f40a3948a8b3d63b2880211764c287b7ea8bfa8fe'],
  ['identity/index.json', '9aed48282ec07094b352adeab6edbd05432e0ea5079dda32e7062bc35fe41876'],
  ['registry/contracts.json', '59b27c9ced3194c73d7210f2890e5b5e641170ff483eee540463fa78920f2678'],
]);
const admittedMetadata = new Map([
  ['.github/workflows/ci.yml', '99a49325f5fe2347b96e6570be6b14252edaed9147576ebc48394c834a3871c1'],
  ['identity/README.md', 'bc9c127f6bf08141e5c0460f60c48f5cc01ad2bab9b4e5e9712c144898ff2013'],
  ['identity/index.json', 'a3f859998fefda81d973f320275490308cd2bc7aa2b8ec223e37d12638196d75'],
  ['registry/contracts.json', '3ff594289a1f3bb176036a790933f1c3f6da57a1e483b48154cd4fed0574cb55'],
]);
const id03SourceMetadata = new Map([
  ['identity/README.md', '2a5cc0fee0a335f99d8de34c1c39460f41d8d3b96cef9c00c409332e4d65205a'],
  ['identity/index.json', '47d485ae47e77dfe12f85627d07abb0edf237b49df8d74b156d93d72beb7e9d0'],
  ['registry/contracts.json', '6bf709a5f014c92bb8c443ae19743ad602294d764e819a54059fcaf8d127872d'],
]);
const id03SourcePaths = new Map([
  ['identity/http/private/v4/identity-internal-auth-v4.yaml', '88bcf108d0743abd76f5be9d1dcad3fa9d651f3c65d44c41e04702d28c01a27c'],
  ['identity/http/shared/v4/identity-workload-token-reuse-policy-v4.json', '2bc4ed5f59a05cb2e9996a88caa793de97dc97cdf019b84698e523492dbc2207'],
  ['identity/http/shared/v4/identity-workload-token-reuse-policy-v4.schema.json', '7603828c74b1d5c286dff42da7cf11e97c994d892c182edc538bbeac9a339e10'],
  ['identity/fixtures/internal-auth/v4/policy-cases-v4.json', '6240918617a83d8542be0c0c28ef4f3ae38c196dbe57144f979a78506371bc3e'],
  ['identity/http/shared/v2/identity-sale-preparation-workloads-v2.json', 'cfe35918d848d6037e0890ab545895116a3294b6aeeb87a8e4f9e69776ce455b'],
  ['scripts/identity/prepare-internal-auth-v4.mjs', '2dac111972795cbf6644c453feb21dc1e1e7c4c6b642ff7a1e8c13c579a59ec2'],
  ['test/identity/internal-auth-v4.test.mjs', '847e043a2e6a687df879e7711115acbce7a2ab69fa2fe19692520464e68c9f4e'],
]);
const id03AdmissionMetadata = new Map([
  ['.github/workflows/ci.yml', '91662db2352c4ea26e90a594324d62a15eca7eced9ee8b6be4dc3f62287ec781'],
  ['identity/README.md', '47fef7f3ba2a82d2a0b0b21db0570b50fd6b11406e0f6008b9f9a0a3a1bc3f4f'],
  ['identity/index.json', '294bd38f635c7088b6b934f9ec0d48588349973d7844c4f17f3d8a75f191fafd'],
  ['registry/contracts.json', '1c7e0be2d69f2dcc933463a7fde1e11e93269da017165f5873ed9503ec148712'],
]);
const id03AdmissionPaths = new Map([
  ['scripts/identity/internal-auth-v4-admission.mjs', '86ed711fa07416f05a60c19e9af8b2046f5814aabff2c5e89b62676322cd08e2'],
  ['test/identity/internal-auth-v4-admission.test.mjs', 'd238c2b11755f891f3f9e7cda3ae97482733d24be3107f87b96604c0eac1eb07'],
]);
const id03Ids = new Set([
  'identity.internal-auth.v4',
  'identity.workload-token-reuse.policy.v4',
  'identity.workload-token-reuse.schema.v4',
  'identity.internal-auth.fixtures.v4',
  'identity.sale-preparation-workloads.policy.v2',
]);
const id03DescriptorHash = '6ef47f5754282df03f95ba57b725329f1f09433aa21960c3814eacc46ae4ec54';
const belongsToId03 = row => id03Ids.has(row.id) || id03SourcePaths.has(row.path) || row.materializeIn === 'ID-03';
const registryPath = 'registry/contracts.json';
const indexPath = 'identity/index.json';
const id02AdmissionTest = 'test/identity/internal-auth-v3-admission.test.mjs';
const id02AdmissionTestPinned = 'dc4c3f73793e2583bd642cb7408e686995c4cbad11ef067dcde2320499e6e4e7';
const additions = new Map([
  ['identity/http/private/v3/identity-internal-auth-v3.yaml', '3c9332409d6c5f88f4eb608415b4aff88598b473a7cc39cfc5d0d936c148c85b'],
  ['identity/http/shared/v3/identity-workload-token-reuse-policy-v3.json', '1a62ffb77790e26a93ee3982ffec9ded3e946ef78c5750983abbe4b1e2109429'],
  ['identity/http/shared/v3/identity-workload-token-reuse-policy-v3.schema.json', 'ed25ba091971cf133879209de3606c321d4641171fb931f1eb628b299ae06026'],
  ['identity/fixtures/internal-auth/v3/policy-cases-v3.json', '57f1ff3fdc49a8226fc518cfa7ecd3c3a2ec20d837c9ac8ae45e949c7aaf79fc'],
  ['scripts/identity/prepare-internal-auth-v3.mjs', '8e8bf924d7d8accc2b6b27c8dfe786ab45088466b5509027958977bf5fb4e797'],
  ['test/identity/internal-auth-v3.test.mjs', '739bf61e056025c4e4171b8cdb151ead91ccd189303ef936db281a47c0626289'],
]);
const admissionAdditions = new Map([
  ['scripts/identity/internal-auth-v3-admission.mjs', '1cb2b2fa77c14eeb34054c0d9c31400f28fa0617d397ad8f39b0932adf8597a3'],
  [id02AdmissionTest, '336d086819c3abb6b60aaaf31bb630b9281d1f3ee386a1ba8bd855e44e57395a'],
]);
const admittedIds = new Set([
  'identity.internal-auth.v3',
  'identity.workload-token-reuse.policy.v3',
  'identity.workload-token-reuse.schema.v3',
  'identity.internal-auth.fixtures.v3',
]);
const descriptorHash = '7eb7ad04548df1030b0ba84a5c35400c8b246a2a53f345d32076dcf154570375';
const belongsToAdmission = row => admittedIds.has(row.id) || additions.has(row.path) || row.materializeIn === 'ID-02';
const digest = bytes => createHash('sha256')
  .update(Buffer.from(bytes).toString('latin1').replaceAll('\r\n', '\n'), 'latin1').digest('hex');
const original = file => {
  if (!before.has(file)) before.set(file, execFileSync('git', ['-C', root, 'show', base + ':' + file],
    { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
  return Buffer.from(before.get(file));
};

// The same historical view recognizes exact metadata from ID-02 and ID-03.
export function beforeInternalAuthV3(file, bytes) {
  bytes = projectPreparationWindowFile(file, bytes);
  const expected = metadata.get(file);
  if (!expected) return bytes;
  const actual = digest(bytes);
  if (actual !== expected && actual !== admittedMetadata.get(file) &&
      actual !== id03SourceMetadata.get(file) && actual !== id03AdmissionMetadata.get(file)) return bytes;
  return original(file);
}

export function beforeInternalAuthV3Document(file, value) {
  value = projectPreparationWindowDocument(file, value);
  if (file !== 'identity/index.json' ||
    !(value?.planned?.includes('identity.internal-auth.v3') || value?.contracts?.includes('identity.internal-auth.v3'))) return value;
  try {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    const prior = beforeInternalAuthV3(file, bytes);
    return prior !== bytes && isDeepStrictEqual(value, JSON.parse(bytes)) ? JSON.parse(prior) : value;
  } catch {
    return value;
  }
}

export function includeInternalAuthV3Paths(allowed, registry, read) {
  includePreparationWindowPaths(allowed, registry, read);
  const actual = digest(registry);
  const sourceCandidate = actual === metadata.get('registry/contracts.json');
  let current;
  if (!sourceCandidate) {
    current = JSON.parse(registry);
    const { contracts, planned } = current;
    const descriptors = contracts.filter(belongsToAdmission);
    if (descriptors.length === 0 && !planned.some(belongsToAdmission)) return;
    assert(!planned.some(belongsToAdmission) && sha256(canonical(descriptors)) === descriptorHash, 'ID02_DESCRIPTOR_SCOPE');
  }
  const checks = sourceCandidate ? additions : [...additions, ...admissionAdditions];
  for (const [file, hash] of checks) {
    const actual = digest(read(file));
    assert(actual === hash || (file === id02AdmissionTest && actual === id02AdmissionTestPinned),
      'ID02_SOURCE_SCOPE:' + file);
  }
  for (const [file] of checks) allowed.add(file);
  if (current) includeId03Paths(allowed, current, actual, read);
  if (current && actual !== admittedMetadata.get('registry/contracts.json')) return current;
}

function includeId03Paths(allowed, current, registryHash, read) {
  const descriptors = current.contracts.filter(belongsToId03);
  const planned = current.planned.some(belongsToId03);
  if (!planned && descriptors.length === 0) return;
  const admitted = descriptors.length > 0;
  const metadata = admitted ? id03AdmissionMetadata : id03SourceMetadata;
  const extended = admitted && registryHash !== metadata.get(registryPath);
  if (extended) {
    assert(!planned && sha256(canonical(descriptors)) === id03DescriptorHash, 'ID03_DESCRIPTOR_SCOPE');
    assertCurrentIdentityIndex(read(indexPath), current, 'ID03_CURRENT_INDEX');
  }
  const label = admitted ? 'ID03_ADMISSION_SCOPE:' : 'ID03_SOURCE_SCOPE:';
  const scope = [...metadata, ...id03SourcePaths, ...(admitted ? id03AdmissionPaths : [])];
  for (const [file, hash] of scope) {
    if (!(extended && (file === registryPath || file === indexPath))) {
      const actual = file === registryPath ? registryHash : digest(read(file));
      assert.equal(actual, hash, label + file);
    }
    allowed.add(file);
  }
}

function assertCurrentIdentityIndex(bytes, registry, label) {
  const expected = Buffer.from(JSON.stringify(domainIndex(registry, 'identity'), null, 2) + '\n');
  assert.equal(digest(bytes), digest(expected), label);
}

// Historical readers of the Identity index still require every pre-ID-02 entry.
// Prove derivation from the supplied registry before hiding later additions.
export function projectExtendedIdentityIndex(bytes, registry) {
  assertCurrentIdentityIndex(bytes, registry, 'ID02_CURRENT_INDEX');
  const previous = original('identity/index.json');
  const index = JSON.parse(previous);
  const knownContracts = new Set(index.contracts);
  const knownPlanned = new Set(index.planned);
  const historical = {
    contracts: registry.contracts.filter(row => knownContracts.has(row.id)),
    planned: registry.planned.filter(row => knownPlanned.has(row.id)),
  };
  assert.deepEqual(domainIndex(historical, 'identity'), index, 'ID02_PRIOR_INDEX');
  return previous;
}
