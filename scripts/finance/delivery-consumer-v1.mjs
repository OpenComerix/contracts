import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';
import {sha256} from '../../tools/architecture/consumer-gate.mjs';
export const deliveryConsumerBase='dea90c25056334b1e66c73e5a1bfa35095c2037e';
export const financeDeliveryPublished='b317200fd77c99854b1375225cdf18bda229ebcc';
const root=path.resolve(import.meta.dirname,'../..'),source=gitReader(root,deliveryConsumerBase);
const encode=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const text=v=>new TextDecoder('utf-8',{fatal:true}).decode(v).replaceAll('\r\n','\n');
const native=file=>readFileSync(path.join(root,file));
let immutable;
function model(){
 if(immutable)return immutable;
 const previous=JSON.parse(source('registry/consumers/finance.json')),registry=JSON.parse(source('registry/contracts.json'));
 const manifest=structuredClone(previous.manifest),entry=id=>manifest.contracts.find(r=>r.id===id);
 const purpose='F1-12D local broker delivery and authorized retained-history recovery; no commercial purge, public routing or H5.';
 for(const id of ['finance.http.private.v1','finance.http.public.v1'])entry(id).operations.push('createFinanceHistoryReadSession','readFinanceHistoryFacts');
 entry('finance.types.v1').pointers.push('/$defs/HistoryRequest','/$defs/HistorySession','/$defs/HistoryPage');
 entry('finance.protocol-policy.v1').pointers.push('/operations/5','/operations/6');
 entry('identity.finance-authority.policy.v1').pointers.push('/permissions/5','/permissions/6');
 for(const id of ['finance.http.private.v1','finance.http.public.v1','finance.types.v1','finance.protocol-policy.v1','identity.finance-authority.policy.v1'])entry(id).purpose=purpose;
 const descriptor=registry.contracts.find(r=>r.id==='finance.flow.asyncapi.v1');
 assert.equal(descriptor.status,'active');
 manifest.contracts.push({id:descriptor.id,role:'semantic-owner',version:descriptor.version,operations:[],pointers:[''],purpose,gates:[...manifest.contracts[0].gates]});
 const preliminary=makeLock(root,manifest,encode(manifest),registry,previous.lock.entries),sources=new Map();
 for(const e of preliminary.entries)for(const f of e.files){
  const bytes=gitReader(root,e.commit)(f.path);
  if(sources.has(f.path))assert(sources.get(f.path).equals(bytes),'DELIVERY_SOURCE_COLLISION');else sources.set(f.path,bytes);
  if(!manifest.assets.some(a=>a.sourcePath===f.path))manifest.assets.push({contractId:e.id,sourcePath:f.path,destination:'src/modules/cash/transport/contracts/'+f.path,representation:'exact',purpose:'runtime'});
 }
 const manifestBytes=encode(manifest),lock=makeLock(root,manifest,manifestBytes,registry,previous.lock.entries);
 for(const a of lock.assets)a.localSha256=a.sourceSha256;
 const snapshot={formatVersion:1,publication:'published',sourceRepository:'opencomerix/finance',sourceCommit:financeDeliveryPublished,
  manifestSha256:sha256(manifestBytes),lockSha256:sha256(encode(lock)),manifest,lock};
 const index=JSON.parse(source('registry/consumers/index.json'));
 index.coverage='Eight known consumers; Finance F1-12D published delivery and history selections; external consumers remain unknown.';
 const readme=text(source('finance/README.md'))+'\n## F1-12D — Selección de entrega e historia\n\n'+
  'Selección de Finance: dos operaciones históricas, sus DTO/permisos publicados y AsyncAPI. Conserva fuentes, pins B/C y los siete consumidores ajenos; no modifica transportes publicados. '+
  'Export publicado de Finance `'+financeDeliveryPublished+'`, con [CI completa conforme 8/8](https://github.com/OpenComerix/finance/actions/runs/42627471341). '+
  'La ampliación de Contracts requiere su CI completa exacta antes de consumo o gitlink; el export no acredita por sí solo broker real, recuperación SQL ni H5. '+
  'Gate propio: `node --test test/finance/delivery-consumer-v1.test.mjs`; estado en ESTADO del launcher.\n';
 immutable={previous,registry,sources,snapshot,metadata:new Map([['registry/consumers/finance.json',encode(snapshot)],['registry/consumers/index.json',encode(index)],['finance/README.md',Buffer.from(readme)]])};
 return immutable;
}
export const deliveryConsumerFiles=Object.freeze(['registry/consumers/finance.json','registry/consumers/index.json','finance/README.md','scripts/finance/delivery-consumer-v1.mjs','test/finance/delivery-consumer-v1.test.mjs']);
export function deliveryConsumerSnapshot(){return structuredClone(model().snapshot);}
export function deliveryConsumerMetadata(){return new Map([...model().metadata].map(([f,b])=>[f,Buffer.from(b)]));}
// Pure per-value projection: deterministic source calculations only, no current
// validation or recursive historical validator can run from this read path.
export function projectDeliveryConsumerFile(file,bytes){const expected=model().metadata.get(file);return expected&&text(bytes)===text(expected)?source(file):bytes;}
export function projectDeliveryConsumerDocument(file,value){const expected=model().metadata.get(file);return expected&&file.endsWith('.json')&&isDeepStrictEqual(value,JSON.parse(expected))?JSON.parse(source(file)):value;}
export function validateDeliveryConsumer(read=native){
 const facts=model();
 for(const [file,bytes]of facts.metadata)assert.equal(text(read(file)),text(bytes),'DELIVERY_METADATA:'+file);
 assert.equal(text(read('registry/contracts.json')),text(source('registry/contracts.json')),'DELIVERY_REGISTRY');
 for(const service of facts.registry.requiredConsumers.filter(s=>s!=='finance')){const f='registry/consumers/'+service+'.json';assert.equal(text(read(f)),text(source(f)),'DELIVERY_PREVIOUS:'+service);}
 for(const [file,bytes]of facts.sources)assert.equal(text(read(file)),text(bytes),'DELIVERY_SOURCE:'+file);
 return{selections:facts.snapshot.manifest.contracts.length,assets:facts.sources.size,runtime_demonstrated:false};
}
export function materializeDeliveryConsumer(){
 const facts=model(),directory=path.resolve(root,'../../services/finance');
 for(const [file,value]of [['contracts.manifest.json',facts.snapshot.manifest],['contracts.lock.json',facts.snapshot.lock]])writeFileSync(path.join(directory,file),encode(value));
 for(const a of facts.snapshot.manifest.assets){const target=path.join(directory,a.destination);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,facts.sources.get(a.sourcePath));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 assert.deepEqual(process.argv.slice(2),['--write']);
 for(const [file,bytes]of deliveryConsumerMetadata())writeFileSync(path.join(root,file),bytes);
 materializeDeliveryConsumer();console.log(JSON.stringify(validateDeliveryConsumer()));
}
