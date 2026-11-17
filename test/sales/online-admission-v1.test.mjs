import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {makeLock,resolveSelection} from '../../tools/architecture/graph.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {withOnlineSourceScope,onlineScopeFiles,validateSource} from '../../scripts/sales/online-source-v1.mjs';
import {projectPrivateZoneFile} from '../../scripts/identity/branch-time-zone-private-v2.mjs';
import {
 onlineAdmissionRevision,onlineAdmissionSource,onlineAdmissionIds,onlineAdmittedRegistry,
 onlineAdmissionClosures,onlineAdmissionMetadata,onlineAdmissionScopeFiles,onlineAdmissionInputPaths,
 validateOnlineAdmissionInput,validateOnlineAdmission,projectOnlineAdmissionFile,
 projectOnlineAdmissionDocument,withOnlineAdmissionScope,
} from '../../scripts/sales/online-admission-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file));
const registryPath='registry/contracts.json';
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const text=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
const before=JSON.parse(onlineAdmissionSource(registryPath));
const expected={admitted:10,roots:234,priorRoots:224,planned:2,consumers:8,closureFiles:16,runtimeDemonstrated:false};
const select=row=>({version:row.version,operations:row.operations,pointers:row.operations.length?[]:['']});

test('ten selected admissions preserve every previous descriptor, consumer and unrelated intention',()=>{
 assert.deepEqual(validateOnlineAdmission(),expected);
 const value=JSON.parse(projectPrivateZoneFile(registryPath,read(registryPath)));assert.deepEqual(value,onlineAdmittedRegistry());
 assert.deepEqual(value.contracts.slice(0,224),before.contracts);
 assert.deepEqual(value.preservedFiles,before.preservedFiles);assert.deepEqual(value.requiredConsumers,before.requiredConsumers);
 assert.deepEqual(value.planned,before.planned.filter(row=>!onlineAdmissionIds.includes(row.id)));
 assert.deepEqual(value.contracts.slice(224).map(row=>row.id),onlineAdmissionIds);
 for(const file of ['registry/consumers/index.json',...before.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json'),
  'package.json','pnpm-lock.yaml','.github/workflows/ci.yml'])assert.equal(text(projectPrivateZoneFile(file,read(file))),text(onlineAdmissionSource(file)),file);
 assert.deepEqual(validateSource(),{planned:10,admitted:0,openapis:4,runtimeDemonstrated:false},'source gate retains its published view');
});

test('immutable roots and minimal closures resolve for all four admitted functional or validation roles',()=>{
 const registry=onlineAdmittedRegistry(),closures=new Map(onlineAdmissionClosures().map(row=>[row.id,row]));
 for(const row of registry.contracts.slice(224)){
  assert.equal(row.status,'active');assert.equal(row.commit,onlineAdmissionRevision);assert.equal(row.tag,null);assert.equal(row.tagObject,null);
  const intention=before.planned.find(value=>value.id===row.id);assert.equal(row.owner,intention.owner);assert.equal(row.version,intention.version);
  assert.deepEqual(row.operations,intention.operations??[]);
  assert.equal(row.sha256,createHash('sha256').update(onlineAdmissionSource(row.path)).digest('hex'));
  const closure=resolveSelection(onlineAdmissionSource,row,select(row),registry),{id,...saved}=closures.get(row.id);
  assert.equal(id,row.id);assert.deepEqual(closure,saved);
  assert.equal(closure.files.find(file=>file.path===row.path).sha256,row.sha256);
  for(const mapping of row.uriMappings){
   const trimmed={...row,uriMappings:row.uriMappings.filter(value=>value!==mapping)};
   assert.throws(()=>resolveSelection(onlineAdmissionSource,trimmed,select(row),registry),/Unmapped external reference/);
  }
  for(const role of ['consumer','producer','semantic-owner','validation']){
   const manifest={service:'isolated-online-admission',contracts:[{id:row.id,role,...select(row)}],assets:[]};
   const lock=makeLock(root,manifest,encode(manifest),registry);
   assert.equal(lock.entries.length,1);assert.equal(lock.entries[0].commit,onlineAdmissionRevision);
   assert.deepEqual(lock.entries[0].files,closure.files);assert.deepEqual(lock.entries[0].units,closure.units);
   assert.throws(()=>makeLock(root,manifest,encode(manifest),before),/Unknown\/unmaterialized/);
  }
 }
});

for(const [label,change]of [
 ['revision',row=>row.commit='0'.repeat(40)],['hash',row=>row.sha256='0'.repeat(64)],
 ['version',row=>row.version='9.0.0'],['owner',row=>row.owner='other'],['status',row=>row.status='draft'],
 ['operation omitted',row=>row.operations.pop()],['operation added',row=>row.operations.push('unapproved')],
 ['mapping changed',row=>row.uriMappings.push({uri:'https://foreign.example/schema',path:row.path})],
])test('changed admission never projects or authorizes its scope: '+label,()=>{
 const value=onlineAdmittedRegistry(),row=value.contracts.find(row=>row.id===onlineAdmissionIds[1]);change(row);
 const bytes=encode(value);assert.throws(()=>validateOnlineAdmissionInput(registryPath,bytes),/ONLINE_ADMISSION_BYTES/);
 assert.strictEqual(projectOnlineAdmissionFile(registryPath,bytes),bytes);
 assert.strictEqual(projectOnlineAdmissionDocument(registryPath,value),value);
 let reached=false;assert.throws(()=>withOnlineSourceScope([],file=>file===registryPath?bytes:read(file),()=>{reached=true;}),/PARTIAL_SCOPE/);
 assert.equal(reached,false);
});

test('partial admission, omissions and unrelated changes fail the exact admission gate',()=>{
 for(const mutate of [value=>value.contracts.pop(),value=>value.contracts.splice(224),value=>value.planned=before.planned,
  value=>value.contracts[0].purpose='unreviewed',value=>value.planned.shift(),value=>value.requiredConsumers.push('unapproved'),
  value=>value.preservedFiles.pop()]){
  const value=onlineAdmittedRegistry();mutate(value);
  assert.throws(()=>validateOnlineAdmission(file=>file===registryPath?encode(value):read(file)),/ONLINE_ADMISSION_BYTES/);
 }
});

test('each protected input rejects alteration or omission without a full admission gate per input',()=>{
 validateOnlineAdmission();
 for(const file of onlineAdmissionInputPaths){
  validateOnlineAdmissionInput(file,read(file));
  assert.throws(()=>validateOnlineAdmissionInput(file,Buffer.concat([read(file),Buffer.from('drift')])),/ONLINE_ADMISSION_BYTES/);
 }
 assert.throws(()=>validateOnlineAdmissionInput('unapproved.json',Buffer.from('{}')),/UNKNOWN_INPUT/);
 const dependency='catalog/http/shared/v1/catalog-sale-capture-v1.schema.json';
 assert.throws(()=>validateOnlineAdmission(file=>{if(file===dependency)throw Error('missing closure');return read(file);}),/missing closure/);
 assert.throws(()=>validateOnlineAdmission(file=>file===dependency?Buffer.from('{}'):read(file)),/ONLINE_ADMISSION_BYTES/);
 assert.deepEqual(validateOnlineAdmission(),expected);
});

test('one context reads every current input once for 1, 10 and 100 projections, never caching approval',()=>{
 for(const count of [1,10,100]){
  const visits=new Map();
  withOnlineSourceScope(['kept'],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
   assert.deepEqual(paths,['kept',...onlineScopeFiles]);assert(!paths.includes('unapproved.json'));
   for(let i=0;i<count;i++)assert.equal(JSON.parse(historical(registryPath)).contracts.length,224);
  });
  assert.equal(visits.size,onlineScopeFiles.length);assert([...visits.values()].every(value=>value===1));
 }
 for(const file of onlineAdmissionScopeFiles)for(const missing of [false,true]){
  let reached=false;
  assert.throws(()=>withOnlineSourceScope([],name=>{
   if(name!==file)return read(name);if(missing)throw Error('missing delta');return Buffer.concat([read(name),Buffer.from('drift')]);
  },()=>{reached=true;}));assert.equal(reached,false);
 }
 assert.deepEqual(validateOnlineAdmission(),expected);
});

test('pure projections use only exact supplied values, clone results and never read live files',()=>{
 const metadata=onlineAdmissionMetadata(),original=fs.readFileSync;
 fs.readFileSync=()=>{throw Error('unexpected live read');};syncBuiltinESMExports();
 try{for(const [file,bytes]of metadata){
  assert.equal(text(projectOnlineAdmissionFile(file,bytes)),text(onlineAdmissionSource(file)));
  const drift=Buffer.concat([bytes,Buffer.from('drift')]);assert.strictEqual(projectOnlineAdmissionFile(file,drift),drift);
  if(file.endsWith('.json')){
   const value=JSON.parse(bytes);assert.deepEqual(projectOnlineAdmissionDocument(file,value),JSON.parse(onlineAdmissionSource(file)));
   value.extra=undefined;assert.strictEqual(projectOnlineAdmissionDocument(file,value),value);
  }
 }}finally{fs.readFileSync=original;syncBuiltinESMExports();}
 metadata.get(registryPath).fill(0);const value=onlineAdmittedRegistry();value.contracts.pop();
 const closures=onlineAdmissionClosures();closures[0].files.pop();
 assert.equal(onlineAdmittedRegistry().contracts.length,234);assert(onlineAdmissionClosures()[0].files.length>0);
 assert.strictEqual(projectOnlineAdmissionFile('unapproved.json',Buffer.from('{}')).toString(),'{}');
 assert.deepEqual(validateOnlineAdmission(),expected);
});

test('contexts close escaped readers, reject deferred verification and preserve pre-admission scope',()=>{
 for(const scope of [withOnlineAdmissionScope,withOnlineSourceScope]){
  let escaped;scope([],read,(_paths,historical)=>{escaped=historical;});assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
  assert.throws(()=>scope([],read,(_paths,historical)=>{escaped=historical;throw Error('callback failure');}),/callback failure/);
  assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);assert.throws(()=>scope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
 }
 withOnlineAdmissionScope(['kept'],onlineAdmissionSource,(paths,historical)=>{
  assert.deepEqual(paths,['kept']);assert.equal(text(historical(registryPath)),text(onlineAdmissionSource(registryPath)));
 });
 validateValidationTooling(read);
 for(const file of ['scripts/sales/online-admission-v1.mjs','test/sales/online-admission-v1.test.mjs'])
  assert.throws(()=>validateValidationTooling(name=>name===file?Buffer.concat([read(name),Buffer.from('drift')]):read(name)),/VALIDATION_TOOLING_DRIFT/);
});
