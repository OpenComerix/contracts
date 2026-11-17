import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {operationPointers,parseSource,resolveSelection} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {privateZoneScopeFiles,projectPrivateZoneFile,projectPrivateZoneDocument,withPrivateZoneScope} from '../identity/branch-time-zone-private-v2.mjs';

const root=path.resolve(import.meta.dirname,'../..');
export const onlineAdmissionRevision='5ed0f79a0012b9dd2b8df85977f252ed0da99e78';
export const onlineAdmissionSource=createGitReader()(root,onlineAdmissionRevision);
const registryPath='registry/contracts.json';
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const native=file=>fs.readFileSync(path.join(root,file));
const before=JSON.parse(onlineAdmissionSource(registryPath));
const selected=before.planned.filter(row=>row.materializeIn==='F1-14E');
assert.equal(before.contracts.length,224,'ONLINE_ADMISSION_BASE');
assert.equal(selected.length,10,'ONLINE_ADMISSION_SELECTION');
export const onlineAdmissionIds=Object.freeze(selected.map(row=>row.id));
const selection=row=>({version:row.version,operations:row.operations,pointers:row.operations.length?[]:['']});
const mappings=new Map();
for(const row of before.contracts)for(const entry of row.uriMappings){
 assert(!mappings.has(entry.uri)||mappings.get(entry.uri)===entry.path,'ONLINE_ADMISSION_MAPPING_CONFLICT');
 mappings.set(entry.uri,entry.path);
}
for(const row of selected){const document=parseSource(onlineAdmissionSource(row.path),row.path);if(document.$id)mappings.set(document.$id,row.path);}
const rows=selected.map(row=>{
 const document=parseSource(onlineAdmissionSource(row.path),row.path);
 const operations=[...operationPointers(document).keys()];
 assert.deepEqual(operations,row.operations??[],'ONLINE_ADMISSION_OPERATIONS:'+row.id);
 if(document.openapi)assert.equal(document.info.version,row.version,'ONLINE_ADMISSION_VERSION:'+row.id);
 return {id:row.id,domain:row.domain,surface:row.path.includes('/http/')?'http-'+row.path.split('/')[2]:'validation',
  owner:row.owner,status:'active',capability:row.domain+'.'+path.posix.basename(row.path).replace(/\.(?:schema\.json|json|yaml)$/,''),
  purpose:'F1-14E selected admission of branch time-zone, bound Sales temporal authority and browser reads; consumer migration and runtime remain separate.',
  reasonForChange:'Audited immutable source with exact full CI 44000968198 Passed23/23; preserve transport bytes, prior descriptors and consumer pins.',
  retirement:'Preserve published bytes; incompatible changes require a successor and explicitly authorized migration.',
  version:row.version,path:row.path,commit:onlineAdmissionRevision,tag:null,tagObject:null,sha256:digest(onlineAdmissionSource(row.path)),
  operations,uriMappings:[...mappings].map(([uri,path])=>({uri,path}))};
});
const registry={...before,contracts:[...before.contracts,...rows],planned:before.planned.filter(row=>!onlineAdmissionIds.includes(row.id))};
const closures=new Map();
for(const row of rows){
 const full=resolveSelection(onlineAdmissionSource,row,selection(row),registry),needed=new Set();
 const documents=new Map(full.files.map(file=>[file.path,parseSource(onlineAdmissionSource(file.path),file.path)]));
 const visit=(value,file)=>{
  if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value)){
   if((key==='$ref'||key==='externalValue')&&typeof child==='string'){
    const raw=child.split('#')[0];if(!raw)continue;
    const id=key==='$ref'&&documents.get(file).$id,uri=id?new URL(raw,id).href:raw;
    if(/^[a-z][a-z0-9+.-]*:/i.test(uri))needed.add(uri);
   }else visit(child,file);
  }
 };
 for(const unit of full.values)visit(unit.value,unit.path);
 row.uriMappings=row.uriMappings.filter(mapping=>needed.has(mapping.uri));
 const minimal=resolveSelection(onlineAdmissionSource,row,selection(row),registry);
 assert.deepEqual(minimal,full,'ONLINE_ADMISSION_MINIMAL_MAPPING:'+row.id);closures.set(row.id,minimal);
}
export const onlineAdmittedRegistry=()=>structuredClone(registry);
export const onlineAdmissionClosures=()=>structuredClone([...closures].map(([id,closure])=>({id,...closure})));
const suffix='\n## F1-14E — Admisión seleccionada de fuente temporal y lecturas Sales\n\n'+
 'Diez raíces Identity/Sales desde `'+onlineAdmissionRevision+'`, con '+
 '[CI fuente completa Passed23/23](https://github.com/OpenComerix/contracts/actions/runs/44000968198) verificada por SHA/ref dev exactos. '+
 '234 raíces activas/anteriores registradas, dos planned ajenas, 236 artefactos históricos y ocho consumidores/locks preservados. '+
 'Descriptores con versiones, operaciones, hashes Git y mappings mínimos del cierre. Los bytes de transportes, políticas y fixtures no cambian; '+
 'las secciones candidatas anteriores conservan su snapshot fuente.\n\n'+
 '[Verificador](../scripts/sales/online-admission-v1.mjs) y [pruebas](../test/sales/online-admission-v1.test.mjs): '+
 '`node scripts/sales/online-admission-v1.mjs`; `node --test test/sales/online-admission-v1.test.mjs`. '+
 'Candidato de admisión pendiente de auditoría/publicación y CI completa propias antes de consumo o gitlink. '+
 'No migra consumidores, activa runtime ni acredita SQL, autorización, firmas, cobro o navegador.\n';
const metadata=new Map([[registryPath,encode(registry)],
 ...['identity','sales'].map(domain=>[domain+'/index.json',encode(domainIndex(registry,domain))]),
 ...['identity/README.md','sales/README.md','registry/README.md'].map(file=>[file,Buffer.from(text(onlineAdmissionSource(file))+suffix)])]);
export const onlineAdmissionMetadata=()=>new Map([...metadata].map(([file,bytes])=>[file,Buffer.from(bytes)]));
const delta=new Map(metadata);
for(const row of rows)if(!delta.has(row.path))delta.set(row.path,onlineAdmissionSource(row.path));
for(const closure of closures.values())for(const file of closure.files)if(!delta.has(file.path))delta.set(file.path,onlineAdmissionSource(file.path));
export const onlineAdmissionScopeFiles=Object.freeze([...new Set([...privateZoneScopeFiles,...delta.keys()])]);
const inputs=new Map(delta);
for(const file of [...[...before.contracts,...before.preservedFiles].map(row=>row.path),
 'package.json','pnpm-lock.yaml','.github/workflows/ci.yml','registry/consumers/index.json',
 ...before.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json')])
 if(!inputs.has(file))inputs.set(file,onlineAdmissionSource(file));
export const onlineAdmissionInputPaths=Object.freeze([...inputs.keys()]);
export function validateOnlineAdmissionInput(file,bytes){
 bytes=projectPrivateZoneFile(file,bytes);
 assert(inputs.has(file),'ONLINE_ADMISSION_UNKNOWN_INPUT:'+file);
 assert.equal(text(bytes),text(inputs.get(file)),'ONLINE_ADMISSION_BYTES:'+file);
}
export function validateOnlineAdmission(read=native){
 for(const file of onlineAdmissionInputPaths)validateOnlineAdmissionInput(file,read(file));
 return {admitted:10,roots:234,priorRoots:224,planned:2,consumers:8,
  closureFiles:new Set([...closures.values()].flatMap(closure=>closure.files.map(file=>file.path))).size,runtimeDemonstrated:false};
}
// Single supplied value only: no live reads, gates or cached approvals.
export function projectOnlineAdmissionFile(file,bytes){
 bytes=projectPrivateZoneFile(file,bytes);
 const expected=metadata.get(file);if(!expected)return bytes;
 try{return text(bytes)===text(expected)?onlineAdmissionSource(file):bytes;}catch{return bytes;}
}
export function projectOnlineAdmissionDocument(file,value){
 value=projectPrivateZoneDocument(file,value);
 const expected=metadata.get(file);if(!expected||!file.endsWith('.json'))return value;
 return isDeepStrictEqual(value,JSON.parse(expected))?JSON.parse(onlineAdmissionSource(file)):value;
}
// Check only the current delta here; older owners retain their own preservation gates.
export function withOnlineAdmissionScope(paths,read,verify,label='ONLINE_ADMISSION_BYTES'){
 return withPrivateZoneScope(paths,read,(paths,read)=>withAdmissionScope(paths,read,verify,label),label);
}
function withAdmissionScope(paths,read,verify,label){
 let active=true;const current=new Map();
 const raw=file=>{assert(active,'ONLINE_ADMISSION_CONTEXT_CLOSED');if(!current.has(file))current.set(file,Buffer.from(read(file)));return Buffer.from(current.get(file));};
 try{
  const bytes=raw(registryPath);let value;try{value=JSON.parse(bytes);}catch{throw Error(label+':'+registryPath);}
  if(!isDeepStrictEqual(value,registry)){
   assert(!value.contracts?.some(row=>onlineAdmissionIds.includes(row.id)),'ONLINE_ADMISSION_PARTIAL_SCOPE');
   const result=verify(paths,raw);assert(!result||typeof result.then!=='function','ONLINE_ADMISSION_SYNCHRONOUS');return result;
  }
  for(const [file,expected]of delta)assert.equal(text(raw(file)),text(expected),label+':'+file);
  const result=verify([...new Set([...paths,...delta.keys()])],file=>projectOnlineAdmissionFile(file,raw(file)));
  assert(!result||typeof result.then!=='function','ONLINE_ADMISSION_SYNCHRONOUS');return result;
 }finally{active=false;current.clear();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,2,'ONLINE_ADMISSION_OPTIONS');console.log(JSON.stringify(validateOnlineAdmission()));
}
