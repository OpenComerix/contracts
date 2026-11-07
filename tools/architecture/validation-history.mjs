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
const toolingReferenceSha256 = 'e79ada9b3bb3e5505db931be1b86be51c5b589da79cbb408a4b13cbe4ac81d01';
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
    assert.equal(text(projectValidationTooling(file,read(file))),text(source(reviewedValidationRevision)(file)),
      'VALIDATION_SCOPE_DRIFT:'+file);
  assert.equal(text(read('.gitlab-ci.yml')),text(source('4ebc146e7be83713f39a72384bd0dfb7a1575616')('.gitlab-ci.yml')),
    'VALIDATION_RETIRED_CI_DRIFT');
  return new Set([...paths,...scopeFiles,...validationToolingFiles,'.gitlab-ci.yml']);
}
