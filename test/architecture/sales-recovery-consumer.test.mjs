import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import {
  recoveryBase, recoverySalesBase, recoverySnapshotPath as file, recoveryFiles,
  recoveryReadmeSection, encodeRecovery as encode, createRecoverySnapshot,
  validateRecoverySnapshot, validateRecoverySalesSource,
  projectRecoveryFile, projectRecoveryDocument, withRecoveryScope,
} from '../../scripts/sales/recovery-consumer-v1.mjs';
import { withReviewedValidationScope, validateValidationTooling } from '../../tools/architecture/validation-history.mjs';
import { readRepositoryFile } from '../../scripts/ci/retired-gitlab-v1.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const source = createGitReader()(root, recoveryBase);
const bytes = read(file), snapshot = JSON.parse(bytes), prior = JSON.parse(source(file));

test('D resolves four existing selections once, preserving every C pin, asset and other selection', () => {
  assert.deepEqual(validateRecoverySnapshot(snapshot), {
    preservedSelections: 45, extendedSelections: 4, newAssets: 0, runtimeDemonstrated: false,
  });
  assert.deepEqual(snapshot, createRecoverySnapshot());
  assert.equal(snapshot.sourceCommit, recoverySalesBase);
  assert.equal(snapshot.publication, 'local-candidate');
  const changed = [];
  prior.lock.entries.forEach((entry, i) => {
    const next = snapshot.lock.entries[i];
    for (const key of ['id', 'role', 'version', 'commit', 'tag', 'tagObject', 'root'])
      assert.equal(next[key], entry[key], key);
    if (JSON.stringify(entry) === JSON.stringify(next)) return;
    changed.push(entry.id);
    assert(entry.units.every(unit => next.units.some(row => JSON.stringify(row) === JSON.stringify(unit))));
  });
  assert.equal(changed.length, 4);
  assert.deepEqual(snapshot.lock.assets, prior.lock.assets);
  assert.deepEqual(snapshot.manifest.assets, prior.manifest.assets);
  assert.deepEqual(validateRecoverySalesSource(name => encode(
    name === 'contracts.manifest.json' ? prior.manifest : prior.lock)),
  { sourceCommit: recoverySalesBase, verifiedFiles: 2 });
});
test('exact D adapters isolate returned values and perform no live checks per historical row', t => {
  projectRecoveryFile(file, bytes);
  const historical = source(file);
  t.mock.method(fs, 'readFileSync', () => { throw Error('unexpected live read'); });
  for (let i = 0; i < 100; i++) assert(projectRecoveryFile(file, bytes).equals(historical));
  const output = projectRecoveryFile(file, bytes); output.fill(0);
  assert(projectRecoveryFile(file, bytes).equals(historical));
  const document = projectRecoveryDocument(file, snapshot); document.lock.entries.pop();
  assert.deepEqual(projectRecoveryDocument(file, snapshot), prior);
});
test('extra operations, changed authority, stale closures, assets, pins and publication fail closed', () => {
  for (const mutate of [
    value => value.manifest.contracts.find(row => row.id === 'sales.f1-10d.pos-sales-internal-v2').operations.push('cancelSale'),
    value => value.manifest.contracts.find(row => row.id === 'identity.f1-10e.sales-authority.schema.v1').pointers.pop(),
    value => value.lock.entries[0].commit = 'a'.repeat(40),
    value => value.lock.entries[29].units.pop(),
    value => value.lock.assets.pop(),
    value => value.sourceCommit = 'b'.repeat(40),
    value => value.publication = 'published',
  ]) {
    const wrong = structuredClone(snapshot); mutate(wrong);
    const input = encode(wrong);
    assert.equal(projectRecoveryFile(file, input), input);
    assert.equal(projectRecoveryDocument(file, wrong), wrong);
    assert.throws(() => validateRecoverySnapshot(wrong), /RECOVERY_SNAPSHOT_EXACT/);
    assert.throws(() => withRecoveryScope([], name => name === file ? input : read(name)), /RECOVERY_PARTIAL_SCOPE/);
  }
  const extra = { ...snapshot, extra: undefined };
  assert.equal(projectRecoveryDocument(file, extra), extra);
  assert.equal(projectRecoveryFile('registry/consumers/finance.json', bytes), bytes);
});
test('current scope rechecks changed or missing inputs after warmup, without cached approval', () => {
  withReviewedValidationScope([], readRepositoryFile);
  for (const target of [file, 'sales/README.md', ...recoveryFiles]) {
    const gate = recoveryFiles.includes(target) ? validateValidationTooling : withReviewedValidationScope.bind(null, []);
    assert.throws(() => gate(name => name === target ? Buffer.from('changed') : readRepositoryFile(name)));
    assert.throws(() => gate(name => { if (name === target) throw Error('missing'); return readRepositoryFile(name); }), /missing/);
  }
  assert.deepEqual([...withRecoveryScope([], source)], []);
});
test('D preserves registry, indexes, transports and other consumers, with one appended map section', () => {
  const index = JSON.parse(source('registry/consumers/index.json'));
  for (const name of ['registry/contracts.json', 'registry/consumers/index.json',
    ...index.consumers.filter(row => row.service !== 'sales-pos').map(row => 'registry/consumers/' + row.file)])
    assert.equal(read(name).toString().replaceAll('\r\n', '\n'), source(name).toString().replaceAll('\r\n', '\n'), name);
  assert.equal(read('sales/README.md').toString().replaceAll('\r\n', '\n'),
    source('sales/README.md').toString().replaceAll('\r\n', '\n') + recoveryReadmeSection);
  for (const target of ['contracts.manifest.json', 'contracts.lock.json'])
    assert.throws(() => validateRecoverySalesSource(name => name === target ? Buffer.from('changed')
      : encode(name === 'contracts.manifest.json' ? prior.manifest : prior.lock)), /RECOVERY_SALES_SOURCE/);
});
