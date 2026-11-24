import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createGitReader } from '../../tools/architecture/git-source.mjs';
import { projectIanaPublicAdmissionFile } from '../../scripts/sales/iana-admission-v1.mjs';
import {
  consumerExportBase,
  beforeReconciliation,
  beforeReconciliationDocument,
  reconciliationPaths,
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
const priorExports = new Map(['gateway-bff', 'web-pos', 'catalog-pricing', 'inventory'].map(owner => {
  const file = 'registry/consumers/' + owner + '.json';
  const revision = '3b4ba133274089a65a28fbea93d9d60ae0c74f6d';
  const bytes = execFileSync('git', ['-C', root, 'show', revision + ':' + file],
    { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  return [file, bytes];
}));

test('the four reconciled exports match their reviewed publications and isolate historical reads', () => {
  assert.deepEqual(new Set(reconciliationPaths), new Set(priorExports.keys()));
  for (const [file, prior] of priorExports) {
    const live = read(file);
    const projected = beforeReconciliation(file, live);
    assert.notEqual(projected, live, file);
    assert(projected.equals(prior), file);
    projected.fill(0);
    assert(beforeReconciliation(file, live).equals(prior), file);
    const value = JSON.parse(live);
    assert.equal(value.publication, 'published');
    assert.deepEqual(beforeReconciliationDocument(file, value), JSON.parse(prior));
    const windows = Buffer.from(text(live).replaceAll('\n', '\r\n'));
    assert(beforeReconciliation(file, windows).equals(prior));
    const prefixed = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), windows]);
    assert.equal(beforeReconciliation(file, prefixed), prefixed);
    value.lock.entries.pop();
    const drift = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    assert.equal(beforeReconciliation(file, drift), drift);
    assert.equal(beforeReconciliationDocument(file, value), value);
    assert.equal(beforeReconciliation(file, prior), prior);
  }
});

test('exports the four published owners and preserves four other snapshots and the admitted registry', () => {
  const reads = [];
  const result = validateIanaConsumerExports(file => {
    const live = read(file);
    const { service, contracts } = JSON.parse(live).manifest;
    reads.push([service, contracts.length]);
    return live;
  });
  assert.deepEqual(reads, [
    ['identity-tenancy', 61], ['sales-pos', 57], ['gateway-bff', 47], ['web-pos', 21],
  ]);
  assert.deepEqual(result.map(({ owner, selections, assets }) => [owner, selections, assets]), [
    ['identity-tenancy', 61, 0],
    ['sales-pos', 57, 74],
    ['gateway-bff', 44, 207],
    ['web-pos', 19, 131],
  ]);
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
  const locks = JSON.parse(priorExports.get(gateway)).lock.entries;
  const next = JSON.parse(priorExports.get(web)).lock.entries.slice(prior.lock.entries.length);
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
    const altered = structuredClone(value);
    altered.lock.entries.pop();
    const alteredBytes = Buffer.from(JSON.stringify(altered, null, 2) + '\n');
    assert.throws(() => validateIanaConsumerExports(input => input === file ? alteredBytes : read(input)),
      /IANA_CONSUMER_EXPORT_BYTES/);
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
