import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock, worktreeReader } from '../../tools/architecture/graph.mjs';
import { sha256, validateShape } from '../../tools/architecture/consumer-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const operationalBase = '9e2039713f6ffb33e86d38a4d420db954152fe7f';
export const operationalServiceBase = 'e13561144c78144a0937eec90c7a2c06f271f2b7';
export const operationalSnapshotPath = 'registry/consumers/catalog-pricing.json';
const source = gitReader(root, operationalBase);
const baseline = file => JSON.parse(source(file));
const readSnapshot = () => JSON.parse(fs.readFileSync(path.join(root, operationalSnapshotPath), 'utf8'));
const rows = [
  ['catalog.history-recovery.http.v1', 'producer', ['createCatalogHistoryRecovery', 'readCatalogHistoryRecoveryPage'], []],
  ['catalog.history-recovery.protocol.v1', 'consumer', [], ['']],
  ['catalog.history-recovery.policy.v1', 'consumer', [], ['']],
  ['identity.catalog-recovery-verification.http.v2', 'consumer', ['verifyCatalogRecoveryGrantV2'], []],
  ['identity.catalog-recovery-verification.policy.v2', 'consumer', [], ['']],
];
const gates = ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:e2e'];
let expectedSnapshot;

// Reconstruct only the approved metadata delta from immutable contracts sources.
// Standalone CI checks contents/lifecycle; consumers --local separately reads the
// actual published service revision. Neither this gate nor a state label proves CI.
export function operationalSnapshot() {
  if (!expectedSnapshot) {
    const previous = baseline(operationalSnapshotPath), registry = baseline('registry/contracts.json');
    assert.equal(previous.manifest.contracts.length, 43, 'O2_RECOVERY_BASE');
    assert.equal(previous.lock.entries.length, 43, 'O2_RECOVERY_BASE');
    const manifest = { ...previous.manifest, contracts: [...previous.manifest.contracts,
      ...rows.map(([id, role, operations, pointers]) => {
        const descriptor = registry.contracts.find(row => row.id === id);
        assert.equal(descriptor?.status, 'active', 'O2_RECOVERY_ACTIVE_ROOT');
        assert.equal(descriptor.commit, '28be1edf02a3771629febf554f8b5f4856452877', 'O2_RECOVERY_SOURCE');
        return { id, role, version: descriptor.version, operations: [...operations], pointers: [...pointers],
          purpose: 'F1-08O2 recovery contract admission prerequisite; no runtime composition or functional activation.',
          gates: [...gates] };
      })] };
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    const lock = makeLock(root, manifest, bytes, registry, previous.lock.entries);
    validateShape(manifest, baseline('registry/manifest-v1.schema.json'));
    validateShape(lock, baseline('registry/lock-v1.schema.json'));
    assert(isDeepStrictEqual(lock.entries.slice(0, 43), previous.lock.entries), 'O2_RECOVERY_PRIOR_PINS');
    expectedSnapshot = { formatVersion: 1, publication: 'local-candidate',
      sourceRepository: 'opencomerix/catalog-pricing', sourceCommit: operationalServiceBase,
      manifestSha256: sha256(bytes), lockSha256: sha256(JSON.stringify(lock, null, 2) + '\n'), manifest, lock };
  }
  return structuredClone(expectedSnapshot);
}

export function validateOperationalSnapshot(snapshot = readSnapshot()) {
  assert(['local-candidate', 'published'].includes(snapshot?.publication), 'O2_RECOVERY_SNAPSHOT: lifecycle');
  assert(typeof snapshot.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(snapshot.sourceCommit),
    'O2_RECOVERY_SNAPSHOT: unresolved source revision');
  const candidate = operationalSnapshot();
  const expected = snapshot.publication === 'published'
    ? { ...candidate, publication: 'published', sourceCommit: snapshot.sourceCommit } : candidate;
  assert(isDeepStrictEqual(snapshot, expected), 'O2_RECOVERY_SNAPSHOT');
  return { dependencies: 48, previous_preserved: 43, new_producers: 1, new_consumers: 4, functional_activation: false };
}

// Detect even a partial suffix in either manifest or lock. Never truncate an
// arbitrary newer export: first verify the complete reviewed package, then return
// the immutable published N snapshot. Old fixtures retain their own diagnostics.
export function operationalSnapshotView(snapshot) {
  const selections = snapshot?.manifest?.contracts, entries = snapshot?.lock?.entries;
  const recoverySelection = row => rows.some(([id]) => row?.id === id && row.role !== 'validation');
  const recovery = snapshot?.sourceCommit === operationalServiceBase ||
    [selections, entries].some(list => Array.isArray(list) && list.some(recoverySelection));
  if (!recovery) return snapshot;
  validateOperationalSnapshot(snapshot);
  return baseline(operationalSnapshotPath);
}

export function validateOperationalPreservation(read = worktreeReader(root)) {
  const registry = baseline('registry/contracts.json');
  const files = new Set(['.gitlab-ci.yml', 'package.json', 'pnpm-lock.yaml', 'registry/contracts.json',
    'registry/consumers/index.json', 'catalog/index.json', 'identity/index.json', 'common/index.json',
    ...registry.requiredConsumers.filter(name => name !== 'catalog-pricing').map(name => 'registry/consumers/' + name + '.json'),
    ...registry.contracts.map(row => row.path), ...registry.preservedFiles.map(row => row.path),
    ...['cli', 'graph', 'registry', 'consumer-gate'].map(name => 'tools/architecture/' + name + '.mjs')]);
  for (const file of files) {
    const actual = read(file), expected = source(file);
    assert(actual.equals(expected) || Buffer.from(actual.toString('utf8').replaceAll('\r\n', '\n')).equals(expected),
      'O2_RECOVERY_PRESERVED:' + file);
  }
  return { roots: registry.contracts.length, preserved_artifacts: registry.preservedFiles.length, other_consumers: 4 };
}
