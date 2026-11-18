import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {projectIanaFile,projectIanaDocument} from '../sales/iana-source-v1.mjs';

const root=path.resolve(import.meta.dirname,'../..');
export const onlineTemporalConsumerBase='cc897778740b06bb254af21f3dfe9c8a3c89af98';
export const onlineTemporalProducerRevision='ebe6e8e7dffa75f01774fdfff844a85819ee2085';
export const onlineTemporalConsumerPath='registry/consumers/identity-tenancy.json';
export const onlineTemporalConsumerFiles=Object.freeze([onlineTemporalConsumerPath,'identity/README.md','registry/README.md']);
const source=createGitReader()(root,onlineTemporalConsumerBase);
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(text(bytes)).digest('hex');
const native=file=>fs.readFileSync(path.join(root,file));
// Captured from the immutable producer's Git objects after publication and CI.
const published=Object.freeze({
  "snapshot": "fbcc12c4c7b53c2ee18c71bfe79197f88046db6ffdbd74500d255f2b758ebe8e",
  "manifest": "f6510198ed68b3e906108127b73d02522efe7e462b9cf380abc07242bbde33b6",
  "lock": "dbecd51eacb996ca283cada3dcda4c8ef87d45080e589ef55b199d0705f9da3d",
  "selections": [
    [
      "identity.f1-14e.private.identity-sales-temporal-authority-v1",
      "producer",
      [
        "checkSalesTemporalAuthorization"
      ]
    ],
    [
      "identity.f1-14e.shared.identity-sales-temporal-authority-v1.schema",
      "validation",
      []
    ],
    [
      "identity.f1-14e.shared.identity-branch-time-zone-v1.schema",
      "validation",
      []
    ],
    [
      "identity.f1-14e.public.identity-branch-time-zone-v1",
      "documentation",
      [
        "getBranchTimeZone",
        "configureBranchTimeZone"
      ]
    ],
    [
      "identity.f1-14e.private.identity-branch-time-zone-v2",
      "producer",
      [
        "getBranchTimeZone",
        "configureBranchTimeZone"
      ]
    ],
    [
      "identity.f1-14e.shared.identity-branch-time-zone-policy-v1",
      "semantic-owner",
      []
    ],
    [
      "identity.f1-14e.fixtures.responses",
      "validation",
      []
    ]
  ],
  "pins": [
    [
      "identity.f1-14e.private.identity-sales-temporal-authority-v1",
      "producer",
      "5ed0f79a0012b9dd2b8df85977f252ed0da99e78"
    ],
    [
      "identity.f1-14e.shared.identity-sales-temporal-authority-v1.schema",
      "validation",
      "5ed0f79a0012b9dd2b8df85977f252ed0da99e78"
    ],
    [
      "identity.f1-14e.shared.identity-branch-time-zone-v1.schema",
      "validation",
      "5ed0f79a0012b9dd2b8df85977f252ed0da99e78"
    ],
    [
      "identity.f1-14e.public.identity-branch-time-zone-v1",
      "documentation",
      "5ed0f79a0012b9dd2b8df85977f252ed0da99e78"
    ],
    [
      "identity.f1-14e.private.identity-branch-time-zone-v2",
      "producer",
      "14a265e024a68887a9a1314c35d29b632258ed97"
    ],
    [
      "identity.f1-14e.shared.identity-branch-time-zone-policy-v1",
      "semantic-owner",
      "5ed0f79a0012b9dd2b8df85977f252ed0da99e78"
    ],
    [
      "identity.f1-14e.fixtures.responses",
      "validation",
      "5ed0f79a0012b9dd2b8df85977f252ed0da99e78"
    ]
  ]
});
const suffix='\n## F1-14E — Consumo publicado de zona y autoridad temporal Identity\n\n'+
 'El [snapshot Identity](../registry/consumers/identity-tenancy.json) se importa desde `'+onlineTemporalProducerRevision+'`, '+
 'runtime auditado/publicado con [CI completa Passed8/8](https://github.com/OpenComerix/identity-tenancy/actions/runs/44098414078) verificada por SHA/ref dev exactos. '+
 '58 selecciones y pins: 51 anteriores intactos y siete de zona/autoridad temporal; assets/bindings conservados. '+
 'El público de zona v1 se referencia como documentación; el productor privado es v2 y Origin/CSRF pertenece a Gateway. '+
 'No se cambia ninguna fuente funcional, admisión, índice, dependencia o job; los otros siete consumidores permanecen intactos.\n\n'+
 '[Verificador](../scripts/identity/online-temporal-consumer-v1.mjs) y [pruebas](../test/identity/online-temporal-consumer-v1.test.mjs) '+
 'validan el delta exacto antes de proyectarlo a las vistas históricas: un contexto por invocación, sin gates completos por entrada ni aprobación cacheada. '+
 'Publicación y CI completa propias de este export siguen pendientes; no acredita runtime Sales/Gateway/PWA ni cierre E/F.\n';
const base=new Map(onlineTemporalConsumerFiles.map(file=>[file,Buffer.from(source(file))]));
const before=JSON.parse(base.get(onlineTemporalConsumerPath));
const documents=new Map(onlineTemporalConsumerFiles.slice(1).map(file=>[file,Buffer.from(text(base.get(file))+suffix)]));
const expectedHashes=new Map([[onlineTemporalConsumerPath,published.snapshot],...[...documents].map(([file,bytes])=>[file,hash(bytes)])]);

export const onlineTemporalConsumerDocuments=()=>new Map([...documents].map(([file,bytes])=>[file,Buffer.from(bytes)]));

export function validateOnlineTemporalSnapshot(bytes,label='ONLINE_TEMPORAL_CONSUMER'){
 assert.equal(hash(bytes),published.snapshot,label+':SNAPSHOT');
 const value=JSON.parse(text(bytes));
 assert.equal(value.publication,'published',label+':LIFECYCLE');
 assert.equal(value.sourceRepository,'opencomerix/identity-tenancy',label+':OWNER');
 assert.equal(value.sourceCommit,onlineTemporalProducerRevision,label+':REVISION');
 assert.equal(value.manifest.service,'identity-tenancy',label+':SERVICE');
 assert.equal(hash(encode(value.manifest)),published.manifest,label+':MANIFEST');
 assert.equal(value.manifestSha256,published.manifest,label+':MANIFEST_HASH');
 assert.equal(hash(encode(value.lock)),published.lock,label+':LOCK');
 assert.equal(value.lockSha256,published.lock,label+':LOCK_HASH');
 assert.equal(value.lock.manifestSha256,published.manifest,label+':ADMISSION');
 assert.equal(value.manifest.contracts.length,58,label+':SELECTION_COUNT');
 assert.equal(value.lock.entries.length,58,label+':PIN_COUNT');
 assert.deepEqual(value.manifest.contracts.slice(0,51),before.manifest.contracts,label+':PREVIOUS_SELECTIONS');
 assert.deepEqual(value.lock.entries.slice(0,51),before.lock.entries,label+':PREVIOUS_PINS');
 for(const key of ['assets','bindings'])assert.deepEqual(value.manifest[key],before.manifest[key],label+':MANIFEST_'+key);
 assert.deepEqual(value.lock.assets,before.lock.assets,label+':LOCK_ASSETS');
 assert.deepEqual(value.manifest.contracts.slice(51).map(row=>[row.id,row.role,row.operations]),published.selections,label+':SELECTIONS');
 assert.deepEqual(value.lock.entries.slice(51).map(row=>[row.id,row.role,row.commit]),published.pins,label+':PIN_SOURCES');
 return {service:'identity-tenancy',revision:onlineTemporalProducerRevision,previousPins:51,additions:7,selections:58,publication:'published'};
}

export function validateOnlineTemporalInput(file,bytes){
 bytes=projectIanaFile(file,bytes);
 assert(expectedHashes.has(file),'ONLINE_TEMPORAL_UNKNOWN_INPUT:'+file);
 assert.equal(hash(bytes),expectedHashes.get(file),'ONLINE_TEMPORAL_INPUT:'+file);
 if(file===onlineTemporalConsumerPath)validateOnlineTemporalSnapshot(bytes);
}

// These supplied-value projections never read another live file or approve a tree.
export function projectOnlineTemporalFile(file,bytes){
 bytes=projectIanaFile(file,bytes);
 const expected=expectedHashes.get(file);if(!expected)return bytes;
 try{return hash(bytes)===expected?Buffer.from(base.get(file)):bytes;}catch{return bytes;}
}
export function projectOnlineTemporalDocument(file,value){
 value=projectIanaDocument(file,value);
 if(!expectedHashes.has(file)||!file.endsWith('.json'))return value;
 try{
  const bytes=encode(value);
  return isDeepStrictEqual(value,JSON.parse(bytes))&&hash(bytes)===expectedHashes.get(file)?JSON.parse(base.get(file)):value;
 }catch{return value;}
}

// Only this three-file delta is checked here. Preservation belongs to its owner.
// The exact base remains usable by historical readers; mixed packages do not.
export function withOnlineTemporalConsumerScope(paths,read,verify){
 let active=true;const current=new Map();
 const raw=file=>{assert(active,'ONLINE_TEMPORAL_CONTEXT_CLOSED');if(!current.has(file))current.set(file,Buffer.from(read(file)));return Buffer.from(current.get(file));};
 try{
  const snapshot=projectIanaFile(onlineTemporalConsumerPath,raw(onlineTemporalConsumerPath));
  const legacy=hash(snapshot)===hash(base.get(onlineTemporalConsumerPath));
  if(!legacy)validateOnlineTemporalSnapshot(snapshot);
  for(const file of onlineTemporalConsumerFiles){
   const bytes=projectIanaFile(file,raw(file));
   if(legacy)assert.equal(text(bytes),text(base.get(file)),'ONLINE_TEMPORAL_PARTIAL_SCOPE:'+file);
   else assert.equal(hash(bytes),expectedHashes.get(file),'ONLINE_TEMPORAL_INPUT:'+file);
  }
  const result=verify([...new Set([...paths,...onlineTemporalConsumerFiles])],file=>projectOnlineTemporalFile(file,raw(file)));
  assert(!result||typeof result.then!=='function','ONLINE_TEMPORAL_SYNCHRONOUS');return result;
 }finally{active=false;current.clear();}
}

const registry=JSON.parse(source('registry/contracts.json'));
export const onlineTemporalPreservedFiles=Object.freeze([...new Set([
 'registry/contracts.json','registry/consumers/index.json','package.json','pnpm-lock.yaml','.github/workflows/ci.yml',
 ...registry.requiredConsumers.filter(owner=>owner!=='identity-tenancy').map(owner=>'registry/consumers/'+owner+'.json'),
 ...[...registry.contracts,...registry.preservedFiles].map(row=>row.path),
 ...new Set([...registry.contracts,...registry.planned].map(row=>row.domain+'/index.json')),
])]);
const protectedPaths=new Set(onlineTemporalPreservedFiles);
export function validateOnlineTemporalPreservedInput(file,bytes){
 bytes=projectIanaFile(file,bytes);
 assert(protectedPaths.has(file),'ONLINE_TEMPORAL_UNKNOWN_PROTECTED:'+file);
 assert.equal(text(bytes),text(source(file)),'ONLINE_TEMPORAL_PRESERVATION:'+file);
}
export function validateOnlineTemporalConsumer(read=native){
 const result=validateOnlineTemporalSnapshot(projectIanaFile(onlineTemporalConsumerPath,read(onlineTemporalConsumerPath)));
 for(const file of onlineTemporalConsumerFiles.slice(1))validateOnlineTemporalInput(file,read(file));
 // One explicit preservation pass, never nested in a per-file projection/context.
 for(const file of onlineTemporalPreservedFiles)validateOnlineTemporalPreservedInput(file,read(file));
 return {...result,otherConsumers:7,roots:registry.contracts.length,planned:registry.planned.length,preservedArtifacts:registry.preservedFiles.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,2,'ONLINE_TEMPORAL_OPTIONS');console.log(JSON.stringify(validateOnlineTemporalConsumer()));
}
