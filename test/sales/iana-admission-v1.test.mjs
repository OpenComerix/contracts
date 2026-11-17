import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {makeLock,resolveSelection} from '../../tools/architecture/graph.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {
 ianaAdmissionRevision,ianaAdmissionSource,ianaAdmissionIds,ianaAdmittedRegistry,ianaAdmissionClosures,
 ianaAdmissionMetadata,ianaAdmissionScopeFiles,ianaAdmissionInputPaths,validateIanaAdmissionInput,
 validateIanaAdmission,projectIanaAdmissionFile,projectIanaAdmissionDocument,withIanaAdmissionScope,
} from '../../scripts/sales/iana-admission-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..'),registryPath='registry/contracts.json';
const read=file=>fs.readFileSync(path.join(root,file)),encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const before=JSON.parse(ianaAdmissionSource(registryPath));
const text=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
const selection=row=>({version:row.version,operations:row.operations,pointers:row.operations.length?[]:['']});

test('eight selected admissions preserve old descriptors, published sources, consumers and Gateway intentions',()=>{
 assert.deepEqual(validateIanaAdmission(),{admitted:8,roots:243,priorRoots:235,planned:4,consumers:8,closureFiles:16,runtimeDemonstrated:false});
 const current=JSON.parse(read(registryPath));assert.deepEqual(current,ianaAdmittedRegistry());
 assert.deepEqual(current.contracts.slice(0,235),before.contracts);assert.deepEqual(current.preservedFiles,before.preservedFiles);
 assert.deepEqual(current.requiredConsumers,before.requiredConsumers);
 assert.deepEqual(current.contracts.slice(235).map(row=>row.id),ianaAdmissionIds);
 assert.deepEqual(current.planned,before.planned.filter(row=>!ianaAdmissionIds.includes(row.id)));
 assert.equal(current.planned.filter(row=>row.owner==='gateway-bff'&&row.materializeIn==='F1-14E-IANA').length,2);
 assert.equal(new Set([...current.contracts,...current.planned].map(row=>row.id)).size,current.contracts.length+current.planned.length);
 for(const file of ['package.json','pnpm-lock.yaml','.github/workflows/ci.yml','registry/consumers/index.json',...before.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json')])assert.equal(text(read(file)),text(ianaAdmissionSource(file)),file);
});

test('all new descriptors and actual locks pin exact operations, hashes, immutable closures and minimal URI mappings',()=>{
 const registry=ianaAdmittedRegistry(),closures=ianaAdmissionClosures();
 for(const row of registry.contracts.slice(235)){
  assert.equal(row.commit,ianaAdmissionRevision);assert.equal(row.tag,null);assert.equal(row.tagObject,null);assert.equal(row.status,'active');
  assert.equal(row.sha256,createHash('sha256').update(ianaAdmissionSource(row.path)).digest('hex'));
  const expected=closures.find(closure=>closure.id===row.id),{id,...closure}=expected;
  assert.deepEqual(resolveSelection(ianaAdmissionSource,row,selection(row),registry),closure);
  const manifest={service:'iana-admission-proof',contracts:[{id:row.id,role:row.operations.length?'producer':'validation',...selection(row)}],assets:[]};
  const lock=makeLock(root,manifest,encode(manifest),registry);assert.equal(lock.entries.length,1);
  assert.equal(lock.entries[0].commit,ianaAdmissionRevision);assert.deepEqual(lock.entries[0].files,closure.files);assert.deepEqual(lock.entries[0].units,closure.units);
  assert.equal(lock.entries[0].selectionSha256,closure.selectionSha256);assert.equal(lock.entries[0].runtimeSha256,closure.runtimeSha256);
  assert.throws(()=>makeLock(root,manifest,encode(manifest),before),/Unknown\/unmaterialized/);
  for(const mapping of row.uriMappings){const changed={...row,uriMappings:row.uriMappings.filter(value=>value!==mapping)};assert.throws(()=>resolveSelection(ianaAdmissionSource,changed,selection(row),registry),/Unmapped external reference/);}
 }
 const flow=registry.contracts.find(row=>row.path.endsWith('sales-flow-v3.asyncapi.yaml'));
 assert.deepEqual(flow.operations,[]);assert(closures.find(row=>row.id===flow.id).units.some(unit=>unit.path===flow.path&&unit.pointer===''));
});

for(const [label,mutate]of [
 ['revision',row=>row.commit='0'.repeat(40)],['hash',row=>row.sha256='0'.repeat(64)],
 ['version',row=>row.version='9.0.0'],['owner',row=>row.owner='gateway-bff'],['status',row=>row.status='draft'],
 ['operation added',row=>row.operations.push('unapproved')],['mapping added',row=>row.uriMappings.push({uri:'https://foreign.example/schema',path:row.path})],
])test('warm scope and pure projections reject changed admission: '+label,()=>{
 const registry=ianaAdmittedRegistry();mutate(registry.contracts[235]);const bytes=encode(registry);
 withIanaAdmissionScope([],read,()=>{});
 assert.throws(()=>validateIanaAdmissionInput(registryPath,bytes),/ADMISSION_BYTES/);
 assert.strictEqual(projectIanaAdmissionFile(registryPath,bytes),bytes);assert.strictEqual(projectIanaAdmissionDocument(registryPath,registry),registry);
 let reached=false;assert.throws(()=>withIanaAdmissionScope([],file=>file===registryPath?bytes:read(file),()=>{reached=true;}),/PARTIAL_SCOPE/);assert.equal(reached,false);
});

test('all protected inputs reject drift and source metadata cannot grant a partial admission',()=>{
 for(const file of ianaAdmissionInputPaths){validateIanaAdmissionInput(file,read(file));assert.throws(()=>validateIanaAdmissionInput(file,Buffer.concat([read(file),Buffer.from('drift')])),/ADMISSION_BYTES/);}
 assert.throws(()=>validateIanaAdmissionInput('unapproved.json',Buffer.from('{}')),/UNKNOWN/);
 for(const mutate of [value=>value.contracts.pop(),value=>value.planned=before.planned,value=>value.contracts[0].purpose='changed',value=>value.requiredConsumers.push('other'),value=>value.preservedFiles.pop()]){
  const value=ianaAdmittedRegistry();mutate(value);assert.throws(()=>withIanaAdmissionScope([],file=>file===registryPath?encode(value):read(file),()=>{}),/PARTIAL_SCOPE/);
 }
});

test('bounded scope reads every delta once and changed or missing bytes cannot inherit approval',()=>{
 for(const count of [1,100]){
  const visits=new Map();withIanaAdmissionScope(['prior'],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
   assert.deepEqual(paths,['prior',...ianaAdmissionScopeFiles]);for(let index=0;index<count;index++)assert.deepEqual(historical(registryPath),ianaAdmissionSource(registryPath));
  });assert.equal(visits.size,ianaAdmissionScopeFiles.length);assert([...visits.values()].every(value=>value===1));
 }
 for(const file of ianaAdmissionScopeFiles)for(const missing of [false,true]){
  let reached=false;assert.throws(()=>withIanaAdmissionScope([],name=>{if(name!==file)return read(name);if(missing)throw Error('missing delta');return Buffer.concat([read(name),Buffer.from('drift')]);},()=>{reached=true;}));assert.equal(reached,false);
 }
});

test('projection is supplied-value-only and returned metadata or closures cannot change expectations',()=>{
 const metadata=ianaAdmissionMetadata(),original=fs.readFileSync;
 fs.readFileSync=()=>{throw Error('unexpected live read');};syncBuiltinESMExports();
 try{for(const [file,bytes]of metadata){
  assert.deepEqual(projectIanaAdmissionFile(file,bytes),ianaAdmissionSource(file));
  const drift=Buffer.concat([bytes,Buffer.from('drift')]);assert.strictEqual(projectIanaAdmissionFile(file,drift),drift);
  if(file.endsWith('.json')){assert.deepEqual(projectIanaAdmissionDocument(file,JSON.parse(bytes)),JSON.parse(ianaAdmissionSource(file)));const wrong={...JSON.parse(bytes),extra:undefined};assert.strictEqual(projectIanaAdmissionDocument(file,wrong),wrong);}
 }}finally{fs.readFileSync=original;syncBuiltinESMExports();}
 metadata.get(registryPath).fill(0);const registry=ianaAdmittedRegistry();registry.contracts.pop();const closures=ianaAdmissionClosures();closures.pop();
 assert.equal(ianaAdmittedRegistry().contracts.length,243);assert.equal(ianaAdmissionClosures().length,8);
});

test('contexts close on success/failure, reject asynchronous approval and leave historical source scope unchanged',()=>{
 let escaped;withIanaAdmissionScope([],read,(_paths,historical)=>{escaped=historical;});assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
 assert.throws(()=>withIanaAdmissionScope([],read,(_paths,historical)=>{escaped=historical;throw Error('callback');}),/callback/);assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
 assert.throws(()=>withIanaAdmissionScope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
 withIanaAdmissionScope(['prior'],ianaAdmissionSource,(paths,historical)=>{assert.deepEqual(paths,['prior']);assert.deepEqual(historical(registryPath),ianaAdmissionSource(registryPath));});
 assert.throws(()=>withIanaAdmissionScope([],file=>file===registryPath?Buffer.from('{broken'):read(file),()=>{},'CALLER_BOUNDARY'),/CALLER_BOUNDARY:registry\/contracts.json/);
});

test('new admission verifier and test are pinned by the existing tooling owner',()=>{
 validateValidationTooling(read);for(const file of ['scripts/sales/iana-admission-v1.mjs','test/sales/iana-admission-v1.test.mjs'])assert.throws(()=>validateValidationTooling(name=>name===file?Buffer.concat([read(name),Buffer.from('drift')]):read(name)),/VALIDATION_TOOLING_DRIFT/);
});
