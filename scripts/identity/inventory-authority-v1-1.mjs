import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, parseSource } from '../../tools/architecture/graph.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { admissionFiles, admissionReadView, admissionHistoricalFile, admissionHistoricalRegistry } from './inventory-authority-v1-1-admission.mjs';
import { withSalesAdmissionScope } from '../sales/inventory-step-consumer-v1.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const base = 'fcfbeba3f99c10b292ece4db2452ace71e66d093';
export const source = gitReader(root, base);
export const originalPath = 'identity/http/private/v1/identity-inventory-authority-v1.yaml';
export const successorPath = 'identity/http/private/v1/identity-inventory-authority-v1-1.yaml';
export const fixturePath = 'identity/fixtures/inventory-authority/v1/http-1-1-invalid-request.json';
export const packagePath = 'identity/fixtures/inventory-authority/v1/http-1-1-package.json';
export const verifierPath = 'scripts/identity/inventory-authority-v1-1.mjs';
export const runnerPath = 'scripts/identity/run-inventory-authority-v1-1.mjs';
export const testPath = 'test/identity/inventory-authority-v1-1.test.mjs';
export const expectedPackageHash = 'b36b4ef8305bc90d534fbe2d863e507992865b94b4c41a2444311f5fcdd525c8';
export const description = 'F1-11A candidate successor: adds 400 identity_invalid_request to both inventory authority operations. No functional admission or runtime demonstrated; published 1.0.0 and its closure remain unchanged.';
export const hash = bytes => createHash('sha256').update(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n')).digest('hex');
export const actual = admissionReadView();
export const changedPaths = Object.freeze([
  successorPath, fixturePath, runnerPath, testPath,
  'registry/contracts.json', 'identity/index.json', 'identity/README.md',
  'registry/README.md', '.gitlab-ci.yml', 'scripts/sales/release-v1.mjs',
  'test/sales/release-v1.test.mjs',
]);
export const intention = Object.freeze({
  id: 'identity.inventory-authority.http.v1-1', domain: 'identity',
  owner: 'identity-tenancy', materializeIn: 'F1-11A', status: 'planned',
  constraint: 'Candidate source ' + successorPath + ' only; HTTP 1.1.0 adds 400 identity_invalid_request to both operations. No functional admission, consumer migration or runtime; preserve published 1.0.0 and its closure.',
});
export function successorDocument() {
  const document = JSON.parse(source(originalPath));
  document.info.version = '1.1.0';
  document.info.description = description;
  for (const item of Object.values(document.paths)) {
    const response = structuredClone(item.post.responses['401']);
    const problem = response.content['application/problem+json'].schema.allOf[1].properties;
    problem.status.const = 400;
    problem.code.enum = ['identity_invalid_request'];
    item.post.responses['400'] = response;
  }
  return document;
}
export function successorRegistry() {
  const previous = JSON.parse(source('registry/contracts.json'));
  return { ...previous, planned: [...previous.planned, intention] };
}
export function successorCI() {
  const ci = parseSource(source('.gitlab-ci.yml'), '.gitlab-ci.yml');
  ci['validate:inventory-contracts'].script.push(
    'node --test --test-reporter=tap ' + testPath,
    'node ' + runnerPath + ' openapi',
    'node ' + runnerPath + ' prepare .ci-artifacts/inventory-v1-authority-1-1-ci',
  );
  ci['validate:inventory-schema'].script.push(
    'sh scripts/inventory/validate-v1.sh .ci-artifacts/inventory-v1-authority-1-1-ci',
  );
  return ci;
}
let verified;
export function validateSuccessorPackage(read = actual) {
  if (read === actual && verified) return verified;
  const bytes = read(packagePath);
  assert.equal(hash(bytes), expectedPackageHash, 'IA11_PACKAGE_DIGEST');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.base, base, 'IA11_BASE');
  assert.equal(manifest.status, 'local-candidate', 'IA11_STATUS');
  assert.equal(manifest.functional_admission, false, 'IA11_ADMISSION');
  assert.equal(manifest.runtime_demonstrated, false, 'IA11_RUNTIME');
  assert.deepEqual(manifest.files.map(row => row.path).sort(), [...changedPaths].sort(), 'IA11_EXACT_PATHS');
  for (const entry of manifest.files) {
    assert.equal(hash(read(entry.path)), entry.sha256, 'IA11_PACKAGE_BYTES:' + entry.path);
    assert(['new', 'modified'].includes(entry.kind), 'IA11_FILE_KIND');
    if (entry.kind === 'modified')
      assert.equal(hash(source(entry.path)), entry.previous_sha256, 'IA11_BASE_BYTES:' + entry.path);
  }
  assert.deepEqual(JSON.parse(read(successorPath)), successorDocument(), 'IA11_EXACT_HTTP_DELTA');
  assert.deepEqual(JSON.parse(read('registry/contracts.json')), successorRegistry(), 'IA11_EXACT_PLANNED');
  assert.deepEqual(JSON.parse(read('identity/index.json')), domainIndex(successorRegistry(), 'identity'), 'IA11_INDEX');
  assert.deepEqual(parseSource(read('.gitlab-ci.yml'), '.gitlab-ci.yml'), successorCI(), 'IA11_EXACT_CI_DELTA');
  const previous = JSON.parse(source('registry/contracts.json'));
  for (const entry of [...previous.contracts, ...previous.preservedFiles]) {
    const bytes = read(entry.path);
    assert(createHash('sha256').update(bytes).digest('hex') === entry.sha256 || hash(bytes) === entry.sha256,
      'IA11_PUBLISHED_BYTES:' + entry.path);
  }
  for (const file of ['package.json', 'pnpm-lock.yaml', 'registry/consumers/index.json',
    ...previous.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')])
    assert.equal(hash(read(file)), hash(source(file)), 'IA11_CONSUMER_OR_DEPENDENCY:' + file);
  const allowed = withSalesAdmissionScope([...changedPaths, packagePath, verifierPath, ...admissionFiles]);
  for (const args of [['diff', '--name-only', base], ['diff', '--cached', '--name-only'], ['ls-files', '--others', '--exclude-standard']])
    for (const file of execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean))
      assert(allowed.has(file), 'IA11_UNDECLARED_PATH:' + file);
  const result = { manifest, roots: previous.contracts.length, planned: previous.planned.length + 1,
    operations: 2, functional_admission: false, runtime_demonstrated: false };
  if (read === actual) verified = result;
  return result;
}
// Validate the complete exact successor before projecting its reviewed delta
// for older guards. Mutated caller bytes are passed through, never repaired.
export function successorHistoricalFile(file, bytes) {
  bytes = admissionHistoricalFile(file, bytes);
  const { manifest } = validateSuccessorPackage();
  const entry = manifest.files.find(row => row.kind === 'modified' && row.path === file);
  return entry && hash(bytes) === entry.sha256 ? source(file) : bytes;
}
export function successorHistoricalRegistry(registry) {
  registry = admissionHistoricalRegistry(registry);
  if (!isDeepStrictEqual(registry, JSON.parse(actual('registry/contracts.json')))) return registry;
  validateSuccessorPackage();
  return JSON.parse(source('registry/contracts.json'));
}
export function withSuccessorScope(paths) {
  validateSuccessorPackage();
  return withSalesAdmissionScope([...paths, ...changedPaths, packagePath, verifierPath, ...admissionFiles]);
}
