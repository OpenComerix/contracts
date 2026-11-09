import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {gitReader} from '../../tools/architecture/graph.mjs';
import {withCashConsumerScope} from '../../scripts/finance/cash-consumer-v1.mjs';
import {paymentConsumerBase,financePaymentPublished,paymentConsumerMetadata,paymentConsumerSnapshot,projectPaymentConsumerFile,
 projectPaymentConsumerDocument,validatePaymentConsumer,withPaymentConsumerScope} from '../../scripts/finance/payment-consumer-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..'),source=gitReader(root,paymentConsumerBase),read=file=>readFileSync(path.join(root,file));
test('C extends Finance only with admitted cash contracts, exact source revisions and no unrelated pin migration',()=>{
 const visits=[];const actual=validatePaymentConsumer(file=>{visits.push(file);return read(file);});
 assert.equal(actual.selections,16);assert.equal(actual.assets,30);assert.equal(visits.length,new Set(visits).size);
 const current=paymentConsumerSnapshot(),prior=JSON.parse(source('registry/consumers/finance.json'));
 assert.equal(current.publication,'published');assert.equal(current.sourceCommit,financePaymentPublished);
 assert.equal(financePaymentPublished,'8986e5270384017125e2692a1def0827eaf90909');
 for(const old of prior.lock.entries){const entry=current.lock.entries.find(row=>row.id===old.id&&row.role===old.role);assert.equal(entry.commit,old.commit);assert.equal(entry.tagObject,old.tagObject);}
 assert(current.lock.entries.filter(row=>!prior.lock.entries.some(old=>old.id===row.id)).every(row=>row.commit==='7cd2b548fb909c5eff47d0319c162c498ee68e92'));
 const operations=current.manifest.contracts.flatMap(row=>row.operations);assert(operations.includes('getSaleCashResult'));assert(!operations.some(name=>/History/.test(name)));
 assert.equal(read('registry/contracts.json').toString().replaceAll('\r\n','\n'),source('registry/contracts.json').toString());
});

test('publication accepts only the reviewed Finance revision and rejects candidate or foreign publication metadata',()=>{
 const file='registry/consumers/finance.json';
 for(const mutate of [value=>value.publication='local-candidate',value=>value.sourceCommit=JSON.parse(source(file)).sourceCommit,value=>value.sourceCommit='0'.repeat(40)]){
  const value=paymentConsumerSnapshot();mutate(value);const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
  assert.equal(projectPaymentConsumerFile(file,bytes),bytes);
  assert.throws(()=>validatePaymentConsumer(name=>name===file?bytes:read(name)),/PAYMENT_METADATA/);
 }
});
test('C pure projections do not validate other live inputs or repair changed and partial supplied values',()=>{
 for(const [file,bytes]of paymentConsumerMetadata()){
  assert(projectPaymentConsumerFile(file,bytes).equals(source(file)));
  const bad=Buffer.concat([bytes,Buffer.from('unapproved')]);assert.equal(projectPaymentConsumerFile(file,bad),bad);
  if(file.endsWith('.json')){const value=JSON.parse(bytes);assert.deepEqual(projectPaymentConsumerDocument(file,value),JSON.parse(source(file)));
   value.extra=undefined;assert.equal(projectPaymentConsumerDocument(file,value),value);}
 }
 const isolated=paymentConsumerSnapshot();isolated.manifest.contracts.pop();assert.equal(paymentConsumerSnapshot().manifest.contracts.length,16);
});
test('scope checks only fixed metadata once and expands its own files without reentering a complete validator',()=>{
 const calls=[];const scope=withPaymentConsumerScope([],file=>{calls.push(file);return read(file);});
 assert(scope.has('scripts/finance/payment-consumer-v1.mjs'));assert.equal(calls.length,3);assert.equal(new Set(calls).size,3);
 for(const file of paymentConsumerMetadata().keys())assert.throws(()=>withCashConsumerScope([],name=>name===file?Buffer.concat([read(name),Buffer.from('x')]):read(name)));
});
for(const file of [...paymentConsumerMetadata().keys(),'registry/consumers/sales-pos.json','finance/commands/v1/finance.record-sale-cash.v1.consumer.schema.json'])
 test('warm C checks still reject live omission or mutation: '+file,()=>{
  validatePaymentConsumer(read);
  for(const missing of [false,true])assert.throws(()=>validatePaymentConsumer(name=>{
   if(name!==file)return read(name);if(missing)throw Error('synthetic missing');return Buffer.concat([read(name),Buffer.from('changed')]);
  }));
  validatePaymentConsumer(read);
 });
