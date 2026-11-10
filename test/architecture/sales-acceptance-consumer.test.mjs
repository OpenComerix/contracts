import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { acceptanceConsumerPath as file, acceptanceConsumerBase, acceptanceConsumerFiles,
  projectAcceptanceConsumerFile, projectAcceptanceConsumerDocument, validateAcceptanceConsumer,
} from '../../scripts/sales/acceptance-consumer-v1.mjs';
import { projectPreparationFile, projectPreparationDocument } from '../../scripts/sales/preparation-history-v1.mjs';
import { validateValidationTooling, withReviewedValidationScope } from '../../tools/architecture/validation-history.mjs';
import { readRepositoryFile } from '../../scripts/ci/retired-gitlab-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const bytes = read(file), snapshot = JSON.parse(bytes);
const historical = createGitReader()(root, acceptanceConsumerBase)(file);

test('B preserves the 29 published A pins and adds only six admitted selections with canonical closures', () => {
  assert.deepEqual(validateAcceptanceConsumer(snapshot), { preserved: 29, added: 6, assets: 52 });
  assert.equal(JSON.parse(historical).manifest.contracts.length, 20);
});

test('exact byte/document projections use only caller values and isolate their results', t => {
  projectAcceptanceConsumerFile(file, bytes); // Warm immutable Git facts only.
  t.mock.method(fs, 'readFileSync', () => { throw Error('unrelated live read'); });
  const result = projectAcceptanceConsumerFile(file, bytes);
  assert(result.equals(historical));
  result.fill(0);
  assert(projectAcceptanceConsumerFile(file, bytes).equals(historical));
  const document = projectAcceptanceConsumerDocument(file, snapshot);
  assert.deepEqual(document, JSON.parse(historical));
  document.manifest.contracts.pop();
  assert.deepEqual(projectAcceptanceConsumerDocument(file, snapshot), JSON.parse(historical));
  assert(projectPreparationFile(file, bytes).equals(historical));
  assert.deepEqual(projectPreparationDocument(file, snapshot), JSON.parse(historical));
});

test('drift, partial additions, changed old pins and publication claims are never projected', () => {
  const mutations = [
    value => value.lock.entries[0].commit = '0'.repeat(40),
    value => value.manifest.contracts.pop(),
    value => value.manifest.contracts[29].operations.push('completeSale'),
    value => value.manifest.contracts[31].role = 'producer',
    value => value.manifest.contracts.push({ id: 'unapproved' }),
    value => value.lock.assets.pop(),
    value => value.sourceCommit = 'a'.repeat(40),
    value => value.publication = 'published',
  ];
  for (const mutate of mutations) {
    const wrong = structuredClone(snapshot); mutate(wrong);
    const encoded = Buffer.from(JSON.stringify(wrong, null, 2) + '\n');
    assert.equal(projectAcceptanceConsumerFile(file, encoded), encoded);
    assert.equal(projectAcceptanceConsumerDocument(file, wrong), wrong);
    assert.throws(() => validateAcceptanceConsumer(wrong), /ACCEPTANCE_SNAPSHOT_EXACT/);
  }
  const undefinedField = { ...snapshot, extra: undefined };
  assert.equal(projectAcceptanceConsumerDocument(file, undefinedField), undefinedField);
  const wrongBytes = Buffer.concat([bytes, Buffer.from('\nUnapproved')]);
  assert.equal(projectAcceptanceConsumerFile(file, wrongBytes), wrongBytes);
  assert.equal(projectAcceptanceConsumerFile('registry/consumers/other.json', bytes), bytes);
  assert.equal(projectAcceptanceConsumerDocument('registry/consumers/other.json', snapshot), snapshot);
  assert.equal(projectAcceptanceConsumerFile(file, historical), historical);
});

test('public scope rechecks changed/missing snapshot and controlled helper bytes after warmup', () => {
  const scope = withReviewedValidationScope([], readRepositoryFile);
  assert(!scope.has('registry/consumers/unapproved.json'));
  assert(!scope.has('scripts/sales/unapproved.mjs'));
  for (const target of [file, ...acceptanceConsumerFiles]) {
    const gate = target === file ? withReviewedValidationScope.bind(null, []) : validateValidationTooling;
    assert.throws(() => gate(name => name === target ? Buffer.from('unapproved') : readRepositoryFile(name)));
    assert.throws(() => gate(name => {
      if (name === target) throw Error('synthetic missing input');
      return readRepositoryFile(name);
    }), /synthetic missing input/);
  }
});

test('other consumers and contract registry remain at the exact immutable base', () => {
  const source = createGitReader()(root, acceptanceConsumerBase);
  const index = JSON.parse(read('registry/consumers/index.json'));
  // Compare every other registered snapshot once; never inside projections.
  assert.equal(read('registry/consumers/index.json').toString().replaceAll('\r\n', '\n'),
    source('registry/consumers/index.json').toString().replaceAll('\r\n', '\n'));
  const paths = index.consumers.map(row => 'registry/consumers/' + row.file);
  for (const name of ['registry/contracts.json', ...paths.filter(name => name !== file)]) {
    assert.equal(createHash('sha256').update(read(name).toString().replaceAll('\r\n', '\n')).digest('hex'),
      createHash('sha256').update(source(name).toString().replaceAll('\r\n', '\n')).digest('hex'), name);
  }
});
