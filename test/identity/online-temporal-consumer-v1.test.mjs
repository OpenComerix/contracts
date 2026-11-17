import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {projectIanaFile} from '../../scripts/sales/iana-source-v1.mjs';
import {
 onlineTemporalConsumerBase,onlineTemporalProducerRevision,onlineTemporalConsumerPath,
 onlineTemporalConsumerFiles,onlineTemporalConsumerDocuments,onlineTemporalPreservedFiles,
 validateOnlineTemporalSnapshot,validateOnlineTemporalInput,validateOnlineTemporalPreservedInput,
 validateOnlineTemporalConsumer,projectOnlineTemporalFile,projectOnlineTemporalDocument,
 withOnlineTemporalConsumerScope,
} from '../../scripts/identity/online-temporal-consumer-v1.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=file=>projectIanaFile(file,fs.readFileSync(path.join(root,file)));
const source=createGitReader()(root,onlineTemporalConsumerBase);
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected={service:'identity-tenancy',revision:onlineTemporalProducerRevision,previousPins:51,additions:7,selections:58,publication:'published'};

test('published temporal producer adds exactly seven selections, preserving all existing pins and other owners',()=>{
 assert.deepEqual(validateOnlineTemporalConsumer(),{...expected,otherConsumers:7,roots:235,planned:2,preservedArtifacts:236});
 const current=JSON.parse(read(onlineTemporalConsumerPath)),before=JSON.parse(source(onlineTemporalConsumerPath));
 assert.deepEqual(current.manifest.contracts.slice(0,51),before.manifest.contracts);
 assert.deepEqual(current.lock.entries.slice(0,51),before.lock.entries);
 assert.deepEqual(current.manifest.assets,before.manifest.assets);assert.deepEqual(current.manifest.bindings,before.manifest.bindings);
 assert.deepEqual(current.lock.assets,before.lock.assets);
 const publicZone=current.manifest.contracts.find(row=>row.id==='identity.f1-14e.public.identity-branch-time-zone-v1');
 assert.equal(publicZone.role,'documentation');
 assert.equal(current.lock.entries.find(row=>row.id==='identity.f1-14e.private.identity-branch-time-zone-v2').commit,'14a265e024a68887a9a1314c35d29b632258ed97');
});

test('recorded manifest and lock bytes are explicit immutable hashes, not a new HEAD assumption',()=>{
 const current=JSON.parse(read(onlineTemporalConsumerPath));
 assert.equal(current.sourceCommit,onlineTemporalProducerRevision);
 assert.equal(current.manifestSha256,digest(encode(current.manifest)));
 assert.equal(current.lockSha256,digest(encode(current.lock)));
 // A checkout is not required by Contracts CI. When available, verify the
 // actual producer Git objects without importing or altering that repository.
 const owner=path.resolve(root,'../../services/identity-tenancy');
 if(fs.existsSync(path.join(owner,'.git'))){
  for(const [file,field]of [['contracts.manifest.json','manifest'],['contracts.lock.json','lock']]){
   const bytes=execFileSync('git',['-C',owner,'show',onlineTemporalProducerRevision+':'+file]);
   assert.deepEqual(JSON.parse(bytes),current[field]);assert.equal(digest(bytes),current[field+'Sha256']);
  }
 }
});

for(const [label,change]of [
 ['revision',value=>value.sourceCommit='0'.repeat(40)],
 ['owner',value=>value.sourceRepository='opencomerix/foreign'],
 ['lifecycle',value=>value.publication='local-candidate'],
 ['manifest hash',value=>value.manifestSha256='0'.repeat(64)],
 ['lock hash',value=>value.lockSha256='0'.repeat(64)],
 ['previous pin',value=>value.lock.entries[0].commit='0'.repeat(40)],
 ['new pin',value=>value.lock.entries.at(-1).commit='0'.repeat(40)],
 ['role',value=>value.manifest.contracts.at(-1).role='consumer'],
 ['operation',value=>value.manifest.contracts[54].operations.push('unapproved')],
 ['omitted selection',value=>value.manifest.contracts.pop()],
 ['omitted closure',value=>value.lock.entries.at(-1).files.pop()],
 ['omitted unit',value=>value.lock.entries.at(-1).units.pop()],
 ['extra selection',value=>value.manifest.contracts.push(value.manifest.contracts.at(-1))],
 ['binding',value=>value.manifest.bindings.push({unapproved:true})],
 ['unknown field',value=>value.unapproved=true],
])test('changed snapshot is never repaired or admitted: '+label,()=>{
 const value=JSON.parse(read(onlineTemporalConsumerPath));change(value);const bytes=encode(value);
 assert.throws(()=>validateOnlineTemporalSnapshot(bytes),/ONLINE_TEMPORAL_CONSUMER/);
 assert.strictEqual(projectOnlineTemporalFile(onlineTemporalConsumerPath,bytes),bytes);
 assert.strictEqual(projectOnlineTemporalDocument(onlineTemporalConsumerPath,value),value);
 let reached=false;
 assert.throws(()=>withOnlineTemporalConsumerScope([],file=>file===onlineTemporalConsumerPath?bytes:read(file),()=>{reached=true;}));
 assert.equal(reached,false);
});

test('a single closed context reads only three current delta inputs once for 1, 10 and 100 projections',()=>{
 for(const count of [1,10,100]){
  const visits=new Map();
  withOnlineTemporalConsumerScope(['prior'],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
   assert.deepEqual(paths,['prior',...onlineTemporalConsumerFiles]);
   for(let i=0;i<count;i++)for(const file of onlineTemporalConsumerFiles)assert.deepEqual(historical(file),source(file));
  });
  assert.equal(visits.size,3);assert([...visits.values()].every(count=>count===1));
 }
});

test('fresh contexts reject missing/changed and mixed old/new packages after warmup',()=>{
 withOnlineTemporalConsumerScope([],read,()=>true);
 for(const file of onlineTemporalConsumerFiles)for(const mode of ['changed','missing','old']){
  let reached=false;
  assert.throws(()=>withOnlineTemporalConsumerScope([],name=>{
   if(name!==file)return read(name);
   if(mode==='missing')throw Error('synthetic missing input');
   return mode==='old'?source(name):Buffer.concat([read(name),Buffer.from('drift')]);
  },()=>{reached=true;}));assert.equal(reached,false);
 }
 // Exact historical readers remain legitimate; this grants no current export.
 withOnlineTemporalConsumerScope([],source,(_paths,historical)=>assert.deepEqual(historical(onlineTemporalConsumerPath),source(onlineTemporalConsumerPath)));
 assert.throws(()=>validateOnlineTemporalSnapshot(source(onlineTemporalConsumerPath)),/ONLINE_TEMPORAL_CONSUMER/);
 withOnlineTemporalConsumerScope([],read,()=>true);
});

test('pure projections cannot read live files, poison buffers or hide non-JSON additions',()=>{
 const inputs=onlineTemporalConsumerFiles.map(file=>[file,read(file)]),original=fs.readFileSync;
 fs.readFileSync=()=>{throw Error('unexpected live read');};syncBuiltinESMExports();
 try{for(const [file,bytes]of inputs){
  const projected=projectOnlineTemporalFile(file,bytes);assert.deepEqual(projected,source(file));
  assert.strictEqual(projectOnlineTemporalFile(file,projected),projected);
  projected.fill(0);assert.deepEqual(projectOnlineTemporalFile(file,bytes),source(file));
  if(file.endsWith('.json')){
   const value=JSON.parse(bytes);assert.deepEqual(projectOnlineTemporalDocument(file,value),JSON.parse(source(file)));
   for(const mutate of [value=>value.unapproved=undefined,value=>value[Symbol('extra')]=true]){
    const changed=JSON.parse(bytes);mutate(changed);assert.strictEqual(projectOnlineTemporalDocument(file,changed),changed);
   }
  }
 }}finally{fs.readFileSync=original;syncBuiltinESMExports();}
 const docs=onlineTemporalConsumerDocuments();docs.get('identity/README.md').fill(0);
 assert.deepEqual(onlineTemporalConsumerDocuments().get('identity/README.md'),read('identity/README.md'));
 const unknown=Buffer.from('{}');assert.strictEqual(projectOnlineTemporalFile('unapproved.json',unknown),unknown);
 assert.throws(()=>validateOnlineTemporalInput('unapproved.json',unknown),/UNKNOWN_INPUT/);
});

test('per-input preservation negatives do not invoke the complete gate per input',()=>{
 for(const file of onlineTemporalPreservedFiles){
  validateOnlineTemporalPreservedInput(file,read(file));
  assert.throws(()=>validateOnlineTemporalPreservedInput(file,Buffer.concat([read(file),Buffer.from('drift')])),/PRESERVATION/);
 }
 assert.throws(()=>validateOnlineTemporalPreservedInput('unapproved.json',Buffer.from('{}')),/UNKNOWN_PROTECTED/);
});

test('contexts close on success/failure and forbid asynchronous approval',()=>{
 let escaped;withOnlineTemporalConsumerScope([],read,(_paths,historical)=>{escaped=historical;});
 assert.throws(()=>escaped(onlineTemporalConsumerPath),/CONTEXT_CLOSED/);
 assert.throws(()=>withOnlineTemporalConsumerScope([],read,(_paths,historical)=>{escaped=historical;throw Error('callback failure');}),/callback failure/);
 assert.throws(()=>escaped(onlineTemporalConsumerPath),/CONTEXT_CLOSED/);
 assert.throws(()=>withOnlineTemporalConsumerScope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
});

test('the existing tooling gate guards both the new verifier and its tests',()=>{
 validateValidationTooling(read);
 for(const file of ['scripts/identity/online-temporal-consumer-v1.mjs','test/identity/online-temporal-consumer-v1.test.mjs']){
  for(const missing of [false,true])assert.throws(()=>validateValidationTooling(name=>{
   if(name!==file)return read(name);if(missing)throw Error('synthetic missing tooling');return Buffer.concat([read(name),Buffer.from('drift')]);
  }));
 }
});
