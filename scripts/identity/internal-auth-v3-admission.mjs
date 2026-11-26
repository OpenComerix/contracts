import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { resolveSelection } from '../../tools/architecture/graph.mjs';
import { verifyJointDelivery } from '../../tools/architecture/joint-delivery.mjs';
import { domainIndex } from '../../tools/architecture/registry.mjs';
import { api, policy, schema, fixtures } from './prepare-internal-auth-v3.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceCommit = '1b39f102ba453b2040dffccf030096fb8679d705';
const roots = new Map([
  ['identity.internal-auth.v3', [api, 'http-private']],
  ['identity.workload-token-reuse.policy.v3', [policy, 'policy']],
  ['identity.workload-token-reuse.schema.v3', [schema, 'schema']],
  ['identity.internal-auth.fixtures.v3', [fixtures, 'validation']],
]);
const admittedIds = [...roots.keys()];
const rootPaths = new Set([...roots.values()].map(([file]) => file));
const belongsToAdmission = row => roots.has(row.id) || rootPaths.has(row.path) || row.materializeIn === 'ID-02';
const semanticFiles = [
  'identity/http/shared/v1/identity-sales-authority-policy-v1.json',
  'identity/http/private/v2/identity-internal-auth-v2.yaml',
  'identity/http/shared/v2/identity-workload-token-reuse-policy-v2.json',
  'identity/fixtures/internal-auth/v2/policy-cases-v2.json',
  'openapi/identity-internal-auth-v1.yaml',
];
const decisionOperations = [
  ['identity.f1-14e.iana.http-private.identity-sales-authority-v2', 'checkSalesAuthorization'],
  ['identity.f1-14e.iana.http-private.identity-sales-temporal-authority-v2', 'checkSalesTemporalAuthorization'],
];
const registryPath = 'registry/contracts.json';
const readGit = createGitReader();

export function admissionRegistry(source) {
  const registry = JSON.parse(source(registryPath));
  const additions = admittedIds.map(id => {
    const [path, surface] = roots.get(id);
    const intent = registry.planned.find(row => row.id === id);
    assert.equal(intent?.path, path, id);
    return {
      id, domain: intent.domain, surface, owner: intent.owner, status: 'active',
      capability: 'identity.workload-token-reuse',
      purpose: 'H1A v3 bounded workload reuse, adding the fixed Sales-to-Identity authority profile.',
      reasonForChange: 'Admit the ID-02 source and preserve a fresh human decision on every authority request.',
      retirement: 'Preserve earlier H1A admissions and require explicit migration for future successors.',
      version: intent.version, path, commit: sourceCommit, tag: null, tagObject: null,
      sha256: sha256(source(path)), operations: intent.operations, uriMappings: [],
    };
  });
  return {
    ...registry,
    contracts: [...registry.contracts, ...additions],
    planned: registry.planned.filter(row => !roots.has(row.id)),
  };
}

export function verifyInternalAuthV3Admission(directory, finalRevision = null, readCurrent) {
  const source = readGit(directory, sourceCommit);
  const sourceB = admissionRegistry(source);
  const registrySha256 = sha256(JSON.stringify(sourceB, null, 2) + '\n');
  const semanticPaths = new Set(semanticFiles);
  for (const [id, operation] of decisionOperations) {
    const descriptor = sourceB.contracts.find(row => row.id === id);
    assert.equal(descriptor?.status, 'active', id);
    const selection = { version: descriptor.version, operations: [operation], pointers: [] };
    for (const file of resolveSelection(source, descriptor, selection, sourceB).files) semanticPaths.add(file.path);
  }
  const options = { root: directory, sourceCommit, admittedIds, semanticPaths, registrySha256 };
  if (finalRevision === null) return verifyJointDelivery({ ...options, readCurrent });
  assert.equal(readCurrent, undefined, 'ID02_MIXED_READERS');
  assert.match(finalRevision, /^[a-f0-9]{40}$/, 'ID02_REVISION');
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { windowsHide: true }).toString().trim();
  const lineage = git('rev-list', '--ancestry-path', '--first-parent', '--reverse', sourceCommit + '..' + finalRevision);
  const initial = lineage.split(/\r?\n/)[0];
  assert.match(initial, /^[a-f0-9]{40}$/, 'ID02_ADMISSION_REQUIRED');
  assert.equal(git('rev-list', '--parents', '-n', '1', initial), initial + ' ' + sourceCommit, 'ID02_LINEAGE');
  if (initial === finalRevision) return verifyJointDelivery({ ...options, finalRevision });

  const current = readGit(directory, finalRevision);
  const registryBytes = current(registryPath);

  // B preserves the consumers of A. Later commits preserve the ID-02 package
  // and can update consumers and unrelated registry entries.
  const proof = verifyJointDelivery({ ...options, finalRevision: initial });
  const registry = JSON.parse(registryBytes);
  const admitted = registry.contracts.filter(belongsToAdmission);
  assert.deepEqual(admitted, sourceB.contracts.slice(-roots.size), 'ID02_DESCRIPTORS');
  assert(!registry.planned.some(belongsToAdmission), 'ID02_STILL_PLANNED');
  assert.deepEqual(JSON.parse(current('identity/index.json')), domainIndex(registry, 'identity'), 'ID02_INDEX');
  const files = new Set(semanticPaths);
  for (const row of admitted) {
    const selection = { version: row.version, operations: [], pointers: [''] };
    for (const file of resolveSelection(source, row, selection, sourceB).files) files.add(file.path);
  }
  for (const file of files) assert(current(file).equals(source(file)), 'ID02_CLOSURE:' + file);
  return { ...proof, checkedCommit: finalRevision, initialAdmission: initial, evidence: 'preserved-admission' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--revision' && /^[a-f0-9]{40}$/.test(args[1])),
    'Expected --revision FULL_SHA or no arguments for the local candidate');
  console.log(JSON.stringify(verifyInternalAuthV3Admission(root, args[1])));
}
