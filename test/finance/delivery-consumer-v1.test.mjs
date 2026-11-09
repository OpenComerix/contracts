import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {gitReader} from '../../tools/architecture/graph.mjs';
import {deliveryConsumerBase,financeDeliveryPublished,deliveryConsumerSnapshot,deliveryConsumerMetadata,validateDeliveryConsumer,projectDeliveryConsumerFile,projectDeliveryConsumerDocument} from '../../scripts/finance/delivery-consumer-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..'),source=gitReader(root,deliveryConsumerBase),read=f=>readFileSync(path.join(root,f));
test('D selects only Finance history and published delivery closure while preserving every B/C pin',()=>{
 const visits=[];const result=validateDeliveryConsumer(f=>{visits.push(f);return read(f);});
 assert.equal(result.selections,17);assert.equal(visits.length,new Set(visits).size);
 const snapshot=deliveryConsumerSnapshot(),prior=JSON.parse(source('registry/consumers/finance.json'));
 assert.equal(snapshot.publication,'published');assert.equal(snapshot.sourceCommit,financeDeliveryPublished);
 for(const old of prior.lock.entries){const current=snapshot.lock.entries.find(r=>r.id===old.id&&r.role===old.role);assert.equal(current.commit,old.commit);assert.equal(current.tagObject,old.tagObject);}
 for(const op of ['createFinanceHistoryReadSession','readFinanceHistoryFacts'])assert(snapshot.manifest.contracts.find(e=>e.id==='finance.http.private.v1').operations.includes(op));
 assert(snapshot.manifest.contracts.some(e=>e.id==='finance.flow.asyncapi.v1'));
});
test('D projection checks only supplied bytes and keeps current checks outside per-file loops',()=>{
 for(const [file,bytes]of deliveryConsumerMetadata()){
  assert(projectDeliveryConsumerFile(file,bytes).equals(source(file)));
  const corrupt=Buffer.concat([bytes,Buffer.from('changed')]);assert.equal(projectDeliveryConsumerFile(file,corrupt),corrupt);
  if(file.endsWith('.json')){const doc=JSON.parse(bytes);assert.deepEqual(projectDeliveryConsumerDocument(file,doc),JSON.parse(source(file)));doc.extra=undefined;assert.equal(projectDeliveryConsumerDocument(file,doc),doc);}
 }
 const value=deliveryConsumerSnapshot();value.manifest.contracts.pop();assert.equal(deliveryConsumerSnapshot().manifest.contracts.length,17);
});
test('D warm validation never caches mutable approval or repairs missing inputs',()=>{
 validateDeliveryConsumer(read);
 for(const file of ['registry/consumers/finance.json','registry/consumers/index.json','finance/README.md','registry/consumers/identity-tenancy.json','finance/events/v1/finance-flow-v1.asyncapi.yaml']){
  assert.throws(()=>validateDeliveryConsumer(f=>f===file?Buffer.concat([read(f),Buffer.from('changed')]):read(f)));
  assert.throws(()=>validateDeliveryConsumer(f=>{if(f===file)throw Error('missing');return read(f);}));
 }
 for(const patch of [{publication:'local-candidate'},{sourceCommit:'0'.repeat(40)}])
  assert.throws(()=>validateDeliveryConsumer(f=>f==='registry/consumers/finance.json'?Buffer.from(JSON.stringify({...JSON.parse(read(f)),...patch})):read(f)));
 validateDeliveryConsumer(read);
});
