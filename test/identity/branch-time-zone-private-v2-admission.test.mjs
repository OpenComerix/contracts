import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {makeLock,resolveSelection} from '../../tools/architecture/graph.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {
 privateZoneAdmissionRevision,privateZoneAdmissionSource,privateZoneAdmissionId,
 privateZoneAdmittedRegistry,privateZoneAdmissionClosure,privateZoneAdmissionMetadata,
 privateZoneAdmissionScopeFiles,privateZoneAdmissionInputPaths,validatePrivateZoneAdmissionInput,
 validatePrivateZoneAdmission,projectPrivateZoneAdmissionFile,projectPrivateZoneAdmissionDocument,
 withPrivateZoneAdmissionScope,
} from '../../scripts/identity/branch-time-zone-private-v2-admission.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const text=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
const registryPath='registry/contracts.json';
const before=JSON.parse(privateZoneAdmissionSource(registryPath));
const expected={admitted:1,roots:235,priorRoots:234,planned:2,consumers:8,closureFiles:4,closureUnits:18,runtimeDemonstrated:false};
const selection={version:'2.0.0',operations:['getBranchTimeZone','configureBranchTimeZone'],pointers:[]};

test('one selected admission preserves 234 descriptors, v1, historical artifacts, consumers and unrelated intentions',()=>{
 assert.deepEqual(validatePrivateZoneAdmission(),expected);
 const value=JSON.parse(read(registryPath));assert.deepEqual(value,privateZoneAdmittedRegistry());
 assert.deepEqual(value.contracts.slice(0,234),before.contracts);
 assert.deepEqual(value.preservedFiles,before.preservedFiles);assert.deepEqual(value.requiredConsumers,before.requiredConsumers);
 assert.deepEqual(value.planned,before.planned.filter(row=>row.id!==privateZoneAdmissionId));
 assert.deepEqual(value.contracts.slice(234).map(row=>row.id),[privateZoneAdmissionId]);
 assert.equal(value.contracts.find(row=>row.id==='identity.f1-14e.private.identity-branch-time-zone-v1').status,'active');
 for(const file of ['package.json','pnpm-lock.yaml','.github/workflows/ci.yml','registry/consumers/index.json',
  ...before.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json')])assert.equal(text(read(file)),text(privateZoneAdmissionSource(file)));
});

test('exact immutable source, two operations and four-file closure resolve with zero external URI mappings',()=>{
 const registry=privateZoneAdmittedRegistry(),row=registry.contracts.at(-1),closure=privateZoneAdmissionClosure();
 assert.equal(row.id,privateZoneAdmissionId);assert.equal(row.commit,privateZoneAdmissionRevision);
 assert.equal(row.owner,'identity-tenancy');assert.equal(row.status,'active');assert.equal(row.version,'2.0.0');
 assert.equal(row.tag,null);assert.equal(row.tagObject,null);assert.deepEqual(row.operations,selection.operations);
 assert.deepEqual(row.uriMappings,[]);assert.equal(row.sha256,createHash('sha256').update(privateZoneAdmissionSource(row.path)).digest('hex'));
 assert.deepEqual(resolveSelection(privateZoneAdmissionSource,row,selection,registry),closure);
 for(const role of ['producer','consumer','semantic-owner','validation']){
  const manifest={service:'isolated-private-zone-admission',contracts:[{id:row.id,role,...selection}],assets:[]};
  const lock=makeLock(root,manifest,encode(manifest),registry),entry=lock.entries[0];
  assert.equal(lock.entries.length,1);assert.equal(entry.commit,privateZoneAdmissionRevision);
  assert.deepEqual(entry.files,closure.files);assert.deepEqual(entry.units,closure.units);
  assert.equal(entry.selectionSha256,closure.selectionSha256);assert.equal(entry.runtimeSha256,closure.runtimeSha256);
  assert.throws(()=>makeLock(root,manifest,encode(manifest),before),/Unknown\/unmaterialized/);
 }
});

for(const [label,change]of [
 ['revision',row=>row.commit='0'.repeat(40)],['hash',row=>row.sha256='0'.repeat(64)],
 ['version',row=>row.version='9.0.0'],['owner',row=>row.owner='other'],['status',row=>row.status='draft'],
 ['operation omitted',row=>row.operations.pop()],['operation added',row=>row.operations.push('unapproved')],
 ['mapping added',row=>row.uriMappings.push({uri:'https://foreign.example/schema',path:row.path})],
])test('changed admission cannot project or grant scope after warmup: '+label,()=>{
 const value=privateZoneAdmittedRegistry();change(value.contracts.at(-1));const bytes=encode(value);
 assert.throws(()=>validatePrivateZoneAdmissionInput(registryPath,bytes),/ADMISSION_BYTES/);
 assert.strictEqual(projectPrivateZoneAdmissionFile(registryPath,bytes),bytes);
 assert.strictEqual(projectPrivateZoneAdmissionDocument(registryPath,value),value);
 let reached=false;assert.throws(()=>withPrivateZoneAdmissionScope([],file=>file===registryPath?bytes:read(file),()=>{reached=true;}),/PARTIAL_SCOPE/);
 assert.equal(reached,false);
});

test('all protected inputs reject drift directly, without a full admission gate per file',()=>{
 for(const file of privateZoneAdmissionInputPaths){
  validatePrivateZoneAdmissionInput(file,read(file));
  assert.throws(()=>validatePrivateZoneAdmissionInput(file,Buffer.concat([read(file),Buffer.from('drift')])),/ADMISSION_BYTES/);
 }
 assert.throws(()=>validatePrivateZoneAdmissionInput('unapproved.json',Buffer.from('{}')),/UNKNOWN_INPUT/);
 for(const mutate of [value=>value.contracts.pop(),value=>value.planned=before.planned,value=>value.contracts[0].purpose='unreviewed',
  value=>value.requiredConsumers.push('unapproved'),value=>value.preservedFiles.pop()]){
  const value=privateZoneAdmittedRegistry();mutate(value);
  assert.throws(()=>validatePrivateZoneAdmissionInput(registryPath,encode(value)),/ADMISSION_BYTES/);
 }
});

test('one bounded context reads each current delta input once and rechecks changed or missing bytes',()=>{
 for(const count of [1,10,100]){
  const visits=new Map();withPrivateZoneAdmissionScope(['prior'],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
   assert.deepEqual(paths,['prior',...privateZoneAdmissionScopeFiles]);
   for(let i=0;i<count;i++)assert.deepEqual(historical(registryPath),privateZoneAdmissionSource(registryPath));
  });assert.equal(visits.size,8);assert([...visits.values()].every(n=>n===1));
 }
 for(const file of privateZoneAdmissionScopeFiles)for(const missing of [false,true]){
  let reached=false;assert.throws(()=>withPrivateZoneAdmissionScope([],name=>{
   if(name!==file)return read(name);if(missing)throw Error('synthetic missing delta');return Buffer.concat([read(name),Buffer.from('drift')]);
  },()=>{reached=true;}));assert.equal(reached,false);
 }
});

test('pure projections do not read live inputs or expose mutable expectations',()=>{
 const metadata=privateZoneAdmissionMetadata(),original=fs.readFileSync;
 fs.readFileSync=()=>{throw Error('unexpected live read');};syncBuiltinESMExports();
 try{for(const [file,bytes]of metadata){
  assert.deepEqual(projectPrivateZoneAdmissionFile(file,bytes),privateZoneAdmissionSource(file));
  const drift=Buffer.concat([bytes,Buffer.from('drift')]);assert.strictEqual(projectPrivateZoneAdmissionFile(file,drift),drift);
  if(file.endsWith('.json')){
   assert.deepEqual(projectPrivateZoneAdmissionDocument(file,JSON.parse(bytes)),JSON.parse(privateZoneAdmissionSource(file)));
   const drift={...JSON.parse(bytes),unexpected:undefined};assert.strictEqual(projectPrivateZoneAdmissionDocument(file,drift),drift);
  }
 }}finally{fs.readFileSync=original;syncBuiltinESMExports();}
 metadata.get(registryPath).fill(0);const value=privateZoneAdmittedRegistry();value.contracts.pop();
 const closure=privateZoneAdmissionClosure();closure.files.pop();
 assert.equal(privateZoneAdmittedRegistry().contracts.length,235);assert.equal(privateZoneAdmissionClosure().files.length,4);
 const unknown=Buffer.from('{}');assert.strictEqual(projectPrivateZoneAdmissionFile('unapproved.json',unknown),unknown);
});

test('contexts close after success or failure and the pre-admission registry grants no added scope',()=>{
 let escaped;withPrivateZoneAdmissionScope([],read,(_paths,historical)=>{escaped=historical;});
 assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
 assert.throws(()=>withPrivateZoneAdmissionScope([],read,(_paths,historical)=>{escaped=historical;throw Error('callback failure');}),/callback failure/);
 assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
 assert.throws(()=>withPrivateZoneAdmissionScope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
 withPrivateZoneAdmissionScope(['prior'],privateZoneAdmissionSource,(paths,historical)=>{
  assert.deepEqual(paths,['prior']);assert.deepEqual(historical(registryPath),privateZoneAdmissionSource(registryPath));
 });
});

test('tooling review includes the new verifier and tests and rejects changed bytes',()=>{
 validateValidationTooling(read);
 for(const file of ['scripts/identity/branch-time-zone-private-v2-admission.mjs','test/identity/branch-time-zone-private-v2-admission.test.mjs'])
  assert.throws(()=>validateValidationTooling(name=>name===file?Buffer.concat([read(name),Buffer.from('drift')]):read(name)),/VALIDATION_TOOLING_DRIFT/);
});
