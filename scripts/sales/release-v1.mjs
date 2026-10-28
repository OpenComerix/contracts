import { readRepositoryFile } from '../ci/retired-gitlab-v1.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {gitReader, parseSource, operationPointers, resolveSelection} from '../../tools/architecture/graph.mjs';
import {sha256} from '../../tools/architecture/consumer-gate.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {successorHistoricalFile,successorHistoricalRegistry,withSuccessorScope} from '../identity/inventory-authority-v1-1.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const releaseSource = '7cd2b548fb909c5eff47d0319c162c498ee68e92';
export const source = gitReader(root, releaseSource);
export const integrationPath = 'sales/fixtures/integration/v1/';
export const packagePath = integrationPath + 'package.json';
export const verifierPath = 'scripts/sales/release-v1.mjs';
export const expectedPackageHash = '9d111ecc393a4728ebda6fd9ae128f10a43d70d207d05ee1cdc968f8b916671d';
export const text = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes).replaceAll('\r\n', '\n');
export const digest = bytes => sha256(text(bytes));
const raw = file => successorHistoricalFile(file, readRepositoryFile(file));
export const baseline = () => JSON.parse(source('registry/contracts.json'));
const selected = () => baseline().planned.filter(row => /^F1-10[BCD]$/u.test(row.materializeIn));
const candidatePath = row => {
  const match = /^Candidate source (\S+) only;/u.exec(row.constraint);
  assert(match, 'E_INTENTION_SOURCE:' + row.id);
  return match[1];
};
// These five files are already part of the published D package. They close its
// URI dependencies and the explicit validation dependencies of its policies.
export const support = Object.freeze([
  ['catalog.f1-10e.sale-capture.schema.v1', 'catalog', 'catalog-pricing', 'catalog/http/shared/v1/catalog-sale-capture-v1.schema.json'],
  ['common.f1-10e.error-catalog.schema.v11', 'common', 'platform-contracts', 'common/errors/v11/error-catalog-v11.schema.json'],
  ['identity.f1-10e.sales-authority.schema.v1', 'identity', 'identity-tenancy', 'identity/http/shared/v1/identity-sales-authority-v1.schema.json'],
  ['sales.f1-10e.catalog-capture-authority.schema.v2', 'sales', 'sales-pos', 'sales/http/shared/v2/sales-catalog-capture-authority-v2.schema.json'],
  ['sales.f1-10e.lifecycle-policy.schema.v2', 'sales', 'sales-pos', 'sales/http/shared/v2/sales-lifecycle-policy-v2.schema.json'],
]);

export function admissionRows() {
  const before = baseline();
  const entries = [...selected().map(row => [row.id, row.domain, row.owner, candidatePath(row)]), ...support];
  assert.equal(entries.length, 78, 'E_SELECTION_COUNT');
  const mappings = new Map(before.contracts.flatMap(row => row.uriMappings).map(row => [row.uri, row]));
  for (const [, , , file] of entries) {
    const document = parseSource(source(file), file);
    if (document.$id) {
      assert(!mappings.has(document.$id) || mappings.get(document.$id).path === file, 'E_URI_COLLISION');
      mappings.set(document.$id, {uri: document.$id, path: file});
    }
  }
  const rows = entries.map(([id, domain, owner, file]) => {
    const bytes = source(file), document = parseSource(bytes, file);
    const major = /\/v(\d+)\//u.exec(file)[1];
    const surface = document.openapi ? (file.includes('/public/') ? 'http-public' : 'http-private')
      : document.asyncapi ? 'documentation' : file.endsWith('.schema.json') ? (file.includes('/commands/') ? 'commands' : file.includes('/events/') && !file.includes('.consumer.') ? 'events' : 'schema')
      : file.includes('/errors/') ? 'errors' : 'policy';
    return {
      id, domain, surface, owner, status: 'active', capability: domain + '.online-sale-f1',
      purpose: 'F1-10E selected contractual admission; consumers and owner runtimes require their own accepted cuts.',
      reasonForChange: 'Joint B-D release preparation from audited published sources; source dev/SHA CI verified before admission.',
      retirement: 'Preserve this source and closure; incompatible evolution requires a successor and explicit migration.',
      version: document.info?.version ?? (surface === 'errors' ? String(document.version) : 'v' + major),
      path: file, commit: releaseSource, tag: null, tagObject: null, sha256: sha256(bytes),
      operations: [...operationPointers(document).keys()], uriMappings: [],
    };
  });
  const registry = {...before, contracts: [...before.contracts, ...rows]};
  for (const row of rows) {
    const closure = resolveSelection(source, {...row, uriMappings: [...mappings.values()]},
      {version: row.version, operations: [], pointers: ['']}, registry);
    const paths = new Set(closure.files.map(file => file.path));
    row.uriMappings = [...mappings.values()].filter(mapping => paths.has(mapping.path));
    for (const file of closure.files) {
      assert(!registry.contracts.some(entry => entry.path === file.path && entry.status === 'draft'), 'E_DRAFT_CLOSURE');
      assert.equal(digest(raw(file.path)), digest(source(file.path)), 'E_SOURCE_BYTES:' + file.path);
    }
  }
  return rows;
}

export function admittedRegistry() {
  const before = baseline(), rows = admissionRows(), ids = new Set(rows.map(row => row.id));
  return {...before, contracts: [...before.contracts, ...rows],
    planned: before.planned.filter(row => !ids.has(row.id) && row.id !== 'sales.complete-snapshot.successor')};
}

export function validateAdmission(registry = JSON.parse(raw('registry/contracts.json'))) {
  const expected = admittedRegistry();
  assert.deepEqual(registry, expected, 'E_EXACT_ADMISSION');
  assert.equal(registry.planned.length, 2, 'E_UNRELATED_PLANNED');
  assert.equal(registry.contracts.length, 199, 'E_ROOT_COUNT');
  for (const row of registry.contracts.slice(121)) for (const mapping of row.uriMappings)
    assert(registry.contracts.some(entry => entry.path === mapping.path), 'E_UNREGISTERED_MAPPING');
  return {roots: 199, added: 78, preserved: 236, planned: 2, runtime_demonstrated: false};
}

export function integrationCI() {
  const previous = parseSource(source('.gitlab-ci.yml'),'.gitlab-ci.yml');
  const contracts = structuredClone(previous['validate:sales-contracts']);
  contracts.script = ['node scripts/sales/run-integration-v1.mjs semantics', 'node scripts/sales/integration-schema-v1.mjs .ci-artifacts/sales-integration-v1-ci'];
  contracts.artifacts.paths = ['.ci-artifacts/sales-integration-v1-*/'];
  const schema = structuredClone(previous['validate:sales-schema']);
  schema.needs = [{job:'validate:sale-flow-integration',artifacts:true}];
  schema.script = ['sh scripts/sales/validate-v2.sh .ci-artifacts/sales-integration-v1-ci'];
  return {'validate:sale-flow-integration':contracts,'validate:sale-flow-integration-schema':schema};
}
export function validateReleaseCI(actual = parseSource(raw('.gitlab-ci.yml'),'.gitlab-ci.yml')) {
  const before = parseSource(source('.gitlab-ci.yml'),'.gitlab-ci.yml');
  for (const [key,value] of Object.entries(before)) assert.deepEqual(actual[key],value,'E_PRIOR_CI:' + key);
  assert.deepEqual(Object.keys(actual).filter(key=>!Object.hasOwn(before,key)),Object.keys(integrationCI()),'E_CI_SCOPE');
  for (const [key,value] of Object.entries(integrationCI())) assert.deepEqual(actual[key],value,'E_INTEGRATION_CI:' + key);
  return {prior_jobs:20,new_jobs:2};
}

const modified = new Set([
  'registry/contracts.json', ...['sales', 'inventory', 'finance', 'identity', 'catalog', 'common'].map(domain => domain + '/index.json'),
  'sales/README.md', 'inventory/README.md', 'finance/README.md', 'registry/README.md',
  '.gitlab-ci.yml', 'scripts/sales/reviewed-package-v2.mjs', 'test/sales/package-v2.test.mjs',
]);
const allowedNew = file => file.startsWith(integrationPath) ||
  ['scripts/sales/integration-v1.mjs', 'scripts/sales/integration-schema-v1.mjs', 'scripts/sales/run-integration-v1.mjs',
    'test/sales/integration-v1.test.mjs', 'test/sales/release-v1.test.mjs'].includes(file);
let verified;
export function validateReleasePackage(read = raw) {
  if (read === raw && verified) return verified;
  const bytes = read(packagePath);
  assert.equal(digest(bytes), expectedPackageHash, 'E_PACKAGE_DIGEST');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.base, releaseSource, 'E_BASE');
  assert.equal(manifest.runtime_demonstrated, false, 'E_RUNTIME');
  assert.equal(manifest.publication, 'pending', 'E_PUBLICATION');
  assert.equal(new Set(manifest.files.map(row => row.path)).size, manifest.files.length, 'E_DUPLICATE');
  for (const entry of manifest.files) {
    assert(!entry.path.includes('..') && !entry.path.includes('\\') && !path.posix.isAbsolute(entry.path), 'E_PATH');
    assert(entry.kind === 'modified' ? modified.has(entry.path) : entry.kind === 'new' && allowedNew(entry.path), 'E_SCOPE:' + entry.path);
    assert.equal(digest(read(entry.path)), entry.sha256, 'E_PACKAGE_BYTES:' + entry.path);
    if (entry.kind === 'modified') assert.equal(digest(source(entry.path)), entry.previous_sha256, 'E_PRIOR_BYTES:' + entry.path);
  }
  validateAdmission(JSON.parse(read('registry/contracts.json')));
  validateReleaseCI(parseSource(read('.gitlab-ci.yml'),'.gitlab-ci.yml'));
  for (const domain of ['sales', 'inventory', 'finance', 'identity', 'catalog', 'common'])
    assert.deepEqual(JSON.parse(read(domain + '/index.json')), domainIndex(admittedRegistry(), domain), 'E_INDEX:' + domain);
  const before = baseline();
  for (const file of ['package.json', 'pnpm-lock.yaml', 'registry/consumers/index.json', ...before.requiredConsumers.map(owner => 'registry/consumers/' + owner + '.json')])
    assert.equal(digest(read(file)), digest(source(file)), 'E_CONSUMER_OR_DEPENDENCY:' + file);
  for (const entry of [...before.contracts, ...before.preservedFiles])
    assert.equal(digest(read(entry.path)), digest(source(entry.path)), 'E_PUBLISHED:' + entry.path);
  for (const file of ['inventory/fixtures/acceptance/v1/package.json', 'finance/fixtures/acceptance/v1/package.json', 'sales/fixtures/acceptance/v2/package.json']) {
    assert.equal(digest(read(file)), digest(source(file)), 'E_PRIOR_PACKAGE');
    for (const entry of JSON.parse(source(file)).files) if (!modified.has(entry.path))
      assert.equal(digest(read(entry.path)), digest(source(entry.path)), 'E_BCD_BYTES:' + entry.path);
  }
  const allowed = withSuccessorScope([packagePath,verifierPath,...manifest.files.map(entry=>entry.path)]);
  for (const args of [['diff','--name-only',releaseSource],['ls-files','--others','--exclude-standard']])
    for (const file of execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean)) assert(allowed.has(file),'E_UNDECLARED_PATH:' + file);
  const result = {manifest, ...validateAdmission(JSON.parse(read('registry/contracts.json')))};
  if (read === raw) verified = result;
  return result;
}

// Only the complete pinned E package can project its exact reviewed changes to
// D's historical view. Mutated caller input is never repaired or normalized.
export function releaseHistoricalFile(file, bytes) {
  bytes = successorHistoricalFile(file, bytes);
  const {manifest} = validateReleasePackage();
  const entry = manifest.files.find(row => row.kind === 'modified' && row.path === file);
  return entry && digest(bytes) === entry.sha256 ? source(file) : bytes;
}
export function releaseHistoricalRegistry(registry) {
  registry = successorHistoricalRegistry(registry);
  if (!isDeepStrictEqual(registry, JSON.parse(raw('registry/contracts.json')))) return registry;
  validateReleasePackage();
  return baseline();
}
export function withReleaseScope(paths) {
  const {manifest} = validateReleasePackage();
  return withSuccessorScope([...paths, packagePath, verifierPath, ...manifest.files.map(row => row.path)]);
}
