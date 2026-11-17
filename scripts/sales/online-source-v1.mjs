import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {resolveSchema} from './schema-v2.mjs';
import {onlineAdmissionScopeFiles,projectOnlineAdmissionFile,projectOnlineAdmissionDocument,withOnlineAdmissionScope} from './online-admission-v1.mjs';

export const root=path.resolve(import.meta.dirname,'../..');
export const base='9a24c38ca1088893c1f5bc890f6342c625d931d3';
const original=createGitReader()(root,base);
const text=b=>new TextDecoder('utf-8',{fatal:true}).decode(b).replaceAll('\r\n','\n');
const hash=b=>createHash('sha256').update(text(b)).digest('hex');
const native=f=>fs.readFileSync(path.join(root,f));
const json=(f,read=native)=>JSON.parse(read(f));
// Current-source proof, not an admission or a remembered successful gate.
export const sourceHashes=Object.freeze({
  "identity/http/shared/v1/identity-branch-time-zone-v1.schema.json": "470e1168751c4cf4426b7fa0111a8f5efad5ad6c81ae924436de6cfbaffd1dfd",
  "identity/http/public/v1/identity-branch-time-zone-v1.yaml": "dd7575210c2740a99d40faf4d8f77c1389be5b37e81b0abad078f5214cddfeaf",
  "identity/http/private/v1/identity-branch-time-zone-v1.yaml": "55882e45f7e5db8315302cc31382797cfd021c74953226bb645f09f49c48842c",
  "identity/http/shared/v1/identity-branch-time-zone-policy-v1.json": "77037e9256e2b19d8de3d1d12a486f790fd47611bc7cae93546e68caa0a1be4e",
  "identity/fixtures/branch-time-zone/v1/responses.json": "c7733184b627295d7c75d1bab08d8b8214eedec87a14d265c984a327e8a41736",
  "identity/http/shared/v1/identity-sales-temporal-authority-v1.schema.json": "87222f8e1b7df115a66b789d226360e362e566de0f22e93feb8a7c8cf2b202b1",
  "identity/http/private/v1/identity-sales-temporal-authority-v1.yaml": "b45609d377fc2efa1e539b4c4628e1f1702c16011216fe56d638892cfbc4623d",
  "sales/http/public/v2/sales-browser-reads-v2.yaml": "7d7d92b0362ca8ce9aafb2363628cb50fd71a8110c1f5e5e4ce7d6f8eb1be34c",
  "sales/http/shared/v1/sales-operating-date-policy-v1.json": "ce531c4c9baef98d5c66f3f18a86770ed390c9a72a265905a3673035a7a22a97",
  "sales/fixtures/operating-date/v1/cases.json": "7242204efbeb60d3713c0cb9abf246918b3a69c4f0427a3fb7b0407bcc512d11",
  "registry/contracts.json": "f1fe0262a8c4cf28d3592f9be3ad8ad0e02d901dcc2483f863571f529f035525",
  "identity/index.json": "2d84a25aa53799e991760949bd915aab59468f829ac7f8d32e904662c446788f",
  "sales/index.json": "130fb8e3e04b6c6ec84f759f6c281a053687e2427ef38f130ff55916069a6c10",
  "identity/README.md": "ffd8d164f185fbdcd6600afb9f86117430c08b5cb8fe74347f1d2b5938e7f9e4",
  "sales/README.md": "d69fc6d5bd965dc800feaeb13312d157540b2556852853680e249e0e1f97f5ad",
  ".github/workflows/ci.yml": "57bed0d251dbef981a87ba6028362caf618694367874787ed1a44779d3b86bfa"
});
export const metadataFiles=Object.freeze(['registry/contracts.json','identity/index.json','sales/index.json','identity/README.md','sales/README.md','.github/workflows/ci.yml']);
export const sourceFiles=Object.freeze(Object.keys(sourceHashes));
export const onlineScopeFiles=Object.freeze([...new Set([...onlineAdmissionScopeFiles,...sourceFiles])]);
export const openapis=Object.freeze([
 'sales/http/public/v2/sales-browser-reads-v2.yaml',
 'identity/http/public/v1/identity-branch-time-zone-v1.yaml',
 'identity/http/private/v1/identity-branch-time-zone-v1.yaml',
 'identity/http/private/v1/identity-sales-temporal-authority-v1.yaml',
]);
const registryPath='registry/contracts.json';
const previousRegistry=json(registryPath,original);
export function validateSourceInput(file,bytes){
 bytes=projectOnlineAdmissionFile(file,bytes);
 assert(Object.hasOwn(sourceHashes,file),'ONLINE_SOURCE_UNKNOWN:'+file);
 assert.equal(hash(bytes),sourceHashes[file],'ONLINE_SOURCE_BYTES:'+file);
}
// Pure single-value transforms. No live reads, nested gates or global approval cache.
export function projectOnlineFile(file,bytes){
 bytes=projectOnlineAdmissionFile(file,bytes);
 if(!metadataFiles.includes(file))return bytes;
 try{return hash(bytes)===sourceHashes[file]?original(file):bytes;}catch{return bytes;}
}
export function projectOnlineDocument(file,value){
 value=projectOnlineAdmissionDocument(file,value);
 if(!metadataFiles.includes(file)||!file.endsWith('.json'))return value;
 try{const encoded=JSON.stringify(value,null,2)+'\n';return isDeepStrictEqual(value,JSON.parse(encoded))&&hash(Buffer.from(encoded))===sourceHashes[file]?json(file,original):value;}catch{return value;}
}
export function validateSource(read=native){
 for(const file of sourceFiles)validateSourceInput(file,read(file));
 const registry=JSON.parse(projectOnlineAdmissionFile(registryPath,read(registryPath)));
 assert.deepEqual(registry.contracts,previousRegistry.contracts,'ONLINE_SOURCE_ADMISSION_CHANGED');
 assert.deepEqual(registry.preservedFiles,previousRegistry.preservedFiles);
 assert.deepEqual(registry.planned.slice(0,previousRegistry.planned.length),previousRegistry.planned);
 assert.equal(registry.planned.length-previousRegistry.planned.length,10);
 return {planned:10,admitted:0,openapis:4,runtimeDemonstrated:false};
}
export function validatePreservation(read=native){
 const paths=new Set([...previousRegistry.contracts,...previousRegistry.preservedFiles].map(row=>row.path));
 for(const row of previousRegistry.requiredConsumers)paths.add('registry/consumers/'+row+'.json');
 for(const file of ['registry/consumers/index.json','package.json','pnpm-lock.yaml'])paths.add(file);
 for(const file of paths)assert.equal(text(projectOnlineFile(file,read(file))),text(original(file)),'ONLINE_SOURCE_PRESERVATION:'+file);
 return {files:paths.size,consumerMigrations:0};
}
// Older callers receive historical metadata plus the complete proved source
// inventory. No unverified new path is exempted from their preservation guards.
export function withOnlineSourceScope(paths,read,verify,label='ONLINE_SOURCE_BYTES'){
 return withOnlineAdmissionScope(paths,read,(paths,read)=>withSourceScope(paths,read,verify,label),label);
}
function withSourceScope(paths,read,verify,label){
 let active=true;const current=new Map();
 const raw=file=>{assert(active,'ONLINE_SOURCE_CONTEXT_CLOSED');if(!current.has(file))current.set(file,Buffer.from(read(file)));return Buffer.from(current.get(file));};
 try{
  const bytes=raw(registryPath);let value;try{value=JSON.parse(bytes);}catch{throw Error(label+':'+registryPath);}
  if(hash(bytes)!==sourceHashes[registryPath]){
   assert(![...(value.planned??[]),...(value.contracts??[])].some(row=>row.materializeIn==='F1-14E'||row.id.includes('.f1-14e.')),'ONLINE_SOURCE_PARTIAL_SCOPE');
   const result=verify(paths,raw);assert(!result||typeof result.then!=='function','ONLINE_SOURCE_SYNCHRONOUS');return result;
  }
  validateSource(raw);
  const result=verify([...new Set([...paths,...sourceFiles])],file=>projectOnlineFile(file,raw(file)));
  assert(!result||typeof result.then!=='function','ONLINE_SOURCE_SYNCHRONOUS');return result;
 }finally{active=false;current.clear();}
}
// Fixture oracle only: this code grants no authority and is not runtime Sales.
export function operatingDate(instant,timeZone){
 assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(instant)&&Number.isFinite(Date.parse(instant))&&new Date(instant).toISOString().slice(0,19)===instant.slice(0,19),'ONLINE_DATE_INSTANT');
 assert(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(timeZone),'ONLINE_DATE_ZONE');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
 const value=t=>parts.find(p=>p.type===t).value;
 return {business_date:value('year')+'-'+value('month')+'-'+value('day'),time_zone:timeZone,date_policy_version:'sales-branch-local-day-v1'};
}
export function verifyTemporalBinding(envelope,context){
 assert.equal(envelope.authorization.organization_id,context.organization_id,'ONLINE_TEMPORAL_AUTHORITY_TENANT');
 const source=envelope.branch_time_zone;
 if(source===null)return;
 assert.equal(envelope.authorization.operation_id,'finalizeOnlineSale','ONLINE_TEMPORAL_OPERATION');
 assert.equal(source.organization_id,context.organization_id,'ONLINE_TEMPORAL_SOURCE_TENANT');
 assert.equal(source.branch_id,context.branch_id,'ONLINE_TEMPORAL_SOURCE_BRANCH');
 assert(envelope.authorization.scope.branch_ids.includes(source.branch_id),'ONLINE_TEMPORAL_SCOPE');
 assert(Number.isSafeInteger(source.version)&&source.version>0,'ONLINE_TEMPORAL_VERSION');
 operatingDate(envelope.authorization.checked_at,source.time_zone);
}
const output='.ci-artifacts/sales-v2-online-source';
const nativeRun='run-'+randomUUID();
function write(file,value){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');}
function execute(command,args,name,shell=false){
 const result=spawnSync(command,args,{cwd:root,encoding:'utf8',shell,windowsHide:true,maxBuffer:32*1024*1024,env:{...process.env,REDOCLY_TELEMETRY:'off',REDOCLY_SUPPRESS_UPDATE_NOTICE:'true'}});
 write(output+'/'+nativeRun+'/'+name+'.log',JSON.stringify({status:result.status,error:result.error?.message,stdout:result.stdout,stderr:result.stderr})+'\n');
 if(result.error||result.status!==0){process.stderr.write(result.stderr??'');process.stdout.write(result.stdout??'');throw Error('ONLINE_NATIVE_GATE:'+name+':'+result.status);}
 return result.stdout;
}
export function prepareSchemas(){
 const options=json('identity/fixtures/branch-time-zone/v1/responses.json');
 const zoneBundle=json(openapis[1]);
 const temporalBundle=json(openapis[3]);
 const route=zoneBundle.paths['/tenancy/branches/{branch_id}/time-zone'];
 const references={
  zone:route.get.responses['200'].content['application/json']['x-producer-schema'],
  reader:route.get.responses['200'].content['application/json'].schema,
  configure:route.put.requestBody.content['application/json'].schema,
  temporal:temporalBundle.paths['/internal/identity/sales-temporal-authorizations'].post.responses['200'].content['application/json']['x-producer-schema'],
  temporalReader:temporalBundle.paths['/internal/identity/sales-temporal-authorizations'].post.responses['200'].content['application/json'].schema,
 };
 // Redocly intentionally does not dereference x-producer-schema extensions.
 // Reuse the owner resolver once per distinct schema, never once per fixture.
 const definitions=Object.fromEntries(Object.entries(references).map(([key,value])=>{
  const [file,pointer]=value.$ref.split('#'),owner=key.startsWith('temporal')?openapis[3]:openapis[1];
  return [key,resolveSchema(path.posix.normalize(path.posix.join(path.posix.dirname(owner),file)),pointer)];
 }));
 const cases=[];
 const add=(id,key,value,valid)=>{write(output+'/'+id+'.json',value);cases.push([id,valid?'accept':'reject','schema-'+key+'.json',id+'.json']);};
 for(const [key,value] of Object.entries(definitions))write(output+'/schema-'+key+'.json',{$schema:'https://json-schema.org/draft/2020-12/schema',...value});
 add('zone-unconfigured','zone',options.absent,true);add('zone-configured','zone',options.configured,true);
 add('zone-reader-extra','reader',{...options.configured,optional_metadata:'ignored'},true);
 add('zone-producer-extra','zone',{...options.configured,undeclared:true},false);
 for(const key of ['organization_id','branch_id','version','configuration','checked_at']){const value=structuredClone(options.configured);delete value[key];add('zone-missing-'+key,'reader',value,false);}
 const input={expected_version:1,time_zone:'America/Argentina/Buenos_Aires'};
 add('configure-valid','configure',input,true);
 for(const [id,change] of [['version-zero',{expected_version:0}],['version-fraction',{expected_version:1.5}],['offset',{time_zone:'-03:00'}],['free-field',{organization_id:options.configured.organization_id}],['empty',{time_zone:''}]])add('configure-'+id,'configure',{...input,...change},false);
 const human=json('identity/fixtures/sales-authority/v1/human.json');
 for(const [i,row]of human.entries()){
  const auth=structuredClone(row.decision),context=row.request.request?.body?.context??row.request.body?.context;
  const envelope={authorization:auth,branch_time_zone:auth.operation_id==='finalizeOnlineSale'?{organization_id:context.organization_id,branch_id:context.branch_id,version:2,time_zone:input.time_zone}:null};
  add('temporal-'+i,'temporal',envelope,true);
  add('temporal-reader-'+i,'temporalReader',{...envelope,optional_metadata:'ignored'},true);
  add('temporal-producer-extra-'+i,'temporal',{...envelope,undeclared:true},false);
  if(auth.operation_id==='finalizeOnlineSale'){
   add('temporal-unconfigured','temporal',{...envelope,branch_time_zone:null},true);
   for(const key of ['organization_id','branch_id','version','time_zone']){const v=structuredClone(envelope);delete v.branch_time_zone[key];add('temporal-source-missing-'+key,'temporalReader',v,false);}
   const invalid=structuredClone(envelope);delete invalid.authorization.request_hash;add('temporal-unbound','temporal',invalid,false);
  }else add('temporal-nonfinalize-zone-'+i,'temporal',{...envelope,branch_time_zone:{organization_id:options.configured.organization_id,branch_id:options.configured.branch_id,version:1,time_zone:input.time_zone}},false);
 }
 write(output+'/schemas.txt',Object.keys(definitions).map(key=>'schema-'+key+'.json').join('\n')+'\n');
 write(output+'/cases.tsv',cases.map(row=>row.join('\t')).join('\n')+'\n');
 const counts={schemas:Object.keys(definitions).length,accepted:cases.filter(r=>r[1]==='accept').length,rejected:cases.filter(r=>r[1]==='reject').length};
 write(output+'/counts.json',counts);return counts;
}
function runOpenapi(offline){
 const npx=process.platform==='win32'?'npx.cmd':'npx';
 for(const [index,file]of openapis.entries()){
  const args=[...(offline?['--offline']:[]),'--yes','@redocly/cli@2.53.3'];
  const out=execute(npx,[...args,'lint',file,'--format','json'],'openapi-'+index+'-lint',process.platform==='win32');
  const start=out.indexOf('{\n  "totals"'),end=out.indexOf('\n}',start);assert(start>=0&&end>start,'ONLINE_REDOD_REPORT');
  const report=JSON.parse(out.slice(start,end+2));if(report.totals.errors||report.totals.warnings)process.stderr.write(JSON.stringify(report)+'\n');assert.equal(report.version,'2.53.3');assert.equal(report.totals.errors,0);assert.equal(report.totals.warnings,0);
  execute(npx,[...args,'bundle',file,'--dereferenced','--ext','json','--output',output+'/openapi-'+index+'.bundle.json'],'openapi-'+index+'-bundle',process.platform==='win32');
 }
 return {openapis:openapis.length,...prepareSchemas(),runtimeDemonstrated:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,...options]=process.argv.slice(2);assert(['verify','openapi','prepare','schema'].includes(mode),'ONLINE_SOURCE_MODE');assert(options.length<=1&&options.every(v=>v==='--offline')&&(mode==='openapi'||options.length===0),'ONLINE_SOURCE_OPTIONS');
 if(mode==='verify')console.log(JSON.stringify({...validateSource(),...validatePreservation()}));
 else if(mode==='openapi')console.log(JSON.stringify(runOpenapi(options.includes('--offline'))));
 else if(mode==='prepare')console.log(JSON.stringify(prepareSchemas()));
 else{
  const counts=json(output+'/counts.json');
  const out=execute('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',`type=bind,source=${root},target=/workspace`,'--workdir','/workspace','--entrypoint','sh','ghcr.io/sourcemeta/jsonschema:v16.10.0','scripts/sales/validate-online-source-v1.sh',output],'sourcemeta');
  assert(out.includes(`schemas=${counts.schemas} accepted=${counts.accepted} invalid_rejected=${counts.rejected}`),'ONLINE_SCHEMA_COUNTS');
  console.log(JSON.stringify({...counts,validator:'Sourcemeta 16.10.0',runtimeDemonstrated:false}));
 }
}
