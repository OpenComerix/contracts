import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { projectIanaPublicAdmissionFile } from '../../scripts/sales/iana-admission-v1.mjs';
import {
  consumerExportBase,
  consumerExportPaths,
  projectIanaConsumerExportDocument,
  projectIanaConsumerExportFile,
  projectIanaConsumerHistoricalTest,
  validateIanaConsumerExports,
} from '../../scripts/sales/iana-consumer-exports.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const before = createGitReader()(root, consumerExportBase);
const text = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');

test('exports the four published owners and preserves four other snapshots and the admitted registry', () => {
  const reads = new Map();
  const result = validateIanaConsumerExports(file => {
    reads.set(file, (reads.get(file) ?? 0) + 1);
    return read(file);
  });
  assert.deepEqual(result.map(({ owner, selections, assets }) => [owner, selections, assets]), [
    ['identity-tenancy', 61, 0],
    ['sales-pos', 57, 74],
    ['gateway-bff', 44, 207],
    ['web-pos', 19, 131],
  ]);
  assert.deepEqual([...reads.values()], [1, 1, 1, 1]);
  const index = 'registry/consumers/index.json';
  const unchanged = JSON.parse(before(index)).consumers
    .map(({ file }) => 'registry/consumers/' + file)
    .filter(file => !consumerExportPaths.includes(file));
  assert.equal(unchanged.length, 4);
  for (const file of [...unchanged, index, 'registry/contracts.json', 'identity/index.json', 'sales/index.json']) {
    assert.equal(text(projectIanaPublicAdmissionFile(file, read(file))), text(before(file)), file);
  }
});

test('Gateway and PWA exports pin the same six public operations and can only move together', () => {
  const admitted = createGitReader()(root, 'dd6d588e8baff00015fdb097088576930001addd');
  const [gateway, web] = consumerExportPaths.slice(-2);
  const historical = validateIanaConsumerExports(admitted, { allowPreviousFrontend: true });
  assert.deepEqual(historical.map(({ owner }) => owner), ['identity-tenancy', 'sales-pos']);
  assert.throws(() => validateIanaConsumerExports(admitted), /IANA_CONSUMER_EXPORT_BYTES/);
  for (const file of [gateway, web])
    assert.throws(() => validateIanaConsumerExports(key => key === file ? admitted(key) : read(key),
      { allowPreviousFrontend: true }), /IANA_CONSUMER_EXPORT_BYTES/);

  const prior = JSON.parse(admitted(web));
  const locks = JSON.parse(read(gateway)).lock.entries;
  const next = JSON.parse(read(web)).lock.entries.slice(prior.lock.entries.length);
  assert.equal(next.length, 3);
  assert.deepEqual(next.flatMap(pin => pin.operations).sort(), [
    'configureBranchTimeZone', 'finalizeOnlineSale', 'getBranchTimeZone',
    'getCompletedSale', 'getSaleFinalization', 'resumeSaleFinalization',
  ]);
  for (const pin of next) {
    const published = locks.find(entry => entry.id === pin.id);
    for (const field of ['root', 'commit', 'version', 'operations', 'files', 'units', 'runtimeSha256'])
      assert.deepEqual(pin[field], published[field], pin.id + ':' + field);
  }
});

test('the operational proof receives the exact acceptance fixture for its stage', () => {
  const file = 'test/architecture/sales-acceptance-consumer.test.mjs';
  const adapted = read(file);
  assert.deepEqual(projectIanaConsumerHistoricalTest(file, adapted), before(file));
  const changed = Buffer.concat([adapted, Buffer.from('\nUnreviewed\n')]);
  assert.equal(projectIanaConsumerHistoricalTest(file, changed), changed);
});

test('projects only exact supplied values and rejects mixed, changed and missing exports', () => {
  assert.deepEqual(validateIanaConsumerExports(before, { allowPrevious: true }), []);
  assert.throws(() => validateIanaConsumerExports(before), /IANA_CONSUMER_EXPORT_BYTES/);
  for (const file of consumerExportPaths) {
    const original = read(file);
    const rebuilt = projectIanaConsumerExportFile(file, original);
    assert.deepEqual(rebuilt, before(file));
    rebuilt.fill(0);
    assert.deepEqual(projectIanaConsumerExportFile(file, original), before(file));
    const value = JSON.parse(original);
    assert.deepEqual(projectIanaConsumerExportDocument(file, value), JSON.parse(before(file)));
    value.sourceCommit = '0'.repeat(40);
    assert.equal(projectIanaConsumerExportDocument(file, value), value);
    const drift = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    assert.equal(projectIanaConsumerExportFile(file, drift), drift);
    for (const value of [before(file), drift]) {
      assert.throws(() => validateIanaConsumerExports(
        input => input === file ? value : read(input),
        { allowPrevious: true },
      ), /IANA_CONSUMER_EXPORT_BYTES/);
    }
    assert.throws(() => validateIanaConsumerExports(input => {
      if (input === file) throw Error('missing export');
      return read(input);
    }), /missing export/);
  }
});
