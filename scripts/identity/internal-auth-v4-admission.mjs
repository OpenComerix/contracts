import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { resolveSelection } from '../../tools/architecture/graph.mjs';
import { verifyJointDelivery } from '../../tools/architecture/joint-delivery.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { api, policy, schema, fixtures, preparation } from './prepare-internal-auth-v4.mjs';

export const sourceCommit = '56b861d13c483eafdfa69a08b5f7b58a9dd788eb';
const registryPath = 'registry/contracts.json';
const indexPath = 'identity/index.json';
const readGit = createGitReader();
const fullSha = /^[a-f0-9]{40}$/;
const roots = new Map([
  ['identity.internal-auth.v4', [api, 'http-private']],
  ['identity.workload-token-reuse.policy.v4', [policy, 'policy']],
  ['identity.workload-token-reuse.schema.v4', [schema, 'schema']],
  ['identity.internal-auth.fixtures.v4', [fixtures, 'validation']],
  ['identity.sale-preparation-workloads.policy.v2', [preparation, 'policy']],
]);
const admittedIds = [...roots.keys()];
const paths = new Set([...roots.values()].map(([path]) => path));
const owns = row => roots.has(row.id) || paths.has(row.path) || row.materializeIn === 'ID-03';

const semanticDependencies = [
  ['identity.internal-auth.v3', []],
  ['identity.workload-token-reuse.schema.v3', []],
  ['identity.internal-auth.fixtures.v3', []],
  ['identity.catalog-workload-profiles.policy.v2', []],
  ['identity.f1-10d.identity-sales-authority-policy-v1', []],
  ['identity.sale-preparation-workloads.policy.v1', []],
  ['identity.f1-14e.iana.http-private.identity-sales-authority-v2', ['createSalesDelegation', 'checkSalesAuthorization']],
  ['identity.f1-14e.iana.http-private.identity-sales-temporal-authority-v2', ['checkSalesTemporalAuthorization']],
  ['catalog.f1-10d.catalog-sale-capture-v1', ['captureSaleCatalog']],
  ['sales.f1-10d.sales-catalog-capture-authority-v2', ['authorizeSaleCatalogCapture']],
  ['inventory.sale-context.http.v1', ['checkInventorySaleContext']],
  ['finance.sale-context.http.v1', ['checkFinanceSaleContext']],
  ['sales.context-check-authority.http.v1', ['authorizeSaleContextCheck']],
];

export function admissionRegistry(source) {
  const registry = JSON.parse(source(registryPath));
  const intents = registry.planned.filter(owns);
  assert.deepEqual(intents.map(row => row.id), admittedIds, 'ID03_SOURCE_INTENTIONS');
  const additions = intents.map(intent => {
    const [path, surface] = roots.get(intent.id);
    assert.equal(intent.path, path, intent.id);
    return {
      id: intent.id, domain: intent.domain, surface, owner: intent.owner, status: 'active',
      capability: path === preparation ? 'identity.sale-preparation-workloads' : 'identity.workload-token-reuse',
      purpose: 'Bounded reuse for the six dedicated technical profiles used in sale preparation.',
      reasonForChange: 'Admit the reviewed ID-03 source with instance isolation and fresh authority checks.',
      retirement: 'Preserve previous admissions and require explicit migration for successors.',
      version: intent.version, path, commit: sourceCommit, tag: null, tagObject: null,
      sha256: sha256(source(path)), operations: intent.operations, uriMappings: [],
    };
  });
  return {
    ...registry,
    contracts: [...registry.contracts, ...additions],
    planned: registry.planned.filter(row => !owns(row)),
  };
}

function addClosure(files, source, registry, descriptor, operations) {
  const selection = { version: descriptor.version, operations, pointers: operations.length ? [] : [''] };
  for (const file of resolveSelection(source, descriptor, selection, registry).files) files.add(file.path);
}

export function verifyInternalAuthV4Admission(root, finalRevision = null) {
  const source = readGit(root, sourceCommit);
  const registryB = admissionRegistry(source);
  const registrySha256 = sha256(JSON.stringify(registryB, null, 2) + '\n');
  const semanticPaths = new Set([
    'scripts/identity/prepare-internal-auth-v4.mjs',
    'test/identity/internal-auth-v4.test.mjs',
  ]);
  for (const [id, operations] of semanticDependencies) {
    const descriptor = registryB.contracts.find(row => row.id === id);
    assert.equal(descriptor?.status, 'active', id);
    addClosure(semanticPaths, source, registryB, descriptor, operations);
  }
  const git = (...args) => execFileSync('git', ['-C', root, '--no-replace-objects', ...args],
    { encoding: 'utf8', windowsHide: true }).trim();
  const options = { root, sourceCommit, admittedIds, semanticPaths, registrySha256 };
  if (finalRevision === null) {
    assert.equal(git('rev-parse', 'HEAD'), sourceCommit, 'ID03_LOCAL_BASE');
    return verifyJointDelivery(options);
  }
  assert(fullSha.test(finalRevision) && finalRevision !== sourceCommit, 'ID03_FINAL_REVISION');
  const [initial] = git('rev-list', '--first-parent', '--ancestry-path', '--reverse',
    sourceCommit + '..' + finalRevision).split(/\r?\n/);
  assert(fullSha.test(initial), 'ID03_LINEAGE');
  assert.equal(git('rev-list', '--parents', '-n', '1', initial), initial + ' ' + sourceCommit, 'ID03_LINEAGE');
  const proof = verifyJointDelivery({ ...options, finalRevision: initial });
  if (initial === finalRevision) return proof;

  // Later revisions can migrate consumers and extend the registry. Check the
  // immutable initial admission and the ID-03 closure on the requested SHA.
  const current = readGit(root, finalRevision);
  const registry = JSON.parse(current(registryPath));
  const descriptors = registryB.contracts.filter(owns);
  assert.deepEqual(registry.contracts.filter(owns), descriptors, 'ID03_DESCRIPTORS');
  assert(!registry.planned.some(owns), 'ID03_STILL_PLANNED');
  assert.deepEqual(JSON.parse(current(indexPath)), domainIndex(registry, 'identity'), 'ID03_INDEX');
  for (const descriptor of descriptors) addClosure(semanticPaths, source, registryB, descriptor, []);
  for (const file of semanticPaths) assert(current(file).equals(source(file)), 'ID03_CLOSURE:' + file);
  return { sourceCommit, checkedCommit: finalRevision, initialAdmission: initial, publication: 'unverified',
    evidence: 'preserved-admission', admittedIds, closureFiles: semanticPaths.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--revision' && fullSha.test(args[1])),
    'Expected --revision FULL_SHA or no arguments for the local candidate');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  console.log(JSON.stringify(verifyInternalAuthV4Admission(root, args[1])));
}
