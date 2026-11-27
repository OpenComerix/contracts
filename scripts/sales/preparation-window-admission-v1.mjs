import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { resolveSelection, worktreeReader } from '../../tools/architecture/graph.mjs';
import { verifyJointDelivery } from '../../tools/architecture/joint-delivery.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { consumerExportBase, consumerExportHashes, verifyPreparationWindowConsumerExports } from './preparation-window-consumer-exports.mjs';
import { contracts } from './preparation-window-v1.mjs';

export const sourceCommit = '58da655b33cbb0d83b10ba5be6dd5fe4917f1031';
export const registryPath = 'registry/contracts.json';
const fullSha = /^[a-f0-9]{40}$/u;
const gitReader = createGitReader();

const predecessorIds = [
  'sales.f1-10d.sales-catalog-capture-authority-v2',
  'sales.context-check-authority.http.v1',
  'catalog.f1-10d.catalog-sale-capture-v1',
  'inventory.sale-context.http.v1',
  'finance.sale-context.http.v1',
];
const roots = [
  ...contracts.map((entry, index) => ({ ...entry, surface: 'http-private', predecessor: predecessorIds[index] })),
  {
    id: 'sales.protocol-policy.v3', domain: 'sales', owner: 'sales-pos', surface: 'policy',
    path: 'sales/http/shared/v3/sales-protocol-policy-v3.json', version: 'v3', operations: [],
    predecessor: 'sales.f1-10d.sales-protocol-policy-v2', previous: 'sales/http/shared/v2/sales-protocol-policy-v2.json',
  },
  {
    id: 'sales.preparation-window.fixtures.v1', domain: 'sales', owner: 'sales-pos', surface: 'validation',
    path: 'sales/fixtures/preparation-window/v1/scenarios.json', version: 'v1', operations: [],
  },
];
export const admittedIds = roots.map(entry => entry.id);
export const admissionDomains = [...new Set(roots.map(entry => entry.domain))];
const ids = new Set(admittedIds);
const paths = new Set(roots.map(entry => entry.path));
const inScope = entry => ids.has(entry.id) || paths.has(entry.path) || entry.materializeIn === 'ID-04';

// These inputs are consumed by ID-04 without a $ref from the admitted roots.
const semanticPaths = [
  ...roots.flatMap(entry => entry.previous ? [entry.previous] : []),
  'identity/http/shared/v1/identity-branch-time-zone-policy-v1.json',
  'identity/http/shared/v1/identity-sales-authority-policy-v1.json',
  'identity/http/shared/v2/identity-sale-preparation-workloads-v2.json',
  'identity/http/shared/v2/identity-catalog-workload-profiles-v2.json',
  'identity/http/shared/v4/identity-workload-token-reuse-policy-v4.json',
  'identity/http/shared/v4/identity-workload-token-reuse-policy-v4.schema.json',
  'common/errors/v11/error-catalog-v11.json',
  'catalog/fixtures/sale-capture/v1/capture.json',
  'sales/fixtures/preparation/v1/contexts.json',
  'scripts/sales/preparation-window-v1.mjs',
  'scripts/sales/validate-preparation-window-v1.sh',
];
const semanticOperations = [
  ['identity.f1-14e.iana.http-private.identity-sales-temporal-authority-v2', ['checkSalesTemporalAuthorization']],
  ['identity.internal-auth.v4', ['issueInternalServiceToken', 'getInternalIdentityJwks']],
];
const adaptedValidationScript = 'scripts/sales/preparation-window-v1.mjs';
const adaptedValidationHash = 'e4682514ff72e258b3a41826e508affaa29e75eb597b86db044d012d1ddea8b6';

export function admissionRegistry(source) {
  const registry = JSON.parse(source(registryPath));
  const intents = registry.planned.filter(inScope);
  assert.deepEqual(intents.map(entry => entry.id), admittedIds, 'ID04_SOURCE_INTENTIONS');
  assert(!registry.contracts.some(inScope), 'ID04_ALREADY_ADMITTED');
  const admissions = roots.map((entry, index) => {
    const { id, domain, owner, surface, path, version, operations } = entry;
    const intent = intents[index];
    assert.equal(intent.status, 'planned', id);
    assert.equal(intent.materializeIn, 'ID-04', id);
    for (const key of ['domain', 'owner', 'path', 'version', 'operations']) {
      assert.deepEqual(intent[key], entry[key], `ID04_INTENTION:${id}:${key}`);
    }
    const predecessor = registry.contracts.find(row => row.id === entry.predecessor);
    if (entry.predecessor) assert.equal(predecessor?.path, entry.previous, `ID04_PREDECESSOR:${id}`);
    return {
      id, domain, surface, owner, status: 'active',
      capability: predecessor?.capability ?? 'sales.preparation-window',
      purpose: 'Contractual source for the bounded read window and fresh acceptance decision in online sales.',
      reasonForChange: 'Admit the reviewed ID-04 source. Consumer activation requires the complete CI of the admission revision.',
      retirement: 'Preserve predecessor bytes and migrate the four preparation owners as a compatible cohort.',
      version, path, commit: sourceCommit, tag: null, tagObject: null,
      sha256: sha256(source(path)), operations, uriMappings: predecessor?.uriMappings ?? [],
    };
  });
  return {
    ...registry,
    contracts: [...registry.contracts, ...admissions],
    planned: registry.planned.filter(entry => !inScope(entry)),
  };
}

export function verifyPreparationWindowAdmission(root, finalRevision = null, readCurrent) {
  const git = (...args) => execFileSync('git', ['-C', root, '--no-replace-objects', ...args],
    { encoding: 'utf8', windowsHide: true }).trim();
  const head = finalRevision ?? git('rev-parse', 'HEAD');
  assert(fullSha.test(head), 'ID04_FINAL_REVISION');
  const consumerExports = head !== sourceCommit &&
    (finalRevision === null || head !== consumerExportBase) &&
    git('merge-base', consumerExportBase, head) === consumerExportBase;
  if (finalRevision !== null) assert(!readCurrent, 'JOINT_MIXED_READERS');
  if (finalRevision === null) {
    assert(head === sourceCommit || consumerExports, 'ID04_LOCAL_BASE');
  } else {
    assert(fullSha.test(finalRevision) && finalRevision !== sourceCommit, 'ID04_FINAL_REVISION');
    const [initial] = git('rev-list', '--first-parent', '--ancestry-path', '--reverse',
      `${sourceCommit}..${finalRevision}`).split(/\r?\n/u);
    assert(fullSha.test(initial), 'ID04_ADMISSION_LINEAGE');
    assert.equal(git('rev-list', '--parents', '-n', '1', initial), `${initial} ${sourceCommit}`, 'ID04_ADMISSION_LINEAGE');
  }
  const source = gitReader(root, sourceCommit);
  const registry = admissionRegistry(source);
  const registrySha256 = sha256(JSON.stringify(registry, null, 2) + '\n');
  const dependencies = new Set(semanticPaths);
  for (const [id, operations] of semanticOperations) {
    const descriptor = registry.contracts.find(entry => entry.id === id);
    assert.equal(descriptor?.status, 'active', `ID04_DEPENDENCY:${id}`);
    const selection = { version: descriptor.version, operations, pointers: [] };
    for (const file of resolveSelection(source, descriptor, selection, registry).files) dependencies.add(file.path);
  }
  const options = { root, sourceCommit, admittedIds, semanticPaths: dependencies, registrySha256 };
  if (!consumerExports) return verifyJointDelivery({ ...options, finalRevision, readCurrent });

  // The original admission must still pass without projecting a single input.
  verifyJointDelivery({ ...options, finalRevision: consumerExportBase });
  const current = finalRevision === null ? (readCurrent ?? worktreeReader(root)) : gitReader(root, finalRevision);
  const read = file => finalRevision === null
    ? Buffer.from(current(file).toString('latin1').replaceAll('\r\n', '\n'), 'latin1')
    : current(file);
  assert.equal(sha256(read(registryPath)), registrySha256, 'ID04_EXPORT_REGISTRY');
  verifyPreparationWindowConsumerExports(read);
  const indexPath = 'registry/consumers/index.json';
  const index = JSON.parse(source(indexPath));
  for (const file of [indexPath, ...index.consumers.map(row => 'registry/consumers/' + row.file)]) {
    if (!Object.hasOwn(consumerExportHashes, file)) {
      assert(read(file).equals(source(file)), 'ID04_EXPORT_UNRELATED:' + file);
    }
  }
  for (const entry of registry.contracts.filter(inScope)) {
    const selection = { version: entry.version, operations: [], pointers: [''] };
    for (const file of resolveSelection(source, entry, selection, registry).files) dependencies.add(file.path);
  }
  for (const file of dependencies) {
    const bytes = read(file);
    if (file === adaptedValidationScript) {
      assert.equal(sha256(bytes), adaptedValidationHash, 'ID04_EXPORT_VALIDATION_SCRIPT');
    } else {
      assert(bytes.equals(source(file)), 'ID04_EXPORT_CLOSURE:' + file);
    }
  }
  for (const domain of new Set([...registry.contracts, ...registry.planned].map(row => row.domain))) {
    assert.deepEqual(JSON.parse(read(domain + '/index.json')), domainIndex(registry, domain), 'ID04_EXPORT_INDEX');
  }
  return { sourceCommit, checkedCommit: finalRevision, admissionRevision: consumerExportBase,
    publication: 'unverified', evidence: finalRevision === null ? 'local-candidate' : 'preserved-admission',
    admittedIds, closureFiles: dependencies.size, consumerExports: Object.keys(consumerExportHashes) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--revision' && fullSha.test(args[1])),
    'Expected --revision FULL_SHA or no arguments for the local candidate');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  console.log(JSON.stringify(verifyPreparationWindowAdmission(root, args[1])));
}
