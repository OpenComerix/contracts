import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gitReader } from '../../tools/architecture/graph.mjs';
import { authorityConsumerBase, authorityConsumerMetadata, validateAuthorityConsumers,
  authorityConsumerHistoricalFile, authorityConsumerHistoricalSnapshot, authorityConsumerReadView } from '../../scripts/finance/authority-consumers-v1.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const before = gitReader(root, authorityConsumerBase);
test('F1-12A selects Finance authority in Identity and Sales without changing other owners or prior pins', () => {
  assert.deepEqual(validateAuthorityConsumers(), { consumers: 2, previousPinsPreserved: true, publication: 'published', runtimeDemonstrated: false });
  const snapshots = [...authorityConsumerMetadata()].map(([file, bytes]) => [file, JSON.parse(bytes)]);
  assert.deepEqual(snapshots.map(([, snapshot]) => snapshot.manifest.service), ['identity-tenancy', 'sales-pos']);
  const identity = snapshots[0][1], sales = snapshots[1][1];
  assert.deepEqual(identity.manifest.contracts.slice(-3).map(row => row.id), ['identity.finance-authority.http.v1', 'identity.finance-authority.schema.v1', 'identity.finance-authority.policy.v1']);
  assert(sales.manifest.contracts.some(row => row.id === 'inventory.http.private.v1' && row.operations.join() === 'getInventorySaleStockResult'));
  assert(!snapshots.some(([, row]) => row.manifest.service === 'finance'));
  for (const [file, snapshot] of snapshots) {
    const original = JSON.parse(before(file));
    for (const prior of original.lock.entries) {
      const current = snapshot.lock.entries.find(row => row.id === prior.id && row.role === prior.role);
      assert.equal(current.commit, prior.commit);
      for (const unit of prior.units) assert(current.units.some(candidate => JSON.stringify(candidate) === JSON.stringify(unit)));
    }
    assert.deepEqual(JSON.parse(authorityConsumerHistoricalFile(file, read(file))), original);
    assert.deepEqual(authorityConsumerHistoricalSnapshot(snapshot), original);
  }
});
test('the Finance bridge rejects changed snapshots, sources, coverage and omitted prior pins', () => {
  const snapshotPath = 'registry/consumers/identity-tenancy.json';
  for (const file of [snapshotPath, 'registry/consumers/sales-pos.json', 'registry/consumers/inventory.json', 'registry/contracts.json', 'registry/consumers/index.json', 'finance/commands/v1/finance.record-sale-cash.v1.schema.json', 'identity/http/private/v1/identity-finance-authority-v1.yaml']) {
    assert.throws(() => validateAuthorityConsumers(name => name === file ? Buffer.concat([read(name), Buffer.from('\nDrift')]) : read(name)));
    assert.throws(() => validateAuthorityConsumers(name => { if (name === file) throw Error('Missing approved input'); return read(name); }));
    if(!['registry/consumers/identity-tenancy.json','registry/consumers/sales-pos.json'].includes(file)){
      const drifted=name=>name===file?Buffer.concat([read(name),Buffer.from('\nDrift')]):read(name);
      assert.throws(()=>authorityConsumerReadView(drifted)(snapshotPath),'full validation precedes an exact metadata projection');
    }
  }
  const snapshot = JSON.parse(read(snapshotPath));
  for (const change of [value => value.lock.entries.shift(), value => value.manifest.contracts.push({ id: 'unapproved' }), value => { value.sourceCommit = 'a'.repeat(40); }]) {
    const wrong = structuredClone(snapshot); change(wrong);
    assert.equal(authorityConsumerHistoricalSnapshot(wrong), wrong);
    const changed = Buffer.from(JSON.stringify(wrong));
    assert.equal(authorityConsumerHistoricalFile(snapshotPath, changed), changed);
  }
  const view = authorityConsumerReadView(read);
  assert.deepEqual(JSON.parse(view(snapshotPath)), JSON.parse(before(snapshotPath)));
  const publicCopy = authorityConsumerMetadata(); publicCopy.get(snapshotPath).fill(0); publicCopy.clear();
  assert.equal(validateAuthorityConsumers().consumers, 2);
});
