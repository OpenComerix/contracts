import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createGitReader } from './git-source.mjs';
import { resolveSelection, operationPointers, parseSource, worktreeReader } from './graph.mjs';
import { sha256 } from './consumer-gate.mjs';
import { domainIndex } from './registry.mjs';

// Called once by the capacity's admission verifier, never by a per-file projection.
// Coverage remains a real owner test of workflow commands/inputs, not a boolean here.
export function verifyJointDelivery({ root, sourceCommit, admittedIds,
  finalRevision = null, readCurrent, semanticPaths = [], registrySha256 = null }) {
  const git = args => execFileSync('git', ['-C', root, ...args], { windowsHide: true }).toString().trim();
  const sha = value => assert(/^[a-f0-9]{40}$/.test(value ?? ''), 'JOINT_UNRESOLVED_REVISION');
  sha(sourceCommit);
  const reader = createGitReader(), source = reader(root, sourceCommit);
  if (finalRevision !== null) { sha(finalRevision); assert(!readCurrent, 'JOINT_MIXED_READERS'); }
  const head = finalRevision ?? git(['rev-parse', 'HEAD']);
  sha(head);
  git(['merge-base', '--is-ancestor', sourceCommit, head]);
  if (finalRevision !== null) assert.notEqual(head, sourceCommit, 'JOINT_ADMISSION_REQUIRED');
  // Corrections can follow B without rewriting A; their complete final SHA needs CI again.
  const current = finalRevision ? reader(root, finalRevision) : (readCurrent ?? worktreeReader(root));
  const live = new Map();
  const read = file => {
    if (!live.has(file)) live.set(file, Buffer.from(current(file)));
    return Buffer.from(live.get(file));
  };
  const json = (from, file) => JSON.parse(from(file));
  const before = json(source, 'registry/contracts.json');
  const registryBytes = read('registry/contracts.json');
  if (registrySha256 !== null) assert.equal(sha256(registryBytes), registrySha256, 'JOINT_REGISTRY_HASH');
  const after = JSON.parse(registryBytes);
  assert(Array.isArray(admittedIds) && admittedIds.length > 0 &&
    new Set(admittedIds).size === admittedIds.length, 'JOINT_IDS');
  const selected = new Set(admittedIds);
  assert.equal(new Set(after.contracts.map(row => row.id)).size, after.contracts.length, 'JOINT_DUPLICATE');
  assert.deepEqual(after.contracts.filter(row => !selected.has(row.id)), before.contracts, 'JOINT_PRIOR_DESCRIPTORS');
  const added = after.contracts.filter(row => selected.has(row.id));
  assert.deepEqual(added.map(row => row.id).sort(), [...selected].sort(), 'JOINT_ADMISSION_DELTA');
  assert(!before.contracts.some(row => selected.has(row.id)), 'JOINT_ALREADY_ADMITTED');
  assert.deepEqual(after.planned, before.planned.filter(row => !selected.has(row.id)), 'JOINT_OTHER_INTENTIONS');
  const omit = ({ contracts, planned, ...rest }) => rest;
  assert.deepEqual(omit(after), omit(before), 'JOINT_REGISTRY_PRESERVATION');
  const files = new Set(semanticPaths);
  for (const row of added) {
    const intentions = before.planned.filter(item => item.id === row.id);
    assert.equal(intentions.length, 1, 'JOINT_INTENTION');
    for (const key of ['owner', 'domain', 'path', 'version', 'operations'])
      assert.deepEqual(row[key], intentions[0][key], 'JOINT_INTENTION_' + key);
    assert.equal(row.status, 'active', 'JOINT_STATUS');
    assert.equal(row.commit, sourceCommit, 'JOINT_SOURCE');
    assert.equal(row.sha256, sha256(source(row.path)), 'JOINT_HASH');
    assert.deepEqual(row.operations, [...operationPointers(parseSource(source(row.path), row.path)).keys()], 'JOINT_OPERATIONS');
    const closure = resolveSelection(source, row,
      { version: row.version, operations: [], pointers: [''] }, after);
    for (const file of closure.files) files.add(file.path);
  }
  // One union of files, including semantic dependencies that are not $ref edges.
  for (const file of files) assert(read(file).equals(source(file)), 'JOINT_CLOSURE:' + file);
  const consumerIndex = json(source, 'registry/consumers/index.json');
  for (const file of ['registry/consumers/index.json',
    ...consumerIndex.consumers.map(row => 'registry/consumers/' + row.file)])
    assert(read(file).equals(source(file)), 'JOINT_CONSUMER:' + file);
  for (const domain of new Set([...after.contracts, ...after.planned].map(row => row.domain)))
    assert.deepEqual(json(read, domain + '/index.json'), domainIndex(after, domain), 'JOINT_INDEX');
  return { sourceCommit, checkedCommit: finalRevision, publication: 'unverified',
    evidence: finalRevision ? 'git-revision' : 'local-candidate',
    admittedIds: [...admittedIds], closureFiles: files.size, currentReads: live.size };
}
