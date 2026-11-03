import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gitReader} from '../../tools/architecture/graph.mjs';
import {deliveryHistoryMetadata,deliveryHistoryHistoricalFile,validateDeliveryHistoryConsumer,verifyDeliveryHistoryImpactReport} from '../../scripts/inventory/delivery-history-consumer-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..'),read=file=>fs.readFileSync(path.join(root,file)),base=gitReader(root,'77bf7e6fa5bf429483ea515504555c55c4890b73'),file='registry/consumers/inventory.json';
test('E selects owner delivery/history only and preserves every previous pin and all canonical bytes',()=>{
 assert.equal(validateDeliveryHistoryConsumer().consumers,1);
 const bytes=deliveryHistoryMetadata(),now=JSON.parse(bytes),before=JSON.parse(base(file));
 assert.deepEqual(deliveryHistoryHistoricalFile(file,bytes),base(file));
 assert.equal(now.publication,'published');
 for(const old of before.lock.entries){const next=now.lock.entries.find(row=>row.id===old.id&&row.role===old.role);for(const key of ['commit','root','tag','tagObject'])assert.deepEqual(next[key],old[key]);for(const unit of old.units)assert(next.units.some(row=>JSON.stringify(row)===JSON.stringify(unit)));}
 for(const mutate of [value=>{value.publication='local-candidate';},value=>{value.sourceCommit='a'.repeat(40);},value=>{value.lock.entries[0].commit='a'.repeat(40);},value=>{value.manifest.contracts.pop();}]){const altered=structuredClone(now);mutate(altered);const bad=Buffer.from(JSON.stringify(altered,null,2)+'\n');assert.equal(deliveryHistoryHistoricalFile(file,bad),bad);assert.throws(()=>validateDeliveryHistoryConsumer(p=>p===file?bad:read(p)),/IEH_EXACT_METADATA/);}
});
test('E rejects omitted consumers, canonical drift and metadata drift after warming its model',()=>{
 validateDeliveryHistoryConsumer();for(const source of ['inventory/events/v1/inventory-flow-v1.asyncapi.yaml','registry/consumers/index.json','registry/consumers/sales-pos.json'])assert.throws(()=>validateDeliveryHistoryConsumer(p=>p===source?Buffer.concat([read(p),Buffer.from('synthetic drift')]):read(p)),/IEH_(SOURCE|COVERAGE|OTHER_CONSUMER)_DRIFT/);
});
test('compact impact evidence requires the complete canonical result and matching artifact, with no omitted or affected consumer',()=>{
 const report={formatVersion:1,candidate:'WORKTREE',automaticDispatch:false,graph:[{synthetic:'test-only'}],consumers:JSON.parse(base('registry/consumers/index.json')).consumers.map(row=>({service:row.service,affected:false,dependencies:[]}))};
 assert.equal(verifyDeliveryHistoryImpactReport(report,structuredClone(report)).consumers,7);
 for(const mutate of [r=>{r.consumers.pop();},r=>{r.consumers[0].affected=true;},r=>{r.consumers[0].dependencies=[{classification:'review-required'}];},r=>{r.graph=[];},r=>{r.candidate='synthetic-other';},r=>{r.automaticDispatch=true;}]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>verifyDeliveryHistoryImpactReport(bad,structuredClone(bad)),/IEH_IMPACT_/);}
 assert.throws(()=>verifyDeliveryHistoryImpactReport(report,{...report,graph:[]}),/IEH_IMPACT_ARTIFACT_DRIFT/);
});
