import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';
import {sha256} from '../../tools/architecture/consumer-gate.mjs';
import {projectDeliveryConsumerFile,projectDeliveryConsumerDocument} from './delivery-consumer-v1.mjs';

export const paymentConsumerBase='aa0d856a3e49475930699bef38a3e9cab9a04803';
export const financePaymentPublished='8986e5270384017125e2692a1def0827eaf90909';
const root=path.resolve(import.meta.dirname,'../..'),source=gitReader(root,paymentConsumerBase);
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const native=file=>readFileSync(path.join(root,file));
let immutable;
function model(){
 if(immutable)return immutable;
 const previous=JSON.parse(source('registry/consumers/finance.json'));
 const registry=JSON.parse(source('registry/contracts.json'));
 const manifest=structuredClone(previous.manifest);
 const entry=id=>manifest.contracts.find(row=>row.id===id);
 const purpose='F1-12C atomic cash command and retained result; original financial facts, no broker delivery or history reader.';
 entry('finance.http.private.v1').operations.push('getSaleCashResult');
 entry('finance.types.v1').pointers.push('/$defs/RecordCash','/$defs/Payment','/$defs/RecordResult');
 entry('finance.protocol-policy.v1').pointers.push('/payment','/semantic_identity','/retries','/compatibility');
 entry('identity.finance-authority.policy.v1').pointers.push('/profiles/2','/profiles/3');
 for(const id of ['finance.http.private.v1','finance.types.v1','finance.protocol-policy.v1','identity.finance-authority.policy.v1'])entry(id).purpose=purpose;
 const add=(id,role,operations=[],pointers=[''])=>{
  const descriptor=registry.contracts.find(row=>row.id===id);
  assert.equal(descriptor?.status,'active','PAYMENT_ADMISSION:'+id);
  manifest.contracts.push({id,role,version:descriptor.version,operations,pointers,purpose,gates:[...previous.manifest.contracts[0].gates]});
 };
 add('finance.record-sale-cash.v1.consumer','consumer');
 add('finance.record-sale-cash.result.v1','producer');
 add('finance.sale-payment.recorded.v2','producer');
 add('sales.finance-step-authority.http.v1','consumer',['authorizeSaleProcessStep'],[]);
 add('sales.finance-step-authority.schema.v1','validation',[],['/$defs/Request','/$defs/Decision']);
 const preliminary=makeLock(root,manifest,encode(manifest),registry,previous.lock.entries);
 const sources=new Map();
 for(const locked of preliminary.entries)for(const file of locked.files){
  const bytes=gitReader(root,locked.commit)(file.path);
  if(sources.has(file.path))assert(sources.get(file.path).equals(bytes),'PAYMENT_SOURCE_COLLISION:'+file.path);
  else sources.set(file.path,bytes);
  if(!manifest.assets.some(asset=>asset.sourcePath===file.path))manifest.assets.push({contractId:locked.id,sourcePath:file.path,
    destination:'src/modules/cash/transport/contracts/'+file.path,representation:'exact',purpose:'runtime'});
 }
 const manifestBytes=encode(manifest),lock=makeLock(root,manifest,manifestBytes,registry,previous.lock.entries);
 for(const asset of lock.assets)asset.localSha256=asset.sourceSha256;
 const snapshot={formatVersion:1,publication:'published',sourceRepository:'opencomerix/finance',
  sourceCommit:financePaymentPublished,manifestSha256:sha256(manifestBytes),lockSha256:sha256(encode(lock)),manifest,lock};
 const index=JSON.parse(source('registry/consumers/index.json'));
 index.coverage='Eight known consumers; Finance F1-12B/C cash and retained-result selections; external consumers remain unknown.';
 const readme=text(source('finance/README.md'))+'\n## F1-12C — Selección consumidora de cobro atómico\n\n'+
  'Amplía únicamente Finance: comando consumer compatible, resultado productor estricto, payment v2, consulta privada y autoridad Sales. '+
  'Conserva los pins anteriores y los siete consumidores ajenos; sin cambios en transportes publicados. '+
  'Export publicado de Finance `'+financePaymentPublished+'`, con [CI completa conforme 8/8](https://github.com/OpenComerix/finance/actions/runs/42566229211). '+
  'La ampliación de Contracts requiere su CI completa exacta antes de consumo o gitlink; estado en ESTADO del launcher. '+
  'No acredita runtime, broker, lector histórico ni cierre H5. Gate: `node --test test/finance/payment-consumer-v1.test.mjs`.\n';
 const metadata=new Map([['registry/consumers/finance.json',encode(snapshot)],['registry/consumers/index.json',encode(index)],['finance/README.md',Buffer.from(readme)]]);
 immutable={previous,snapshot,sources,metadata};return immutable;
}
export const paymentConsumerFiles=Object.freeze(['registry/consumers/finance.json','registry/consumers/index.json','finance/README.md',
 'scripts/finance/payment-consumer-v1.mjs','test/finance/payment-consumer-v1.test.mjs']);
export function paymentConsumerSnapshot(){return structuredClone(model().snapshot);}
export function paymentConsumerMetadata(){return new Map([...model().metadata].map(([file,bytes])=>[file,Buffer.from(bytes)]));}
// Only deterministic immutable facts are reused. Supplied live bytes are checked on every call.
export function projectPaymentConsumerFile(file,bytes){
 bytes=projectDeliveryConsumerFile(file,bytes);
 const expected=model().metadata.get(file);
 return expected&&text(bytes)===text(expected)?source(file):bytes;
}
export function projectPaymentConsumerDocument(file,value){
 value=projectDeliveryConsumerDocument(file,value);
 const expected=model().metadata.get(file);
 return expected&&file.endsWith('.json')&&isDeepStrictEqual(value,JSON.parse(expected))?JSON.parse(source(file)):value;
}
export function withPaymentConsumerScope(paths,read){
 const live=read;read=file=>projectDeliveryConsumerFile(file,live(file));
 const file='registry/consumers/index.json',bytes=read(file);
 if(projectPaymentConsumerFile(file,bytes)===bytes)return new Set(paths);
 for(const [name,expected]of model().metadata)assert.equal(text(name===file?bytes:read(name)),text(expected),'PAYMENT_SCOPE:'+name);
 return new Set([...paths,...paymentConsumerFiles]);
}
export function validatePaymentConsumer(read=native){
 const live=read;read=file=>projectDeliveryConsumerFile(file,live(file));
 const facts=model();
 for(const [file,bytes]of facts.metadata)assert.equal(text(read(file)),text(bytes),'PAYMENT_METADATA:'+file);
 for(const [file,bytes]of facts.sources)assert.equal(text(read(file)),text(bytes),'PAYMENT_SOURCE:'+file);
 const registry=JSON.parse(source('registry/contracts.json'));
 assert.equal(text(read('registry/contracts.json')),text(source('registry/contracts.json')),'PAYMENT_REGISTRY');
 for(const service of registry.requiredConsumers.filter(name=>name!=='finance')){
  const file='registry/consumers/'+service+'.json';assert.equal(text(read(file)),text(source(file)),'PAYMENT_PREVIOUS:'+service);
 }
 return {selections:facts.snapshot.manifest.contracts.length,assets:facts.sources.size,runtime_demonstrated:false};
}
export function materializePaymentConsumer(){
 const facts=model(),directory=path.resolve(root,'../../services/finance');
 for(const [file,value]of [['contracts.manifest.json',facts.snapshot.manifest],['contracts.lock.json',facts.snapshot.lock]])writeFileSync(path.join(directory,file),encode(value));
 for(const asset of facts.snapshot.manifest.assets){const target=path.join(directory,asset.destination);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,facts.sources.get(asset.sourcePath));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 assert.deepEqual(process.argv.slice(2),['--write']);
 for(const [file,bytes]of paymentConsumerMetadata())writeFileSync(path.join(root,file),bytes);
 materializePaymentConsumer();console.log(JSON.stringify(validatePaymentConsumer()));
}
