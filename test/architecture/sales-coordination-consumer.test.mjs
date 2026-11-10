import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { coordinationBase, coordinationSalesBase, coordinationSnapshotPath as file,
  coordinationFiles, coordinationReadmeSection, validateCoordinationSnapshot,
  projectCoordinationFile, projectCoordinationDocument, validateCoordinationSalesSource,
} from '../../scripts/sales/coordination-consumer-v1.mjs';
import { withReviewedValidationScope, validateValidationTooling } from '../../tools/architecture/validation-history.mjs';
import { readRepositoryFile } from '../../scripts/ci/retired-gitlab-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const source = createGitReader()(root, coordinationBase);
const bytes = read(file), snapshot = JSON.parse(bytes);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const text = value => value.toString('utf8').replaceAll('\r\n', '\n');

test('C resolves the exact new delta from admitted sources without repinning B or claiming runtime', () => {
  const result = validateCoordinationSnapshot(snapshot);
  assert.deepEqual(result, { preservedSelections: 35, extendedPolicies: 1, addedSelections: 10,
    assets: snapshot.manifest.assets.length, runtimeMaterialized: false });
  const prior = JSON.parse(source(file));
  // Standalone content proof. The explicit local control binds these exact
  // bytes to Sales B; the canonical suite never opens a sibling checkout.
  assert.deepEqual(validateCoordinationSalesSource(name => encode(
    name === 'contracts.manifest.json' ? prior.manifest : prior.lock)),
  { sourceCommit: coordinationSalesBase, verifiedFiles: 2 });
  for (let index = 0; index < 35; index++) {
    const old = prior.lock.entries[index], next = snapshot.lock.entries[index];
    assert.equal(next.commit, old.commit);
    assert.equal(next.tag, old.tag);
    assert.equal(next.tagObject, old.tagObject);
    if (old.id === 'identity.finance-authority.policy.v1' && old.role === 'consumer') {
      assert.deepEqual(next.pointers, [...old.pointers, '/profiles/3']);
      assert(old.units.every(unit => next.units.some(row => JSON.stringify(row) === JSON.stringify(unit))));
    } else assert.deepEqual(next, old);
  }
  assert.deepEqual(snapshot.lock.assets.slice(0, prior.lock.assets.length), prior.lock.assets);
});

test('Sales source verification rejects altered or missing evidence without silently omitting the control', () => {
  const prior = JSON.parse(source(file));
  const readSource = name => encode(name === 'contracts.manifest.json' ? prior.manifest : prior.lock);
  for (const target of ['contracts.manifest.json', 'contracts.lock.json']) {
    assert.throws(() => validateCoordinationSalesSource(name => name === target
      ? Buffer.concat([readSource(name), Buffer.from('\n')]) : readSource(name)), /COORDINATION_SALES_SOURCE/);
    assert.throws(() => validateCoordinationSalesSource(name => {
      if (name === target) throw Error('synthetic missing source');
      return readSource(name);
    }), /synthetic missing source/);
  }
});

test('exact adapters perform no live reads and return isolated historical values', t => {
  projectCoordinationFile(file, bytes);
  t.mock.method(fs, 'readFileSync', () => { throw Error('unrelated live read'); });
  const historical = source(file);
  for (let index = 0; index < 100; index++) assert(projectCoordinationFile(file, bytes).equals(historical));
  const result = projectCoordinationFile(file, bytes); result.fill(0);
  assert(projectCoordinationFile(file, bytes).equals(historical));
  const document = projectCoordinationDocument(file, snapshot);
  document.manifest.contracts.pop();
  assert.deepEqual(projectCoordinationDocument(file, snapshot), JSON.parse(historical));
});

test('changed roles, partial deltas, stale closures, old pins and publication claims fail closed', () => {
  for (const mutate of [
    value => value.manifest.contracts.pop(),
    value => value.manifest.contracts[35].operations.push('openCashShift'),
    value => value.manifest.contracts[36].role = 'producer',
    value => value.lock.entries[0].commit = 'a'.repeat(40),
    value => value.lock.entries.at(-1).units.pop(),
    value => value.lock.assets.pop(),
    value => value.sourceCommit = 'b'.repeat(40),
    value => value.publication = 'published',
  ]) {
    const wrong = structuredClone(snapshot); mutate(wrong);
    const encoded = encode(wrong);
    assert.equal(projectCoordinationFile(file, encoded), encoded);
    assert.equal(projectCoordinationDocument(file, wrong), wrong);
    assert.throws(() => validateCoordinationSnapshot(wrong), /COORDINATION_SNAPSHOT_EXACT/);
  }
  const extra = { ...snapshot, ignored: undefined };
  assert.equal(projectCoordinationDocument(file, extra), extra);
  assert.equal(projectCoordinationFile('registry/consumers/finance.json', bytes), bytes);
  const corrupted = Buffer.concat([bytes, Buffer.from('extra')]);
  assert.equal(projectCoordinationFile(file, corrupted), corrupted);
});

test('public scope rechecks current snapshot, documentation and helpers after warmup', () => {
  withReviewedValidationScope([], readRepositoryFile);
  for (const target of [file, 'sales/README.md', ...coordinationFiles]) {
    const gate = coordinationFiles.includes(target) ? validateValidationTooling : withReviewedValidationScope.bind(null, []);
    assert.throws(() => gate(name => name === target ? Buffer.from('unapproved') : readRepositoryFile(name)));
    assert.throws(() => gate(name => {
      if (name === target) throw Error('synthetic missing input');
      return readRepositoryFile(name);
    }), /synthetic missing input/);
  }
});

test('only Sales candidate and its map change; registry, indexes, contracts and other consumers are preserved', () => {
  const index = JSON.parse(source('registry/consumers/index.json'));
  for (const name of ['registry/contracts.json', 'registry/consumers/index.json',
    ...index.consumers.filter(row => row.service !== 'sales-pos').map(row => 'registry/consumers/' + row.file)])
    assert.equal(text(read(name)), text(source(name)), name);
  assert.equal(text(read('sales/README.md')), text(source('sales/README.md')) + coordinationReadmeSection);
});
