import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {cashConsumerBase,cashConsumerSnapshot,cashConsumerMetadata,validateCashConsumer,
  projectCashConsumerFile,projectCashConsumerDocument} from '../../scripts/finance/cash-consumer-v1.mjs';
import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';
import {projectReviewedFile,projectReviewedDocument,withReuseCandidateScope,validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
const root=path.resolve(import.meta.dirname,'../..'),source=gitReader(root,cashConsumerBase);
const read=file=>readFileSync(path.join(root,file));
test('Finance admits only B and preserves the seven prior consumers and all pins',()=>{
  const visits=[];const result=validateCashConsumer(file=>{visits.push(file);return read(file);});
  assert.equal(result.consumers,8);assert.equal(result.selections,11);
  assert.equal(visits.length,new Set(visits).size);
  const snapshot=cashConsumerSnapshot();
  const allOperations=snapshot.manifest.contracts.flatMap(row=>row.operations);
  assert(!allOperations.some(name=>/Sale|History/.test(name)));
  assert(!snapshot.manifest.contracts.some(row=>/record-sale|sale-payment|sales\./.test(row.id)));
  const registry=JSON.parse(read('registry/contracts.json')),before=JSON.parse(source('registry/contracts.json'));
  assert.deepEqual({...registry,requiredConsumers:before.requiredConsumers},before);
  const generated=makeLock(root,snapshot.manifest,Buffer.from(JSON.stringify(snapshot.manifest,null,2)+'\n'),registry);
  assert.deepEqual(generated.entries,snapshot.lock.entries);
  assert(generated.entries.every(row=>row.commit==='7cd2b548fb909c5eff47d0319c162c498ee68e92'||row.commit===before.contracts.find(x=>x.id===row.id).commit));
});
test('pure views project only exact values and preserve caller isolation',()=>{
  for(const file of ['registry/contracts.json','registry/consumers/index.json','finance/README.md']){
    const bytes=read(file);assert(projectCashConsumerFile(file,bytes).equals(source(file)));
    const wrong=Buffer.concat([bytes,Buffer.from('unapproved')]);assert.equal(projectCashConsumerFile(file,wrong),wrong);
    if(file.endsWith('.json')){
      const value=JSON.parse(bytes);assert.deepEqual(projectCashConsumerDocument(file,value),JSON.parse(source(file)));
      value.extra=undefined;assert.equal(projectCashConsumerDocument(file,value),value);
    }
  }
  const snapshot=cashConsumerSnapshot();snapshot.manifest.contracts.pop();assert.equal(cashConsumerSnapshot().manifest.contracts.length,11);
});
test('shared historical views preserve exact deltas and reject partial/foreign changes',()=>{
  const revision='062453a717bc49d08b4816fa8e630ea63fcdd64d',old=gitReader(root,revision);
  for(const file of ['registry/contracts.json','registry/consumers/index.json','finance/README.md']){
    const bytes=read(file);
    assert(projectReviewedFile(revision,file,bytes).equals(old(file)));
    const wrong=Buffer.concat([bytes,Buffer.from('\nunapproved')]);
    assert.equal(projectReviewedFile(revision,file,wrong),undefined);
    if(file.endsWith('.json')){
      const value=JSON.parse(bytes);assert.deepEqual(projectReviewedDocument(revision,file,value),JSON.parse(old(file)));
      for(const mutate of [x=>x.extra=undefined,x=>x.extra=NaN,x=>x.requiredConsumers?.splice(0,1),x=>x.consumers?.splice(0,1)]){
        const altered=structuredClone(value);mutate(altered);
        if(!Object.hasOwn(altered,'extra')&&JSON.stringify(altered)===JSON.stringify(value))continue;
        assert(projectReviewedDocument(revision,file,altered)===altered,'unapproved historical projection: '+file);
      }
    }
  }
  const scope=withReuseCandidateScope([],read);assert(scope.has('registry/consumers/finance.json'));
  validateValidationTooling(read);
  for(const file of [...cashConsumerMetadata().keys(),'scripts/finance/cash-consumer-v1.mjs']){
    const changed=name=>name===file?Buffer.concat([read(name),Buffer.from('\nunapproved')]):read(name);
    assert.throws(()=>withReuseCandidateScope([],changed));
    if(file.endsWith('.mjs'))assert.throws(()=>validateValidationTooling(changed));
  }
});
for(const file of [...cashConsumerMetadata().keys(),'registry/consumers/inventory.json','finance/events/v1/finance.cash-shift.opened.v1.schema.json'])
  test('warm validation rejects live drift or omission: '+file,()=>{
    validateCashConsumer(read);
    for(const missing of [false,true])assert.throws(()=>validateCashConsumer(name=>{
      if(name!==file)return read(name);if(missing)throw Error('Synthetic missing input');return Buffer.concat([read(name),Buffer.from('\nunapproved')]);
    }));
    assert.equal(validateCashConsumer(read).consumers,8);
  });
