import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gitReader,makeLock } from '../../tools/architecture/graph.mjs';
import {deliveryHistoryHistoricalFile,deliveryHistoryHistoricalSnapshot,validateDeliveryHistoryConsumer} from './delivery-history-consumer-v1.mjs';
import {withAuthorityConsumerContext} from '../finance/authority-consumers-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const base=gitReader(root,'18ffbc6f3dd7b56ecab7d7bd20b04f267ad38021');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const purpose='F1-11D sale stock posting/compensation, retained results and authorized reconciliation; no broker delivery or completed sale.';
const gates=['pnpm contracts:metadata','pnpm test:cov','pnpm test:integration','pnpm test:contracts','pnpm test:e2e'];
let cache;
function model(){
 if(cache)return cache;
 const registry=JSON.parse(base('registry/contracts.json'));
 const snapshots=new Map(),previous=new Map(),closures=new Map();
 for(const service of ['inventory','identity-tenancy']){
  const file='registry/consumers/'+service+'.json',before=JSON.parse(base(file));previous.set(file,before);
  const manifest=structuredClone(before.manifest);
  function add(id,role,operations=[],pointers=[]){
   const descriptor=registry.contracts.find(r=>r.id===id);assert(descriptor&&descriptor.status==='active','ISD_ADMISSION:'+id);
   let entry=manifest.contracts.find(r=>r.id===id&&r.role===role);
   if(!entry){entry={id,role,version:descriptor.version,operations:[],pointers:[],purpose,gates:[...gates]};manifest.contracts.push(entry);}
   entry.operations=[...new Set([...entry.operations,...operations])];entry.pointers=[...new Set([...entry.pointers,...pointers])];entry.purpose=purpose;
  }
  if(service==='inventory'){
   const queries=['listInventoryReconciliations','getInventoryReconciliation'];
   add('inventory.http.private.v1','producer',[...queries,'getInventorySaleStockResult']);
   add('inventory.http.public.v1','semantic-owner',queries);
   add('inventory.types.v1','validation',[],['PostRequest','PostSuccess','CompensationRequest','CompensationSuccess','CompensationFailure','Failure','StockLine','Difference','Warning','LineEffect','ReconciliationOccurrence','Reconciliation','Reconciliations','HttpReconciliations','HttpReconciliation','SaleStockResult','RestrictedOriginAudit'].map(x=>'/$defs/'+x));
   add('inventory.consumer-types.v1','validation',[],['PostRequest','CompensationRequest'].map(x=>'/$defs/'+x));
   for(const kind of ['post','compensate']){
    add('inventory.'+kind+'-sale-stock.v1.consumer','consumer',[],['']);
    add('inventory.'+kind+'-sale-stock.result.v1','producer',[],['']);
   }
   for(const id of ['inventory.sale-stock.posted.v2','inventory.sale-stock.compensated.v1','inventory.reconciliation-required.v2'])add(id,'producer',[],['']);
   add('sales.inventory-step-authority.http.v1','consumer',['authorizeSaleProcessStep']);
   add('sales.inventory-step-authority.schema.v1','validation',[],['/$defs/Request','/$defs/Decision']);
   add('identity.inventory-authority.policy.v1','consumer',[],['/profiles/4','/profiles/5','/permissions/7','/permissions/8']);
   add('identity.inventory-authority.schema.v1','validation',[],['/$defs/CanonicalRequest/oneOf/7','/$defs/CanonicalRequest/oneOf/8']);
   add('inventory.protocol-policy.v1','consumer',[],['/operations/7','/operations/8','/messages','/authority/technical','/authority/stock_difference','/idempotency/semantic','/idempotency/compensation','/reconciliation','/compatibility']);
  }else{
   add('identity.inventory-authority.policy.v1','semantic-owner',[],['/profiles/5']);
   manifest.contracts.find(r=>r.id==='identity.inventory-authority.policy.v1').gates=['pnpm contracts:metadata','pnpm test:all','pnpm test:inventory-authority-runtime'];
  }
  const manifestBytes=encode(manifest),lock=makeLock(root,manifest,manifestBytes,registry,before.lock.entries);
  const snapshot={...before,publication:'published',sourceCommit:service==='inventory'?'8a5a026458a87ffb45fdc3152fd76fd991d5374d':'f78df030a7783ede98fe5c473e6a02c3dd18820e',manifestSha256:hash(manifestBytes),lockSha256:hash(encode(lock)),manifest,lock};
  snapshots.set(file,snapshot);
  for(const entry of lock.entries)for(const file of entry.files){const bytes=gitReader(root,entry.commit)(file.path);if(closures.has(file.path))assert.equal(text(closures.get(file.path)),text(bytes),'ISD_SOURCE_COLLISION');closures.set(file.path,bytes);}
 }
 cache={snapshots,previous,closures};return cache;
}
export const saleStockConsumerMetadata=()=>new Map([...model().snapshots].map(([p,v])=>[p,encode(v)]));
export function saleStockHistoricalFile(file,bytes){bytes=deliveryHistoryHistoricalFile(file,bytes);const expected=model().snapshots.get(file);return expected&&text(bytes)===text(encode(expected))?encode(model().previous.get(file)):bytes;}
export function saleStockHistoricalSnapshot(value){value=deliveryHistoryHistoricalSnapshot(value);const file='registry/consumers/'+value?.manifest?.service+'.json';return isDeepStrictEqual(value,model().snapshots.get(file))?structuredClone(model().previous.get(file)):value;}
const native=file=>fs.readFileSync(path.join(root,file));
export function validateSaleStockConsumers(read=native,context){
 return withAuthorityConsumerContext(read,current=>{
 const originalRead=file=>{try{return current.read(file);}catch(cause){throw new Error('ISD_SOURCE_DRIFT:'+file,{cause});}};let projected=false;
 read=file=>{const bytes=originalRead(file),current=deliveryHistoryHistoricalFile(file,bytes);if(current!==bytes)projected=true;return current;};
 for(const [file,snapshot]of model().snapshots)assert.equal(text(read(file)),text(encode(snapshot)),'ISD_EXACT_METADATA:'+file);
 for(const [file,bytes]of model().closures)assert.equal(text(read(file)),text(bytes),'ISD_SOURCE_DRIFT:'+file);
 if(projected)validateDeliveryHistoryConsumer(current.read,current);
 return {consumers:2,previousPinsPreserved:true,runtimeDemonstrated:false,publication:'published'};
 },context);
}
export function saleStockHistoricalRead(read=native){return file=>{const bytes=read(file),historical=saleStockHistoricalFile(file,bytes);if(historical!==bytes)validateSaleStockConsumers(read);return historical;};}
export function writeSaleStockConsumers(){
 const launcher=path.resolve(root,'../..');
 for(const [file,snapshot]of model().snapshots){const directory=path.join(launcher,'services',snapshot.manifest.service);fs.writeFileSync(path.join(directory,'contracts.manifest.json'),encode(snapshot.manifest));fs.writeFileSync(path.join(directory,'contracts.lock.json'),encode(snapshot.lock));fs.writeFileSync(path.join(root,file),encode(snapshot));}
 return validateSaleStockConsumers();
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 assert.deepEqual(process.argv.slice(2),['--write'],'Explicit --write required');console.log(JSON.stringify(writeSaleStockConsumers()));
}
