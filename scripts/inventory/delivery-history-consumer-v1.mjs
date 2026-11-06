import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {spawnSync} from 'node:child_process';
import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';
import {authorityConsumerHistoricalFile,authorityConsumerHistoricalSnapshot,withAuthorityConsumerContext} from '../finance/authority-consumers-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..'),base=gitReader(root,'77bf7e6fa5bf429483ea515504555c55c4890b73');
const file='registry/consumers/inventory.json',encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n'),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const purpose='F1-11E owner message delivery and authorized retained history; no new business consumer, purge, completed sale or cloud.';
let cached;
function model(){
 if(cached)return cached;
 const registry=JSON.parse(base('registry/contracts.json')),previous=JSON.parse(base(file)),manifest=structuredClone(previous.manifest);
 function add(id,role,operations=[],pointers=[]){
  const descriptor=registry.contracts.find(row=>row.id===id);assert(descriptor?.status==='active','IEH_ADMISSION:'+id);
  let entry=manifest.contracts.find(row=>row.id===id&&row.role===role);
  if(!entry){entry={id,role,version:descriptor.version,operations:[],pointers:[],purpose,gates:['pnpm contracts:metadata','pnpm test:cov','pnpm test:integration','pnpm test:contracts','pnpm test:e2e']};manifest.contracts.push(entry);}
  entry.operations=[...new Set([...entry.operations,...operations])];entry.pointers=[...new Set([...entry.pointers,...pointers])];entry.purpose=purpose;
 }
 const operations=['createInventoryHistoryReadSession','readInventoryHistoryFacts'];
 add('inventory.http.private.v1','producer',operations);add('inventory.http.public.v1','semantic-owner',operations);
 add('inventory.types.v1','validation',[],['HistoryRequest','HistorySession','HistoryPage','HistoryFact','MissingRange','HttpHistorySession','HttpHistoryPage'].map(name=>'/$defs/'+name));
 add('inventory.flow.asyncapi.v1','documentation',[],['']);
 add('inventory.protocol-policy.v1','consumer',[],['/operations/9','/operations/10','/history','/idempotency/history','/authority/history_step_up_seconds']);
 add('identity.inventory-authority.policy.v1','consumer',[],['/permissions/9','/permissions/10']);
 add('identity.inventory-authority.schema.v1','validation',[],['/$defs/CanonicalRequest/oneOf/9','/$defs/CanonicalRequest/oneOf/10']);
 const bytes=encode(manifest),lock=makeLock(root,manifest,bytes,registry,previous.lock.entries);
 const snapshot={...previous,publication:'published',sourceCommit:'34eb78e52ae07dbc117b6f9a908a1cf27cae6f10',manifestSha256:hash(bytes),lockSha256:hash(encode(lock)),manifest,lock};
 const closures=new Map();for(const entry of lock.entries)for(const source of entry.files){const bytes=gitReader(root,entry.commit)(source.path);if(closures.has(source.path))assert.equal(text(closures.get(source.path)),text(bytes),'IEH_SOURCE_COLLISION');closures.set(source.path,bytes);}
 cached={previous,snapshot,closures};return cached;
}
const native=file=>fs.readFileSync(path.join(root,file));
export const deliveryHistoryMetadata=()=>encode(model().snapshot);
export function deliveryHistoryHistoricalFile(name,bytes){bytes=authorityConsumerHistoricalFile(name,bytes);return name===file&&text(bytes)===text(encode(model().snapshot))?encode(model().previous):bytes;}
export function deliveryHistoryHistoricalSnapshot(value){value=authorityConsumerHistoricalSnapshot(value);return isDeepStrictEqual(value,model().snapshot)?structuredClone(model().previous):value;}
export function validateDeliveryHistoryConsumer(read=native,context){
 return withAuthorityConsumerContext(read,current=>{
 read=name=>{try{return current.read(name);}catch(cause){throw new Error('IEH_SOURCE_DRIFT',{cause});}};
 assert.equal(text(read(file)),text(encode(model().snapshot)),'IEH_EXACT_METADATA');
 assert.equal(text(read('registry/contracts.json')),text(base('registry/contracts.json')),'IEH_REGISTRY_DRIFT');
 assert.equal(text(read('registry/consumers/index.json')),text(base('registry/consumers/index.json')),'IEH_COVERAGE_DRIFT');
 for(const name of JSON.parse(base('registry/consumers/index.json')).consumers.map(row=>'registry/consumers/'+row.file).filter(name=>name!==file))assert.equal(text(read(name)),text(base(name)),'IEH_OTHER_CONSUMER_DRIFT');
 for(const [name,bytes]of model().closures)assert.equal(text(read(name)),text(bytes),'IEH_SOURCE_DRIFT:'+name);
 return {consumers:1,previousPinsPreserved:true,publication:'published',runtimeDemonstrated:false};
 },context);
}
export function writeDeliveryHistoryConsumer(){const snapshot=model().snapshot,owner=path.resolve(root,'../../services/inventory');for(const [name,value]of [['contracts.manifest.json',snapshot.manifest],['contracts.lock.json',snapshot.lock]])fs.writeFileSync(path.join(owner,name),encode(value));fs.writeFileSync(path.join(root,file),encode(snapshot));return validateDeliveryHistoryConsumer();}
export function verifyDeliveryHistoryImpactReport(report,saved){
 assert.deepEqual(report,saved,'IEH_IMPACT_ARTIFACT_DRIFT');
 assert.equal(report.formatVersion,1,'IEH_IMPACT_FORMAT');assert.equal(report.candidate,'WORKTREE','IEH_IMPACT_REVISION');assert.equal(report.automaticDispatch,false,'IEH_IMPACT_DISPATCH');
 const services=JSON.parse(base('registry/consumers/index.json')).consumers.map(row=>row.service).sort();
 assert.deepEqual(report.consumers.map(row=>row.service).sort(),services,'IEH_IMPACT_COVERAGE');
 assert(report.graph.length>0,'IEH_IMPACT_GRAPH');
 for(const consumer of report.consumers){assert.equal(consumer.affected,false,'IEH_IMPACT_AFFECTED');assert.deepEqual(consumer.dependencies,[],'IEH_IMPACT_DIFFERENCE');}
 return {consumers:services.length,graphEntries:report.graph.length,affected:0};
}
export function validateDeliveryHistoryImpact(){
 validateDeliveryHistoryConsumer();
 const output='.ci-artifacts/f111e-impact.json';
 const result=spawnSync(process.execPath,['tools/architecture/cli.mjs','impact','--output',output],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error||result.status!==0||result.signal){if(result.stdout)process.stdout.write(result.stdout);throw Error('IEH_CANONICAL_IMPACT_FAILED');}
 const bytes=fs.readFileSync(path.join(root,output));
 return {canonicalExit:result.status,...verifyDeliveryHistoryImpactReport(JSON.parse(result.stdout),JSON.parse(bytes)),artifact:output,sha256:hash(bytes)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 assert(process.argv.length===3&&['--write','--impact'].includes(process.argv[2]),'Explicit --write or --impact required');
 console.log(JSON.stringify(process.argv[2]==='--write'?writeDeliveryHistoryConsumer():validateDeliveryHistoryImpact()));
}
