import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {
  preparationConsumersBase,preparationConsumerFiles,validatePreparationConsumers,
  validatePreparationConsumerInput,projectPreparationConsumerFile,
  projectPreparationConsumerDocument,withPreparationConsumersScope,
} from '../../scripts/identity/preparation-consumers-v1.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file));
const old=createGitReader()(root,preparationConsumersBase);
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
test('D admits only the two published exports, preserving prior selections and all six other consumers',()=>{
  assert.deepEqual(validatePreparationConsumers(),[
    {service:'gateway-bff',revision:'ef12752e68b761b9c84a8f62588e334d0d754f93',entries:38,assets:198},
    {service:'web-pos',revision:'dc9c2291ce8227c4f357fa266fd88b5d7442c3df',entries:16,assets:120},
  ]);
  for(const file of preparationConsumerFiles){
    assert.deepEqual(projectPreparationConsumerFile(file,read(file)),old(file));
    assert.deepEqual(projectPreparationConsumerDocument(file,JSON.parse(read(file))),JSON.parse(old(file)));
  }
});
const mutations={
  revision:value=>value.sourceCommit='0'.repeat(40),
  lifecycle:value=>value.publication='local-candidate',
  owner:value=>value.sourceRepository='opencomerix/foreign',
  missing:value=>value.lock.entries.pop(),
  pin:value=>value.lock.entries[0].commit='0'.repeat(40),
  asset:value=>value.lock.assets[0].localSha256='0'.repeat(64),
  operation:value=>value.manifest.contracts.at(-1).operations.push('unapproved'),
  binding:value=>value.manifest.bindings[0].path='foreign.ts',
};
for(const [label,mutate]of Object.entries(mutations))test('D rejects self-consistent but unauthorized '+label,()=>{
  for(const file of preparationConsumerFiles){
    const value=JSON.parse(read(file));mutate(value);
    value.manifestSha256=digest(encode(value.manifest));value.lock.manifestSha256=value.manifestSha256;
    value.lockSha256=digest(encode(value.lock));const bytes=encode(value);
    assert.throws(()=>validatePreparationConsumerInput(file,bytes),/PREPARATION_CONSUMER_BYTES/);
    assert.strictEqual(projectPreparationConsumerFile(file,bytes),bytes);
    assert.strictEqual(projectPreparationConsumerDocument(file,value),value);
    assert.throws(()=>withPreparationConsumersScope([],p=>p===file?bytes:read(p),()=>assert.fail('accepted drift')),/PARTIAL_SCOPE/);
  }
});
test('partial rollback, omissions and drift after a successful context fail before the callback',()=>{
  withPreparationConsumersScope([],read,()=>true);
  for(const file of preparationConsumerFiles){
    assert.throws(()=>withPreparationConsumersScope([],p=>p===file?old(p):read(p),()=>assert.fail('partial rollback')),/PARTIAL_SCOPE/);
    assert.throws(()=>withPreparationConsumersScope([],p=>{if(p===file)throw Error('missing export');return read(p);},()=>assert.fail('missing accepted')),/missing export/);
    assert.throws(()=>withPreparationConsumersScope([],p=>p===file?Buffer.concat([read(p),Buffer.from('drift')]):read(p),()=>assert.fail('drift accepted')),/PARTIAL_SCOPE/);
  }
  withPreparationConsumersScope([],old,(paths,historical)=>{
    assert.deepEqual(paths,[]);
    for(const file of preparationConsumerFiles)assert.deepEqual(historical(file),old(file));
  });
  assert.throws(()=>validatePreparationConsumers(old),/PREPARATION_CONSUMER_BYTES/);
});
test('one bounded current context reads each export once for 1, 10 and 100 historical projections',()=>{
  for(const count of [1,10,100]){
    const visits=new Map();
    withPreparationConsumersScope([],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
      assert.deepEqual(paths,preparationConsumerFiles);
      for(let i=0;i<count;i++)for(const file of paths)assert.deepEqual(historical(file),old(file));
    });
    assert.deepEqual([...visits.values()],[1,1]);
  }
});
test('projections perform no live reads, preserve unknown input and do not share returned objects',()=>{
  const inputs=preparationConsumerFiles.map(file=>[file,read(file)]),original=fs.readFileSync;
  fs.readFileSync=()=>{throw Error('live read');};syncBuiltinESMExports();
  try{
    for(const[file,bytes]of inputs){
      const first=projectPreparationConsumerFile(file,bytes);first.fill(0);
      assert.deepEqual(projectPreparationConsumerFile(file,bytes),old(file));
      const document=projectPreparationConsumerDocument(file,JSON.parse(bytes));document.lock.entries.pop();
      assert.deepEqual(projectPreparationConsumerDocument(file,JSON.parse(bytes)),JSON.parse(old(file)));
      const invalid=JSON.parse(bytes);invalid.extra=undefined;
      assert.strictEqual(projectPreparationConsumerDocument(file,invalid),invalid);
      assert.strictEqual(projectPreparationConsumerFile('foreign.json',bytes),bytes);
      const prior=old(file);assert.strictEqual(projectPreparationConsumerFile(file,prior),prior);
    }
  }finally{fs.readFileSync=original;syncBuiltinESMExports();}
});
test('the unchanged six consumers and index remain guarded',()=>{
  const index=JSON.parse(old('registry/consumers/index.json'));
  for(const file of ['registry/consumers/index.json',...index.consumers.map(row=>'registry/consumers/'+row.file)].filter(file=>!preparationConsumerFiles.includes(file)))
    assert.throws(()=>validatePreparationConsumers(p=>p===file?Buffer.concat([read(p),Buffer.from('drift')]):read(p)),/PRESERVATION/);
});
test('scope readers close on success/failure and reject asynchronous callbacks',()=>{
  let escaped;
  withPreparationConsumersScope([],read,(_paths,historical)=>{escaped=historical;});
  assert.throws(()=>escaped(preparationConsumerFiles[0]),/CONTEXT_CLOSED/);
  assert.throws(()=>withPreparationConsumersScope([],read,(_paths,historical)=>{escaped=historical;throw Error('callback');}),/callback/);
  assert.throws(()=>escaped(preparationConsumerFiles[0]),/CONTEXT_CLOSED/);
  assert.throws(()=>withPreparationConsumersScope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
});
test('existing tooling integrity protects both the new verifier and its tests',()=>{
  validateValidationTooling(read);
  for(const file of ['scripts/identity/preparation-consumers-v1.mjs','test/identity/preparation-consumers-v1.test.mjs','test/identity/inventory-authority-v1-1.test.mjs'])
    assert.throws(()=>validateValidationTooling(p=>p===file?Buffer.concat([read(p),Buffer.from('drift')]):read(p)),/VALIDATION_TOOLING_DRIFT/);
});
