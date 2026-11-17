import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {ianaAdmissionScopeFiles,projectIanaAdmissionFile,projectIanaAdmissionDocument,withIanaAdmissionScope} from './iana-admission-v1.mjs';

export const root=path.resolve(import.meta.dirname,'../..');
export const ianaBase='28ba8fce7f14fcaa668374756b140341f4bd6a6a';
const source=createGitReader()(root,ianaBase);
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const native=file=>fs.readFileSync(path.join(root,file));
export const ianaPattern='^[A-Za-z_]+(?:/[A-Za-z0-9_+-]+)+$';
export const ianaSuccessors=Object.freeze([
 ['sales/http/shared/v2/sales-types-v2.schema.json','sales/http/shared/v3/sales-types-v3.schema.json','sales-pos'],
 ['sales/http/public/v2/pos-sales-v2.yaml','sales/http/public/v3/pos-sales-v3.yaml','gateway-bff'],
 ['sales/http/private/v2/pos-sales-internal-v2.yaml','sales/http/private/v3/pos-sales-internal-v3.yaml','sales-pos'],
 ['sales/http/public/v2/sales-browser-reads-v2.yaml','sales/http/public/v3/sales-browser-reads-v3.yaml','gateway-bff'],
 ['identity/http/shared/v1/identity-sales-authority-v1.schema.json','identity/http/shared/v2/identity-sales-authority-v2.schema.json','identity-tenancy'],
 ['identity/http/private/v1/identity-sales-authority-v1.yaml','identity/http/private/v2/identity-sales-authority-v2.yaml','identity-tenancy'],
 ['identity/http/private/v1/identity-sales-temporal-authority-v1.yaml','identity/http/private/v2/identity-sales-temporal-authority-v2.yaml','identity-tenancy'],
 ['sales/events/v2/sales.sale.completed.v2.schema.json','sales/events/v3/sales.sale.completed.v3.schema.json','sales-pos'],
 ['sales/events/v2/sales-flow-v2.asyncapi.yaml','sales/events/v3/sales-flow-v3.asyncapi.yaml','sales-pos'],
]);
export const ianaFixtures='sales/fixtures/iana-time-zones/v1/cases.json';
export function successorDocument(before,after){
 const value=JSON.parse(source(before));
 const replace=node=>{
  if(Array.isArray(node))return node.map(replace);
  if(!node||typeof node!=='object')return node;
  return Object.fromEntries(Object.entries(node).map(([key,item])=>{
   if(key==='$ref'&&typeof item==='string'){
    item=item.replace('shared/v2/sales-types-v2.schema.json','shared/v3/sales-types-v3.schema.json');
    if(before.endsWith('sales-flow-v2.asyncapi.yaml'))item=item.replace('sales.sale.completed.v2.schema.json','sales.sale.completed.v3.schema.json').replace('sales.sale.completed.v2','sales.sale.completed.v3');
    if(before.includes('/identity-sales-authority-v1.yaml')||before.includes('/identity-sales-temporal-authority-v1.yaml'))
     item=item.replace('shared/v1/identity-sales-authority-v1.schema.json','shared/v2/identity-sales-authority-v2.schema.json');
   }
   return [key,replace(item)];
  }));
 };
 const next=replace(value);
 if(next.$id){next.$id='https://contracts.opencomerix.example/'+after;next.title=next.title.replace(/v[12]/g,after.includes('/v3/')?'v3':'v2');}
 if(next.openapi||next.asyncapi){
  next.info.title=next.info.title.replace(/v[12]/g,after.includes('/v3/')?'v3':'v2');
  next.info.version=after.includes('/v3/')?'3.0.0':'2.0.0';
  next.info.description+=' IANA compatibility successor: named zones with digits such as Etc/GMT+3 are preserved exactly; original routes, authority, bodies and published sources remain unchanged. Source candidate only; publication/full CI and selected admission precede consumer pins.';
 }
 if(before.endsWith('sales.sale.completed.v2.schema.json'))next.allOf[1].properties.event_type.const='sales.sale.completed.v3';
 if(next.asyncapi){
  const message=next.components.messages['sales.sale.completed.v2'];
  message.name='sales.sale.completed.v3';delete next.components.messages['sales.sale.completed.v2'];
  next.components.messages['sales.sale.completed.v3']=message;
 }
 if(before.includes('sales-types-v2')){
  assert.equal(next.$defs.OperatingDate.properties.time_zone.pattern,'^[A-Za-z_]+(?:/[A-Za-z_+-]+)+$');
  next.$defs.OperatingDate.properties.time_zone.pattern=ianaPattern;
  const history=node=>{
   if(Array.isArray(node))return node.map(history);
   if(!node||typeof node!=='object')return node;
   const result=Object.fromEntries(Object.entries(node).map(([key,item])=>[key,history(item)]));
   if(result.const==='sales.sale.completed.v2'){delete result.const;result.enum=['sales.sale.completed.v2','sales.sale.completed.v3'];}
   if(result.properties?.families){result.properties.families.maxItems=2;result.properties.families.uniqueItems=true;}
   return result;
  };
  next.$defs=history(next.$defs);
 }
 return next;
}
const operations=value=>value.asyncapi?Object.keys(value.operations??{}):Object.values(value.paths??{}).flatMap(item=>Object.values(item).filter(op=>op&&typeof op==='object'&&op.operationId).map(op=>op.operationId));
const documents=new Map(ianaSuccessors.map(([before,after])=>[after,encode(successorDocument(before,after))]));
documents.set(ianaFixtures,encode({format_version:1,scope:'Source fixtures only; runtime support must use Intl and actual codec/Identity authority before acceptance. No offset substitution or immutable-body edits.',positive:['Etc/GMT+3','Etc/GMT-14','America/Argentina/Buenos_Aires','Etc/UTC'],negative_shape:['-03:00','UTC','Etc/../GMT3','Etc/GMT 3'],unsupported_named:'Etc/GMT+99'}));
const previous=JSON.parse(source('registry/contracts.json'));
const planned=[...ianaSuccessors.map(([,file,owner])=>({file,owner})),{file:ianaFixtures,owner:'sales-pos'}].map(({file,owner})=>({
 id:file.split('/')[0]+'.f1-14e.iana.'+(file.split('/')[1]==='http'?'http-'+file.split('/')[2]:file.split('/')[1])+'.'+path.posix.basename(file).replace(/\.(?:schema\.json|json|yaml)$/,''),
 domain:file.split('/')[0],owner,materializeIn:'F1-14E-IANA',status:'planned',version:file===ianaFixtures?'1.0.0':file.includes('/v3/')?'3.0.0':'2.0.0',path:file,
 operations:operations(JSON.parse(documents.get(file))),constraint:'IANA digit-zone successor source only; preserve all published bytes, admissions, consumers and pins. Publish, verify full CI and admit the exact source before consumption. Runtime validators and end-to-end codec/authority proof remain required.',
}));
const registry={...previous,planned:[...previous.planned,...planned]};
assert.equal(new Set([...registry.contracts,...registry.planned].map(row=>row.id)).size,registry.contracts.length+registry.planned.length,'IANA_DUPLICATE_ID');
const suffix='\n## F1-14E — Zonas IANA con dígitos (fuente sucesora candidata)\n\n'+
 'Sales types v3 y superficies pública/privada/lecturas v3 aceptan el mismo nombre IANA con dígitos que configura Identity, por ejemplo `Etc/GMT+3`. '+
 'La autoridad Identity schema/HTTP v2 y temporal HTTP v2 vinculan la solicitud completa a esos tipos; las respuestas de autoridad y su lease conservan el contrato anterior. '+
 'No normalizar ni sustituir la zona, el cuerpo ni la clave; `Intl` decide soporte real y el día a la recepción. Offsets libres y nombres no soportados fallan cerrados. '+
 'Completed y AsyncAPI v3 identifican hechos nuevos como sales.sale.completed.v3/schema_version1. Historia v3 admite familias v2/v3 distintas y conserva originales/replay; los nuevos pins no reinterpretan hechos v2. La expansión SQL aditiva y el emisor único requieren su corte Sales autorizado, sin doble emisión ni reescritura. '+
 'Nueve sucesores y fixtures nuevas, diez planned adicionales;235 admisiones,236 artefactos históricos, ocho consumidores y pins existentes intactos. '+
 '[Verificador](../scripts/sales/iana-source-v1.mjs), [negativos](../test/sales/iana-source-v1.test.mjs) y pruebas nativas se ejecutan en los jobs Sales existentes. '+
 'Fuente pendiente de auditoría/publicación/CI completa y admisión seleccionada; pins/runtime Sales e Identity y prueba conectada completa siguen pendientes.\n';
const metadata=new Map([
 ['registry/contracts.json',encode(registry)],
 ...['identity','sales'].map(domain=>[domain+'/index.json',encode(domainIndex(registry,domain))]),
 ...['identity','sales'].map(domain=>[domain+'/README.md',Buffer.from(text(source(domain+'/README.md'))+suffix)]),
]);
let workflow=text(source('.github/workflows/ci.yml'));
const anchor='          node scripts/sales/online-source-v1.mjs openapi';
assert.equal(workflow.split(anchor).length,2,'IANA_WORKFLOW_ANCHOR');
workflow=workflow.replace(anchor,anchor+'\n          node scripts/sales/iana-native-v1.mjs prepare');
const schemaAnchor="      - name: Validate F1-14E source schemas and vectors\n        run: docker run --rm --user \"$(id -u):$(id -g)\" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint /bin/sh -v \"$PWD:/workspace\" -w /workspace ghcr.io/sourcemeta/jsonschema:v16.10.0 -ec 'sh scripts/sales/validate-online-source-v1.sh .ci-artifacts/sales-v2-online-source'";
assert.equal(workflow.split(schemaAnchor).length,2,'IANA_SCHEMA_WORKFLOW_ANCHOR');
workflow=workflow.replace(schemaAnchor,schemaAnchor+"\n      - name: Validate IANA successor schemas and vectors\n        run: docker run --rm --user \"$(id -u):$(id -g)\" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint /bin/sh --mount \"type=bind,source=$PWD,target=/workspace,readonly\" -w /workspace ghcr.io/sourcemeta/jsonschema:v16.10.0 -ec 'sh scripts/sales/validate-iana-v1.sh .ci-artifacts/sales-v2-iana-source-ci'");
metadata.set('.github/workflows/ci.yml',Buffer.from(workflow));
const delta=new Map([...documents,...metadata]);
export const ianaSourceFiles=Object.freeze([...delta.keys()]);
export const ianaScopeFiles=Object.freeze([...new Set([...ianaAdmissionScopeFiles,...ianaSourceFiles])]);
export const ianaSourceDocuments=()=>new Map([...delta].map(([file,bytes])=>[file,Buffer.from(bytes)]));
export function projectIanaFile(file,bytes){bytes=projectIanaAdmissionFile(file,bytes);const expected=metadata.get(file);return expected&&text(bytes)===text(expected)?Buffer.from(source(file)):bytes;}
export function projectIanaDocument(file,value){value=projectIanaAdmissionDocument(file,value);const expected=metadata.get(file);return expected&&file.endsWith('.json')&&isDeepStrictEqual(value,JSON.parse(expected))?JSON.parse(source(file)):value;}
export function validateIanaInput(file,bytes){bytes=projectIanaAdmissionFile(file,bytes);assert(delta.has(file),'IANA_UNKNOWN:'+file);assert.equal(text(bytes),text(delta.get(file)),'IANA_SOURCE_BYTES:'+file);}
export function withIanaScope(paths,read,verify,label='IANA_PARTIAL_SCOPE'){
 return withIanaAdmissionScope(paths,read,(paths,read)=>withIanaSourceScope(paths,read,verify,label),label);
}
function withIanaSourceScope(paths,read,verify,label){
 let active=true;const current=new Map();
 const raw=file=>{assert(active,'IANA_CONTEXT_CLOSED');if(!current.has(file))current.set(file,Buffer.from(read(file)));return Buffer.from(current.get(file));};
 try{
  const bytes=raw('registry/contracts.json');let value;try{value=JSON.parse(bytes);}catch{throw Error(label+':registry/contracts.json');}
  if(![...(value.planned??[]),...(value.contracts??[])].some(row=>row.id?.includes('.f1-14e.iana.'))){
   const result=verify(paths,raw);assert(!result||typeof result.then!=='function','IANA_SYNCHRONOUS');return result;
  }
  assert.deepEqual(value,registry,'IANA_PARTIAL_SCOPE');
  for(const file of ianaSourceFiles)validateIanaInput(file,raw(file));
  const result=verify([...new Set([...paths,...ianaSourceFiles])],file=>projectIanaFile(file,raw(file)));
  assert(!result||typeof result.then!=='function','IANA_SYNCHRONOUS');return result;
 }finally{active=false;current.clear();}
}
export function validateIanaSource(read=native){
 return withIanaAdmissionScope([],read,(_paths,read)=>{
 for(const file of ianaSourceFiles)validateIanaInput(file,read(file));
 const protectedFiles=new Set([...previous.contracts,...previous.preservedFiles].map(row=>row.path));
 for(const owner of previous.requiredConsumers)protectedFiles.add('registry/consumers/'+owner+'.json');
 for(const file of ['package.json','pnpm-lock.yaml','registry/consumers/index.json'])protectedFiles.add(file);
 for(const file of protectedFiles)assert.equal(text(read(file)),text(source(file)),'IANA_PRESERVATION:'+file);
 return {successors:9,planned:10,admitted:0,preservedFiles:protectedFiles.size,runtimeDemonstrated:false};
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,2,'IANA_OPTIONS');console.log(JSON.stringify(validateIanaSource()));
}
