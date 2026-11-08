import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {execFileSync} from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { createGitReader } from './git-source.mjs';
import reviewedTooling from './validation-tooling.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, '../..');
// Reviewed inputs, independent of the mutable checkout and future commits.
export const reviewedValidationRevision = '8dd4306d1142abf34bb43ed6db7c99473f1c5c5b';
export const reviewedCandidateRevision = '062453a717bc49d08b4816fa8e630ea63fcdd64d';
const reviewedInputs = Object.freeze([reviewedValidationRevision,
  '0bff3a242784599c400875f37e1c2d3ef64f4538',
  'fcfbeba3f99c10b292ece4db2452ace71e66d093',
  '7cd2b548fb909c5eff47d0319c162c498ee68e92',
  'a4919ed4ed90fe478b88c43a418cb4d6500a6948',
  '67cb6f9e45904f5a142912c60aafe08cda851c55', reviewedCandidateRevision]);
const reader = createGitReader(), readers = new Map();
const ancestry = new Map();
function canProject(from,revision) {
  if(from===revision)return true;
  const key=from+':'+revision;
  if(!ancestry.has(key)) {
    let result=true;
    try {execFileSync('git',['-C',root,'merge-base','--is-ancestor',revision,from],
      {windowsHide:true,stdio:['ignore','pipe','pipe']});}
    catch(error){if(error.status!==1)throw error;result=false;}
    if(ancestry.size>=128)ancestry.delete(ancestry.keys().next().value);
    ancestry.set(key,result);
  }
  return ancestry.get(key);
}
const source = revision => {
  if (!readers.has(revision)) readers.set(revision, reader(root, revision));
  return readers.get(revision);
};
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
// One closed candidate delta; this is not a registry admission. Each supplied
// value is hashed afresh, without reading or approving another live input.
export const reuseCandidateBase = 'e80e760d0ba9f4194beb38a6c385ee35b9675e53';
export const reuseCandidateFiles = Object.freeze([
  '.github/workflows/ci.yml', 'identity/README.md', 'identity/index.json',
  'registry/README.md', 'registry/contracts.json', 'test/ci/github-v1.test.mjs',
  'scripts/inventory/capture-authority-v2.mjs',
  'scripts/inventory/capture-authority-v2-admission.mjs',
  'test/sales/inventory-step-consumer-v1.test.mjs',
  'identity/http/private/v2/identity-internal-auth-v2.yaml',
  'identity/http/shared/v2/identity-workload-token-reuse-policy-v2.json',
  'identity/http/shared/v2/identity-workload-token-reuse-policy-v2.schema.json',
  'identity/fixtures/internal-auth/v2/policy-cases-v2.json',
  'scripts/identity/validate-internal-auth-v2.mjs',
  'scripts/identity/validate-internal-auth-v2.sh',
  'test/identity/internal-auth-v2.test.mjs',
  'test/architecture/internal-auth-v2-history.test.mjs',
]);
const reuseProjectionFiles = new Set(reuseCandidateFiles.slice(0, 9));
// BEGIN H1A V2 CANDIDATE HASHES
const reuseCandidateHashes = Object.freeze({
  ".github/workflows/ci.yml": "4580859c505a8e486651aa589d1485cb9bcf51344a622cf31509d0b5191f30e5",
  "identity/README.md": "35405c0f1d05547bda7b64a777d39fc184f4a9af4661c43d9cb5188bed9689c3",
  "identity/index.json": "821015d0c5edc41ce78c938f6e7337345441904c051e0697d2b1ca6dbbb1e43f",
  "registry/README.md": "3a14e5a12f8581334f466c4669e71e85eef7acd2fa5f06e7de25aee050215270",
  "registry/contracts.json": "196e591c121894c24691204a1d9acea06dd2a8d38890c0eee140dd7148df7192",
  "test/ci/github-v1.test.mjs": "cebe67c658a9297ba9061505eda49ef4a94b92e7afb78e02a9645893e7b2a9f1",
  "scripts/inventory/capture-authority-v2.mjs": "bc3425cea375e780f2704d335925b6bac966bfd42f602426f9f0dfe2c33f19e6",
  "scripts/inventory/capture-authority-v2-admission.mjs": "c14a57b6c1f5dbbbc8e1fda75cda5251b75a6be1618449b14092f6b3bad61914",
  "test/sales/inventory-step-consumer-v1.test.mjs": "e206eb58a36e397aa680d9fcae6775e0c957d1053c6e2b6e52519993ee6b6fe1",
  "identity/http/private/v2/identity-internal-auth-v2.yaml": "9afcacee5d576d7cec1cfd94fb39d3eb29f4ce6a2a64301dc93cf8ef16229cf3",
  "identity/http/shared/v2/identity-workload-token-reuse-policy-v2.json": "efd4ed4579316272c372f8ee96e0986db35ce1c11724b3407589d51017efd411",
  "identity/http/shared/v2/identity-workload-token-reuse-policy-v2.schema.json": "8b2bcf34265b72513fd8d9b2aaceb93d76c8de1ac784f0601711e7cc7a689338",
  "identity/fixtures/internal-auth/v2/policy-cases-v2.json": "e74e406b8235ab1238ceb72edb7e7d509b5f151977dc42c8580360ff0225adb6",
  "scripts/identity/validate-internal-auth-v2.mjs": "f48e095f4bfee12f6fefaa81fab30e412189ff542471eebf499b672e35c98f04",
  "scripts/identity/validate-internal-auth-v2.sh": "04e39db4307136278ecc90bc897a3b2b0704f9425726ef27551cb3e06997a0db",
  "test/identity/internal-auth-v2.test.mjs": "42a6c573c7813ec995aed04bd66d7ea2042eda939d63151c330a3666998dfac3",
  "test/architecture/internal-auth-v2-history.test.mjs": "67ab48135baa22f1ea46c1909964688029a8c69dfaae3ade274bbc1c870d9be7"
});
// END H1A V2 CANDIDATE HASHES
const textHash = bytes => createHash('sha256').update(text(bytes)).digest('hex');
export function projectReuseCandidateFile(file, bytes) {
  if (!reuseProjectionFiles.has(file) || textHash(bytes) !== reuseCandidateHashes[file]) return bytes;
  return Buffer.from(source(reuseCandidateBase)(file));
}
export function withReuseCandidateScope(paths, read) {
  const registry = read('registry/contracts.json');
  if (textHash(registry) !== reuseCandidateHashes['registry/contracts.json']) {
    const value = JSON.parse(text(registry));
    assert(!value.planned?.some(row => row.materializeIn === 'F1-ECO-M6'), 'H1A_V2_SCOPE_REGISTRY');
    return new Set(paths);
  }
  assert.deepEqual(Object.keys(reuseCandidateHashes), reuseCandidateFiles, 'H1A_V2_SCOPE_INVENTORY');
  for (const file of reuseCandidateFiles) {
    const bytes = file === 'registry/contracts.json' ? registry : read(file);
    assert.equal(textHash(bytes), reuseCandidateHashes[file], 'H1A_V2_SCOPE_BYTES:' + file);
  }
  return new Set([...paths, ...reuseCandidateFiles]);
}
function isReuseCandidateDocument(file, value) {
  if (!reuseProjectionFiles.has(file) || !file.endsWith('.json')) return false;
  try {
    const encoded = JSON.stringify(value, null, 2) + '\n';
    return isDeepStrictEqual(value, JSON.parse(encoded)) &&
      createHash('sha256').update(encoded).digest('hex') === reuseCandidateHashes[file];
  } catch { return false; }
}
export function projectReuseCandidateDocument(file, value) {
  return isReuseCandidateDocument(file, value) ? JSON.parse(source(reuseCandidateBase)(file)) : value;
}
const metadata = new Set([
  'registry/contracts.json', 'registry/consumers/index.json',
  ...['gateway-bff', 'identity-tenancy', 'notifications', 'web-pos', 'catalog-pricing', 'sales-pos', 'inventory']
    .map(service => 'registry/consumers/' + service + '.json'),
  ...['inventory', 'identity', 'catalog', 'sales', 'finance', 'common'].flatMap(domain => [domain + '/index.json', domain + '/README.md']),
  'registry/README.md',
  '.gitignore', 'README.md', '.gitlab-ci.yml',
  'scripts/catalog/catalog-consumption-v1-registry.mjs', 'scripts/catalog/catalog-delivery-v1-registry.mjs',
  'scripts/catalog/catalog-foundation-v1-registry.mjs', 'scripts/catalog/catalog-lifecycle-v1-registry.mjs',
  'scripts/catalog/catalog-operational-recovery-v1-registry.mjs', 'scripts/catalog/catalog-runtime-v1-registry.mjs',
  'scripts/identity/catalog-workload-consumers-v2-registry.mjs', 'scripts/identity/catalog-workload-profiles-v2-registry.mjs',
  'scripts/validate-gateway-identity-policy-v2.mjs', 'scripts/validate-gateway-identity-policy.mjs',
  'test/architecture/asyncapi-admission-v1.test.mjs', 'test/architecture/catalog-consumption.test.mjs',
  'test/architecture/catalog-delivery.test.mjs', 'test/architecture/catalog-lifecycle.test.mjs',
  'test/architecture/catalog-operational-recovery.test.mjs', 'test/architecture/catalog-workload-consumers-v2.test.mjs',
  'test/architecture/identity-producer-admission.test.mjs', 'test/catalog/asyncapi-preservation-v1.test.mjs',
  'test/catalog/history-protection-v1.test.mjs', 'test/identity/candidate-preservation.test.mjs',
  'test/identity/catalog-workload-profiles-admission-v2.test.mjs', 'test/support/f1-10a-scope.mjs',
  'tools/architecture/graph.mjs', 'tools/architecture/layout.mjs',
  'scripts/inventory/candidate-v1.mjs', 'test/inventory/package-v1.test.mjs',
  'scripts/finance/reviewed-package-v1.mjs', 'scripts/sales/reviewed-package-v2.mjs',
  'scripts/sales/release-v1.mjs', 'scripts/identity/inventory-authority-v1-1.mjs',
]);
function optional(read, file) {
  try { return read(file); }
  catch (error) {
    if (error.message === 'GIT_SOURCE_NOT_BLOB:' + file) return undefined;
    throw error;
  }
}
// A metadata projection proves this one supplied value, never another file or
// the state of the checkout. Unchanged historical bytes need no adaptation.
export function projectReviewedFile(revision, file, bytes) {
  const previous = optional(source(revision), file);
  if (previous && text(bytes) === text(previous)) return bytes;
  if (!previous) return undefined;
  if (metadata.has(file) && projectReuseCandidateFile(file, bytes) !== bytes &&
      canProject(reuseCandidateBase, revision)) return previous;
  for(const from of file === '.gitlab-ci.yml'
    ? ['4ebc146e7be83713f39a72384bd0dfb7a1575616',...reviewedInputs] : reviewedInputs) {
    const expected=optional(source(from),file);
    if(expected&&text(bytes)===text(expected)&&canProject(from,revision))return metadata.has(file)?previous:undefined;
  }
  return undefined;
}
export function projectReviewedSnapshot(revision, snapshot) {
  const service = snapshot?.manifest?.service;
  if (typeof service !== 'string' || !/^[a-z-]+$/.test(service)) return snapshot;
  const file = 'registry/consumers/' + service + '.json';
  if (!metadata.has(file)) return snapshot;
  for (const from of reviewedInputs) {
    const bytes = optional(source(from), file);
    if (!bytes || !isDeepStrictEqual(snapshot, JSON.parse(bytes)) || !canProject(from,revision)) continue;
    const previous = optional(source(revision), file);
    if (!previous) return snapshot;
    const result = JSON.parse(previous);
    return isDeepStrictEqual(snapshot, result) ? snapshot : result;
  }
  return snapshot;
}
export function projectReviewedRegistry(revision, registry) {
  return projectReviewedDocument(revision,'registry/contracts.json',registry);
}
export function isReviewedDocument(revision,file,value) {
  return metadata.has(file)&&file.endsWith('.json')&&isDeepStrictEqual(value,JSON.parse(source(revision)(file)));
}
export function projectReviewedDocument(revision,file,value) {
  if (!metadata.has(file) || !file.endsWith('.json')) return value;
  const previous = JSON.parse(source(revision)(file));
  if (isDeepStrictEqual(value, previous)) return value;
  if (isReuseCandidateDocument(file, value) && canProject(reuseCandidateBase, revision)) return previous;
  for (const from of reviewedInputs)
    if (isDeepStrictEqual(value, JSON.parse(source(from)(file)))&&canProject(from,revision)) return previous;
  return value;
}

// The code owns the inventory and the reference pin; current JSON data can
// neither extend the allowed paths nor replace the reviewed expectations.
const toolingPaths = Object.freeze([
  'tools/architecture/graph.mjs', 'tools/architecture/git-source.mjs', 'tools/architecture/README.md',
  'scripts/catalog/catalog-foundation-v1-registry.mjs', 'scripts/catalog/catalog-lifecycle-v1-registry.mjs',
  'scripts/catalog/catalog-runtime-v1-registry.mjs', 'scripts/inventory/candidate-v1.mjs',
  'scripts/identity/catalog-workload-consumers-v2-registry.mjs',
  'scripts/identity/catalog-workload-profiles-v2-registry.mjs', 'scripts/finance/authority-consumers-v1.mjs',
  'scripts/finance/reviewed-package-v1.mjs', 'scripts/sales/reviewed-package-v2.mjs',
  'scripts/sales/release-v1.mjs', 'scripts/identity/inventory-authority-v1-1.mjs',
  'test/architecture/immutable-closure.test.mjs', 'test/architecture/validation-history.test.mjs',
  'tools/architecture/validation-history.mjs',
]);
const toolingReferenceSha256 = 'ea697918740ac332ce8e6c021a7444a9df472ad581aabd6ccc15fe0c764873a8';
const toolingHashes = Object.freeze({ ...reviewedTooling });
const toolingReference = 'tools/architecture/validation-tooling.json';
const toolingReferenceText = JSON.stringify(toolingHashes, null, 2) + '\n';
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(toolingReferenceText), toolingReferenceSha256, 'VALIDATION_TOOLING_REFERENCE_DRIFT');
assert.deepEqual(Object.keys(toolingHashes).sort(), [...toolingPaths].sort(), 'VALIDATION_TOOLING_INVENTORY');
export const validationToolingFiles = Object.freeze([
  ...toolingPaths, toolingReference,
]);
function toolingFingerprint(file, bytes) {
  let value = text(bytes);
  if (file === 'tools/architecture/validation-history.mjs') {
    // The body hash covers all source except this one literal. The literal is
    // checked against the executing verifier's pin, so no byte is unchecked.
    const pin = /^const toolingReferenceSha256 = '([0-9a-f]{64})';$/gm;
    const matches = [...value.matchAll(pin)];
    if (matches.length !== 1 || matches[0][1] !== toolingReferenceSha256) return undefined;
    value = value.replace(pin, "const toolingReferenceSha256 = '<REFERENCE_SHA256>';");
  }
  return digest(value);
}
export function projectValidationTooling(file, bytes) {
  const expected = toolingHashes[file];
  if (!expected) return bytes;
  const actual = toolingFingerprint(file, bytes);
  return actual === expected ? optional(source(reviewedValidationRevision),file) ?? bytes : bytes;
}
export function validateValidationTooling(read) {
  assert.equal(text(read(toolingReference)), toolingReferenceText, 'VALIDATION_TOOLING_REFERENCE_DRIFT');
  for (const file of toolingPaths) {
    const expected=toolingHashes[file], bytes=read(file), actual=toolingFingerprint(file,bytes);
    if(actual===expected)continue;
    const previous=optional(source(reviewedValidationRevision),file);
    assert(previous&&text(bytes)===text(previous),'VALIDATION_TOOLING_DRIFT:' + file);
  }
}
let scopeFiles;
export function withReviewedValidationScope(paths,read) {
  scopeFiles ??= execFileSync('git',['-C',root,'diff','--diff-filter=AM','--name-only','-z',
    reviewedCandidateRevision,reviewedValidationRevision],{windowsHide:true,maxBuffer:1024*1024})
    .toString('utf8').split('\0').filter(Boolean);
  validateValidationTooling(read);
  for(const file of scopeFiles)
    assert.equal(text(projectValidationTooling(file,projectReuseCandidateFile(file,read(file)))),text(source(reviewedValidationRevision)(file)),
      'VALIDATION_SCOPE_DRIFT:'+file);
  assert.equal(text(read('.gitlab-ci.yml')),text(source('4ebc146e7be83713f39a72384bd0dfb7a1575616')('.gitlab-ci.yml')),
    'VALIDATION_RETIRED_CI_DRIFT');
  return withReuseCandidateScope([...paths,...scopeFiles,...validationToolingFiles,'.gitlab-ci.yml'],read);
}
