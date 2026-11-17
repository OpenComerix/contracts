import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {operationPointers,parseSource,resolveSelection} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {withIanaScope,ianaSourceFiles} from '../sales/iana-source-v1.mjs';
import {onlineTemporalConsumerFiles,projectOnlineTemporalFile,projectOnlineTemporalDocument,withOnlineTemporalConsumerScope} from './online-temporal-consumer-v1.mjs';

const root=path.resolve(import.meta.dirname,'../..');
export const privateZoneAdmissionRevision='14a265e024a68887a9a1314c35d29b632258ed97';
export const privateZoneAdmissionSource=createGitReader()(root,privateZoneAdmissionRevision);
export const privateZoneAdmissionId='identity.f1-14e.private.identity-branch-time-zone-v2';
const registryPath='registry/contracts.json';
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const native=file=>fs.readFileSync(path.join(root,file));
const before=JSON.parse(privateZoneAdmissionSource(registryPath));
const selected=before.planned.filter(row=>row.id===privateZoneAdmissionId);
assert.equal(before.contracts.length,234,'PRIVATE_ZONE_ADMISSION_BASE');
assert.equal(before.planned.length,3,'PRIVATE_ZONE_ADMISSION_PLANNED');
assert.equal(selected.length,1,'PRIVATE_ZONE_ADMISSION_SELECTION');
const intention=selected[0];
assert.equal(intention.owner,'identity-tenancy','PRIVATE_ZONE_ADMISSION_OWNER');
assert.equal(intention.domain,'identity','PRIVATE_ZONE_ADMISSION_DOMAIN');
assert.equal(intention.status,'planned','PRIVATE_ZONE_ADMISSION_STATUS');
assert.equal(intention.version,'2.0.0','PRIVATE_ZONE_ADMISSION_VERSION');
assert.equal(intention.path,'identity/http/private/v2/identity-branch-time-zone-v2.yaml','PRIVATE_ZONE_ADMISSION_PATH');
const document=parseSource(privateZoneAdmissionSource(intention.path),intention.path);
const operations=[...operationPointers(document).keys()];
assert.deepEqual(operations,['getBranchTimeZone','configureBranchTimeZone'],'PRIVATE_ZONE_ADMISSION_OPERATIONS');
assert.deepEqual(operations,intention.operations,'PRIVATE_ZONE_ADMISSION_INTENTION');
assert.equal(document.info.version,intention.version,'PRIVATE_ZONE_ADMISSION_WIRE_VERSION');
const descriptor={id:intention.id,domain:intention.domain,surface:'http-private',owner:intention.owner,status:'active',
 capability:'identity.identity-branch-time-zone-v2',
 purpose:'Private branch time-zone contract with browser Origin/CSRF owned by Gateway and current delegated human authority retained by Identity.',
 reasonForChange:'Audited immutable source with exact full CI 44071517687 Passed23/23; selected admission only, preserving all published sources and consumer pins.',
 retirement:'Preserve published v1/v2 bytes; incompatible changes require a successor and an explicitly authorized consumer migration.',
 version:intention.version,path:intention.path,commit:privateZoneAdmissionRevision,tag:null,tagObject:null,
 sha256:digest(privateZoneAdmissionSource(intention.path)),operations,uriMappings:[]};
const registry={...before,contracts:[...before.contracts,descriptor],planned:before.planned.filter(row=>row.id!==privateZoneAdmissionId)};
const selection={version:descriptor.version,operations:descriptor.operations,pointers:[]};
// Every reference is local. Resolving the immutable closure with zero mappings
// proves that no external mapping is needed; no broad mapping set is admitted.
const closure=resolveSelection(privateZoneAdmissionSource,descriptor,selection,registry);
assert.deepEqual(closure.files.map(file=>file.path),[
 'common/http/shared/v3/problem-details-v3.schema.json',
 'identity/fixtures/branch-time-zone/v1/responses.json',
 'identity/http/private/v2/identity-branch-time-zone-v2.yaml',
 'identity/http/shared/v1/identity-branch-time-zone-v1.schema.json',
],'PRIVATE_ZONE_ADMISSION_CLOSURE');
assert.equal(closure.units.length,18,'PRIVATE_ZONE_ADMISSION_UNITS');
export const privateZoneAdmittedRegistry=()=>structuredClone(registry);
export const privateZoneAdmissionClosure=()=>structuredClone(closure);
const suffix='\n## F1-14E — Admisión seleccionada del privado de zona v2\n\n'+
 'Una raíz privada 2.0.0 desde `'+privateZoneAdmissionRevision+'`, con '+
 '[CI fuente completa Passed23/23](https://github.com/OpenComerix/contracts/actions/runs/44071517687) verificada por SHA/ref dev exactos. '+
 '235 raíces registradas, dos planned ajenas, 236 artefactos históricos y ocho consumidores/locks preservados. '+
 'Descriptor con operaciones/hash Git y cierre de cuatro archivos/18 unidades, sin mappings URI externos. '+
 'Transportes, schemas, fixtures, políticas, CI y pins permanecen intactos; v1 no se retira. Las secciones fuente anteriores describen su snapshot publicado.\n\n'+
 '[Verificador](../scripts/identity/branch-time-zone-private-v2-admission.mjs) y '+
 '[pruebas](../test/identity/branch-time-zone-private-v2-admission.test.mjs): '+
 '`node --test test/identity/branch-time-zone-private-v2-admission.test.mjs`. '+
 'Candidato pendiente de auditoría/publicación y CI completa propias antes de consumo o gitlink. '+
 'No migra consumidores ni acredita runtime, SQL, CSRF o autorización ejecutada.\n';
const metadata=new Map([[registryPath,encode(registry)],
 ['identity/index.json',encode(domainIndex(registry,'identity'))],
 ...['identity/README.md','registry/README.md'].map(file=>[file,Buffer.from(text(privateZoneAdmissionSource(file))+suffix)])]);
export const privateZoneAdmissionMetadata=()=>new Map([...metadata].map(([file,bytes])=>[file,Buffer.from(bytes)]));
const delta=new Map(metadata);
for(const file of closure.files)delta.set(file.path,privateZoneAdmissionSource(file.path));
const ownScopeFiles=Object.freeze([...new Set([...delta.keys(),...onlineTemporalConsumerFiles])]);
export const privateZoneAdmissionScopeFiles=Object.freeze([...new Set([...ianaSourceFiles,...ownScopeFiles])]);
const inputPaths=new Set([...delta.keys(),...[...before.contracts,...before.preservedFiles].map(row=>row.path),
 'package.json','pnpm-lock.yaml','.github/workflows/ci.yml','registry/consumers/index.json',
 ...before.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json')]);
export const privateZoneAdmissionInputPaths=Object.freeze([...inputPaths]);
export function validatePrivateZoneAdmissionInput(file,bytes){
 bytes=projectOnlineTemporalFile(file,bytes);
 assert(inputPaths.has(file),'PRIVATE_ZONE_ADMISSION_UNKNOWN_INPUT:'+file);
 assert.equal(text(bytes),text(delta.get(file)??privateZoneAdmissionSource(file)),'PRIVATE_ZONE_ADMISSION_BYTES:'+file);
}
export function validatePrivateZoneAdmission(read=native){
 return withOnlineTemporalConsumerScope([],read,(_paths,read)=>{
 for(const file of privateZoneAdmissionInputPaths)validatePrivateZoneAdmissionInput(file,read(file));
 return {admitted:1,roots:235,priorRoots:234,planned:2,consumers:8,closureFiles:4,closureUnits:18,runtimeDemonstrated:false};
 });
}
// Exact supplied-value projections; no other current input is read or approved.
export function projectPrivateZoneAdmissionFile(file,bytes){
 bytes=projectOnlineTemporalFile(file,bytes);
 const expected=metadata.get(file);if(!expected)return bytes;
 try{return text(bytes)===text(expected)?privateZoneAdmissionSource(file):bytes;}catch{return bytes;}
}
export function projectPrivateZoneAdmissionDocument(file,value){
 value=projectOnlineTemporalDocument(file,value);
 const expected=metadata.get(file);if(!expected||!file.endsWith('.json'))return value;
 return isDeepStrictEqual(value,JSON.parse(expected))?JSON.parse(privateZoneAdmissionSource(file)):value;
}
// Only the eight current delta inputs are proved here. Existing owners keep
// their own preservation gates; no historical full gate is nested per input.
export function withPrivateZoneAdmissionScope(paths,read,verify,label='PRIVATE_ZONE_ADMISSION_BYTES'){
 return withIanaScope(paths,read,(paths,read)=>withPrivateZoneAdmissionCore(paths,read,verify,label),label);
}
function withPrivateZoneAdmissionCore(paths,read,verify,label){
 let active=true;const current=new Map();
 const raw=file=>{assert(active,'PRIVATE_ZONE_ADMISSION_CONTEXT_CLOSED');if(!current.has(file))current.set(file,Buffer.from(read(file)));return Buffer.from(current.get(file));};
 try{
  const bytes=raw(registryPath);let value;try{value=JSON.parse(bytes);}catch{throw Error(label+':'+registryPath);}
  if(!isDeepStrictEqual(value,registry)){
   assert(!value.contracts?.some(row=>row.id===privateZoneAdmissionId),'PRIVATE_ZONE_ADMISSION_PARTIAL_SCOPE');
   const result=verify(paths,raw);assert(!result||typeof result.then!=='function','PRIVATE_ZONE_ADMISSION_SYNCHRONOUS');return result;
  }
  return withOnlineTemporalConsumerScope([...new Set([...paths,...ownScopeFiles])],raw,(paths,read)=>{
   for(const file of ownScopeFiles)validatePrivateZoneAdmissionInput(file,read(file));
   const result=verify([...new Set([...paths,...ownScopeFiles])],file=>projectPrivateZoneAdmissionFile(file,read(file)));
   assert(!result||typeof result.then!=='function','PRIVATE_ZONE_ADMISSION_SYNCHRONOUS');return result;
  });
 }finally{active=false;current.clear();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,2,'PRIVATE_ZONE_ADMISSION_OPTIONS');console.log(JSON.stringify(validatePrivateZoneAdmission()));
}
