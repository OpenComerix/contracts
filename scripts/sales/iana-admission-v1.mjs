import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {operationPointers,parseSource,resolveSelection} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {projectPwaTelemetryDocument,projectPwaTelemetryFile} from '../observability/pwa-telemetry-history-v1.mjs';
import {
 consumerExportPaths,
 projectIanaConsumerExportDocument,
 projectIanaConsumerExportFile,
 projectIanaConsumerHistoricalTest,
 validateIanaConsumerExports,
} from './iana-consumer-exports.mjs';

const root=path.resolve(import.meta.dirname,'../..'),registryPath='registry/contracts.json';
export const ianaAdmissionRevision='019a75d86fd12df53b433aebdc269e85a4064f73';
export const ianaAdmissionSource=createGitReader()(root,ianaAdmissionRevision);
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const native=file=>fs.readFileSync(path.join(root,file));
const before=JSON.parse(ianaAdmissionSource(registryPath));
export const ianaAdmissionIds=Object.freeze([
 'sales.f1-14e.iana.http-shared.sales-types-v3',
 'sales.f1-14e.iana.http-private.pos-sales-internal-v3',
 'identity.f1-14e.iana.http-shared.identity-sales-authority-v2',
 'identity.f1-14e.iana.http-private.identity-sales-authority-v2',
 'identity.f1-14e.iana.http-private.identity-sales-temporal-authority-v2',
 'sales.f1-14e.iana.events.sales.sale.completed.v3',
 'sales.f1-14e.iana.events.sales-flow-v3.asyncapi',
 'sales.f1-14e.iana.fixtures.cases',
]);
export const ianaPublicAdmissionIds=Object.freeze([
 'sales.f1-14e.iana.http-public.pos-sales-v3',
 'sales.f1-14e.iana.http-public.sales-browser-reads-v3',
]);
assert.equal(before.contracts.length,235,'IANA_ADMISSION_BASE');assert.equal(before.planned.length,12,'IANA_ADMISSION_PLANNED');
const selectPlanned=ids=>ids.map(id=>{const found=before.planned.filter(row=>row.id===id);assert.equal(found.length,1,'IANA_ADMISSION_ID:'+id);return found[0];});
const mappings=new Map();
for(const row of before.contracts)for(const mapping of row.uriMappings){assert(!mappings.has(mapping.uri)||mappings.get(mapping.uri)===mapping.path,'IANA_ADMISSION_MAPPING_CONFLICT');mappings.set(mapping.uri,mapping.path);}
for(const row of before.planned.filter(row=>row.materializeIn==='F1-14E-IANA')){const value=parseSource(ianaAdmissionSource(row.path),row.path);if(value.$id)mappings.set(value.$id,row.path);}
const selection=row=>({version:row.version,operations:row.operations,pointers:row.operations.length?[]:['']});
function makeDescriptor(row, publicSurface = false) {
 assert.equal(row.status,'planned');assert.equal(row.materializeIn,'F1-14E-IANA');
 assert((publicSurface?['gateway-bff']:['sales-pos','identity-tenancy']).includes(row.owner));
 const value=parseSource(ianaAdmissionSource(row.path),row.path),operations=[...operationPointers(value).keys()];
 // Registry operation selection is HTTP-only; AsyncAPI is selected by its root pointer.
 assert.deepEqual(value.asyncapi?Object.keys(value.operations??{}):operations,row.operations,'IANA_ADMISSION_OPERATIONS:'+row.id);
 if(value.openapi||value.asyncapi)assert.equal(value.info.version,row.version,'IANA_ADMISSION_VERSION:'+row.id);
 return {id:row.id,domain:row.domain,surface:value.openapi?(publicSurface?'http-public':'http-private'):value.asyncapi?'documentation':row.path.includes('/events/')?'events':value.$id?'schema':'validation',
  owner:row.owner,status:'active',capability:row.domain+'.'+path.posix.basename(row.path).replace(/\.(?:schema\.json|json|yaml)$/, ''),
  purpose:publicSurface?'Public IANA successor for Gateway and browser reads. Consumer adoption and runtime acceptance remain separate.':'Selected IANA and completed.v3 source admission for Identity/Sales; Gateway public surfaces and consumer/runtime migration remain separate.',
  reasonForChange:'Audited immutable source019a75d with full CI44189146644 Passed23/23 and exact dev SHA/ref; preserve published sources, prior descriptors and consumer pins.',
  retirement:'Preserve published v2/v3 bytes and historical facts/replay; no implicit replacement or double publication. Consumer migration requires its authorized cut.',
  version:row.version,path:row.path,commit:ianaAdmissionRevision,tag:null,tagObject:null,sha256:hash(ianaAdmissionSource(row.path)),operations,
  uriMappings:[...mappings].map(([uri,path])=>({uri,path}))};
}
const descriptors=selectPlanned(ianaAdmissionIds).map(row=>makeDescriptor(row));
const registry={...before,contracts:[...before.contracts,...descriptors],planned:before.planned.filter(row=>!ianaAdmissionIds.includes(row.id))};
const publicDescriptors=selectPlanned(ianaPublicAdmissionIds).map(row=>makeDescriptor(row,true));
const publicRegistry={...registry,contracts:[...registry.contracts,...publicDescriptors],planned:registry.planned.filter(row=>!ianaPublicAdmissionIds.includes(row.id))};
function minimalClosure(row, currentRegistry) {
 const full=resolveSelection(ianaAdmissionSource,row,selection(row),currentRegistry),needed=new Set();
 const documents=new Map(full.files.map(file=>[file.path,parseSource(ianaAdmissionSource(file.path),file.path)]));
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
 const minimal=resolveSelection(ianaAdmissionSource,row,selection(row),currentRegistry);
 assert.deepEqual(minimal,full,'IANA_ADMISSION_MINIMAL_MAPPING:'+row.id);
 return minimal;
}
const closures=new Map(descriptors.map(row=>[row.id,minimalClosure(row,registry)]));
const publicClosures=new Map(publicDescriptors.map(row=>[row.id,minimalClosure(row,publicRegistry)]));
export const ianaAdmittedRegistry=()=>structuredClone(registry);
export const ianaAdmissionClosures=()=>structuredClone([...closures].map(([id,closure])=>({id,...closure})));
export const ianaPublicAdmissionClosures=()=>structuredClone([...publicClosures].map(([id,closure])=>({id,...closure})));
const suffix='\n## F1-14E — Admisión seleccionada IANA y completed.v3\n\n'+
 'Ocho raíces Identity/Sales desde `'+ianaAdmissionRevision+'`, con [CI fuente completa Passed23/23](https://github.com/OpenComerix/contracts/actions/runs/44189146644) verificada por SHA/ref dev exactos. '+
 '243 raíces registradas; los 235 descriptores anteriores, 236 artefactos históricos y ocho snapshots/pins permanecen intactos. Cuatro planned se conservan: dos ajenos y las dos superficies públicas Gateway v3, pendientes de su corte. '+
 'Versiones, operaciones, hashes Git y mappings mínimos se fijan a la fuente inmutable; transportes, schemas, fixtures, CI y dependencias no cambian. '+
 'Las secciones fuente anteriores describen su snapshot publicado. [Verificador](../scripts/sales/iana-admission-v1.mjs) y [pruebas](../test/sales/iana-admission-v1.test.mjs). '+
 'Candidato de admisión pendiente de auditoría/publicación y CI completa propias antes del consumo. No migra pins ni acredita runtime, SQL, codec/autoridad o compatibilidad ejecutada.\n';
const metadata=new Map([[registryPath,encode(registry)],
 ...['identity','sales'].map(domain=>[domain+'/index.json',encode(domainIndex(registry,domain))]),
 ...['identity/README.md','sales/README.md','registry/README.md'].map(file=>[file,Buffer.from(text(ianaAdmissionSource(file))+suffix)])]);
export const ianaAdmissionMetadata=()=>new Map([...metadata].map(([file,bytes])=>[file,Buffer.from(bytes)]));
const publicDocuments=new Map([
 [registryPath,publicRegistry],
 ['sales/index.json',domainIndex(publicRegistry,'sales')],
]);
const publicMetadata=new Map([...publicDocuments].map(([file,value])=>[file,encode(value)]));
export const ianaPublicAdmissionMetadata=()=>new Map([...publicMetadata].map(([file,bytes])=>[file,Buffer.from(bytes)]));
const delta=new Map(metadata);
for(const row of descriptors)delta.set(row.path,ianaAdmissionSource(row.path));
for(const closure of closures.values())for(const file of closure.files)if(!delta.has(file.path))delta.set(file.path,ianaAdmissionSource(file.path));
export const ianaAdmissionScopeFiles=Object.freeze([...delta.keys(),...consumerExportPaths]);
const publicDelta=new Map([...delta,...publicMetadata]);
for(const closure of publicClosures.values())for(const file of closure.files)
 if(!publicDelta.has(file.path))publicDelta.set(file.path,ianaAdmissionSource(file.path));
export const ianaPublicAdmissionScopeFiles=Object.freeze([...new Set([...ianaAdmissionScopeFiles,...publicDelta.keys()])]);
const inputs=new Map(delta);
for(const file of [...[...before.contracts,...before.preservedFiles,...before.planned.filter(row=>row.materializeIn==='F1-14E-IANA')].map(row=>row.path),
 'package.json','pnpm-lock.yaml','.github/workflows/ci.yml','registry/consumers/index.json',...before.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json')])
 if(!inputs.has(file))inputs.set(file,ianaAdmissionSource(file));
export const ianaAdmissionInputPaths=Object.freeze([...inputs.keys()]);
export function projectIanaPublicAdmissionFile(file,bytes){
 bytes=projectPwaTelemetryFile(file,bytes);
 const expected=publicMetadata.get(file);
 if(!expected)return bytes;
 try{return text(bytes)===text(expected)?Buffer.from(metadata.get(file)):bytes;}catch{return bytes;}
}
export function validateIanaAdmissionInput(file,bytes){
 assert(inputs.has(file),'IANA_ADMISSION_UNKNOWN:'+file);
 assert(text(projectIanaConsumerExportFile(file,projectIanaPublicAdmissionFile(file,bytes)))===text(inputs.get(file)),'IANA_ADMISSION_BYTES:'+file);
}
export function validateIanaAdmission(read=native){
 const stage=new Map([...publicMetadata.keys()].map(file=>[file,projectPwaTelemetryFile(file,read(file))]));
 const isPublic=file=>text(stage.get(file))===text(publicMetadata.get(file));
 const publicStage=isPublic(registryPath);
 assert.equal(isPublic('sales/index.json'),publicStage,'IANA_ADMISSION_PARTIAL_SCOPE');
 validateIanaConsumerExports(read,{allowPrevious:!publicStage,allowPreviousFrontend:true});
 for(const file of ianaAdmissionInputPaths)validateIanaAdmissionInput(file,stage.get(file)??read(file));
 return {admitted:8,roots:243,priorRoots:235,planned:4,consumers:8,closureFiles:new Set([...closures.values()].flatMap(closure=>closure.files.map(file=>file.path))).size,runtimeDemonstrated:false};
}
export function projectIanaAdmissionFile(file,bytes){bytes=projectIanaPublicAdmissionFile(file,bytes);const expected=metadata.get(file);if(!expected)return projectIanaConsumerExportFile(file,bytes);try{return text(bytes)===text(expected)?ianaAdmissionSource(file):bytes;}catch{return bytes;}}
export function projectIanaAdmissionDocument(file,value){
 value=projectPwaTelemetryDocument(file,value);
 const admitted=publicDocuments.get(file);
 if(admitted&&isDeepStrictEqual(value,admitted))return JSON.parse(ianaAdmissionSource(file));
 const expected=metadata.get(file);if(!expected)return projectIanaConsumerExportDocument(file,value);
 return file.endsWith('.json')&&isDeepStrictEqual(value,JSON.parse(expected))?JSON.parse(ianaAdmissionSource(file)):value;
}
export function withIanaAdmissionScope(paths,read,verify,label='IANA_ADMISSION_BYTES'){
 let active=true;const current=new Map();
 const raw=file=>{assert(active,'IANA_ADMISSION_CONTEXT_CLOSED');if(!current.has(file))current.set(file,projectPwaTelemetryFile(file,Buffer.from(read(file))));return Buffer.from(current.get(file));};
 try{
  const bytes=raw(registryPath);let value;try{value=JSON.parse(bytes);}catch{throw Error(label+':'+registryPath);}
  const publicStage=value?.contracts?.length===publicRegistry.contracts.length&&isDeepStrictEqual(value,publicRegistry);
  if(!publicStage&&!isDeepStrictEqual(value,registry)){
   assert(!value.contracts?.some(row=>ianaAdmissionIds.includes(row.id)||ianaPublicAdmissionIds.includes(row.id)),'IANA_ADMISSION_PARTIAL_SCOPE');
   const result=verify(paths,raw);assert(!result||typeof result.then!=='function','IANA_ADMISSION_SYNCHRONOUS');return result;
  }
  for(const [file,expected]of publicStage?publicDelta:delta)assert(text(raw(file))===text(expected),label+':'+file);
  validateIanaConsumerExports(raw,{allowPrevious:!publicStage,allowPreviousFrontend:true});
  const scopeFiles=publicStage?ianaPublicAdmissionScopeFiles:ianaAdmissionScopeFiles;
  const result=verify([...new Set([...paths,...scopeFiles])],
   file=>projectIanaConsumerHistoricalTest(file,projectIanaAdmissionFile(file,raw(file))));
  assert(!result||typeof result.then!=='function','IANA_ADMISSION_SYNCHRONOUS');return result;
 }finally{active=false;current.clear();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,2,'IANA_ADMISSION_OPTIONS');console.log(JSON.stringify(validateIanaAdmission()));
}
