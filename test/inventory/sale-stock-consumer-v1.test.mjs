import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gitReader } from '../../tools/architecture/graph.mjs';
import { saleStockConsumerMetadata,validateSaleStockConsumers,saleStockHistoricalFile } from '../../scripts/inventory/sale-stock-consumer-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..'),read=file=>fs.readFileSync(path.join(root,file)),base=gitReader(root,'18ffbc6f3dd7b56ecab7d7bd20b04f267ad38021');
test('D selects only sale stock and result lookup while preserving all previous admissions and canonical bytes',()=>{
 assert.equal(validateSaleStockConsumers().consumers,2);
 for(const [file,bytes]of saleStockConsumerMetadata()){
  const now=JSON.parse(bytes),before=JSON.parse(base(file));assert.equal(now.publication,'published');assert.deepEqual(saleStockHistoricalFile(file,bytes),base(file));
  for(const previous of before.lock.entries){const next=now.lock.entries.find(r=>r.id===previous.id&&r.role===previous.role);for(const key of ['commit','root','tag','tagObject'])assert.deepEqual(next[key],previous[key]);for(const unit of previous.units)assert(next.units.some(r=>JSON.stringify(r)===JSON.stringify(unit)));}
  for(const change of [v=>{v.publication='local-candidate';},v=>{v.lock.entries[0].commit='a'.repeat(40);},v=>{v.manifest.contracts.pop();},v=>{v.sourceCommit='a'.repeat(40);}]){
   const altered=structuredClone(now);change(altered);const bad=Buffer.from(JSON.stringify(altered,null,2)+'\n');assert.equal(saleStockHistoricalFile(file,bad),bad);assert.throws(()=>validateSaleStockConsumers(p=>p===file?bad:read(p)),/ISD_EXACT_METADATA/);
  }
 }
});
test('D rejects source drift even after warming exact expected metadata',()=>{
 validateSaleStockConsumers();const file='sales/http/private/v1/sales-inventory-step-authority-v1.yaml';assert.throws(()=>validateSaleStockConsumers(p=>p===file?Buffer.concat([read(p),Buffer.from('\nsynthetic drift')]):read(p)),/ISD_SOURCE_DRIFT/);
});
