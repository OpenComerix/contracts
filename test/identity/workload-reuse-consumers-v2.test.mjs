import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reuseConsumerSnapshots,validateReuseConsumer,projectReuseConsumerDocument,projectReuseConsumerFile,validateReuseConsumers} from '../../scripts/identity/workload-reuse-consumers-v2.mjs';
import {readRepositoryFile} from '../../scripts/ci/retired-gitlab-v1.mjs';
import {saleStockHistoricalRead} from '../../scripts/inventory/sale-stock-consumer-v1.mjs';
import {stockConsumerCandidate} from '../../scripts/inventory/stock-consumer-v1.mjs';

test('exact three-owner migration appends two selections and preserves old pins',()=>{
  const snapshots=reuseConsumerSnapshots();assert.equal(snapshots.size,3);
  for(const [file,value]of snapshots){
    const result=validateReuseConsumer(file,value);assert.equal(result.additions,2);
    const previous=projectReuseConsumerDocument(file,value);
    assert.notDeepEqual(previous,value);
    assert.deepEqual(value.lock.entries.slice(0,-2),previous.lock.entries);
    assert.deepEqual(value.lock.assets,previous.lock.assets);
    assert.deepEqual(value.manifest.contracts.slice(0,-2),previous.manifest.contracts);
    assert.deepEqual(JSON.parse(projectReuseConsumerFile(file,Buffer.from(JSON.stringify(value,null,2)+'\n'))),previous);
    for(const row of value.lock.entries.slice(-2))assert.equal(row.commit,'af6e8b3f5115d51f56a1ef94a36ae9f33cce3337');
  }
});
for(const mutation of ['pin','omit','extra','purpose','hash','publication','sourceCommit'])test('rejects '+mutation+' without repairing it',()=>{
  for(const [file,value]of reuseConsumerSnapshots()){
    if(mutation==='pin')value.lock.entries[0].commit='0'.repeat(40);
    if(mutation==='omit')value.manifest.contracts.pop();
    if(mutation==='extra')value.lock.entries.push(value.lock.entries.at(-1));
    if(mutation==='purpose')value.manifest.contracts.at(-1).purpose='altered';
    if(mutation==='hash')value.lockSha256='0'.repeat(64);
    if(mutation==='publication')value.publication='published';
    if(mutation==='sourceCommit')value.sourceCommit='0'.repeat(40);
    assert.throws(()=>validateReuseConsumer(file,value),/REUSE_CONSUMER_METADATA/);
    assert.strictEqual(projectReuseConsumerDocument(file,value),value);
    const bytes=Buffer.from(JSON.stringify(value));assert.strictEqual(projectReuseConsumerFile(file,bytes),bytes);
  }
});
test('fresh live reads are checked on every invocation and reject drift after success',()=>{
  const files=new Map([...reuseConsumerSnapshots()].map(([file,value])=>[file,Buffer.from(JSON.stringify(value))]));
  assert.equal(validateReuseConsumers(file=>files.get(file)).length,3);
  const first=files.keys().next().value;files.set(first,Buffer.from('{}'));
  assert.throws(()=>validateReuseConsumers(file=>files.get(file)),/REUSE_CONSUMER_METADATA/);
});
test('the complete historical Inventory reader projects the new exact export before C compares it',()=>{
  const read=saleStockHistoricalRead(readRepositoryFile);
  assert(read('registry/consumers/inventory.json').equals(stockConsumerCandidate()),'REUSE_HISTORICAL_INVENTORY_READER');
});
