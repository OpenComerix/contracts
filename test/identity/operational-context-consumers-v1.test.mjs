import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {browserReadsFiles,browserReadsPreservedFiles} from '../../scripts/finance/browser-reads-v1.mjs';
import {browserReadsAdmissionScopeFiles} from '../../scripts/finance/browser-reads-admission-v1.mjs';
import {
  operationalConsumersBase,operationalConsumerFiles,operationalConsumerToolingFiles,
  validateOperationalConsumers,projectOperationalConsumerFile,
  projectOperationalConsumerDocument,projectOperationalConsumerToolingFile,
  withOperationalConsumersScope,
} from '../../scripts/identity/operational-context-consumers-v1.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file));
const old=createGitReader()(root,operationalConsumersBase);
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');

test('published B and C preserve admitted prefixes and recognize only the three exact exports',()=>{
  assert.deepEqual(validateOperationalConsumers(read),[
    {service:'identity-tenancy',previousPins:45,registryPreviousPins:41,carriedSelections:4,additions:6,assets:0,publication:'published'},
    {service:'finance',previousPins:20,registryPreviousPins:17,carriedSelections:3,additions:6,assets:42,publication:'published'},
    {service:'gateway-bff',previousPins:17,registryPreviousPins:17,carriedSelections:0,additions:21,assets:198,publication:'published'},
  ]);
  for(const file of operationalConsumerFiles){
    const value=JSON.parse(read(file)),prior=JSON.parse(old(file));
    assert.deepEqual(value.lock.entries.slice(0,prior.lock.entries.length),prior.lock.entries);
    assert.deepEqual(value.lock.assets.slice(0,prior.lock.assets.length),prior.lock.assets);
    assert.deepEqual(projectOperationalConsumerFile(file,read(file)),old(file));
  }
});
const mutations={
  pin:value=>value.lock.entries[0].commit='0'.repeat(40),
  omission:value=>value.manifest.contracts.pop(),
  extra:value=>value.lock.entries.push(value.lock.entries.at(-1)),
  source:value=>value.sourceCommit='0'.repeat(40),
  lifecycle:value=>value.publication='local-candidate',
  hash:value=>value.manifestSha256='0'.repeat(64),
  operation:value=>value.manifest.contracts.at(-1).operations.push('unapproved'),
  provenance:value=>value.lock.entries.at(-1).files[0].sha256='0'.repeat(64),
  owner:value=>value.sourceRepository='opencomerix/foreign',
  unknown:value=>value.unapproved=true,
};
for(const [name,mutate]of Object.entries(mutations))test('rejects '+name+' in each export without repairing it',()=>{
  for(const file of operationalConsumerFiles){
    const value=JSON.parse(read(file));mutate(value);const bytes=encode(value);
    assert.throws(()=>validateOperationalConsumers(p=>p===file?bytes:read(p)),/OPERATIONAL_CONSUMER_BYTES/);
    assert.strictEqual(projectOperationalConsumerFile(file,bytes),bytes);
    assert.strictEqual(projectOperationalConsumerDocument(file,value),value);
  }
});
test('Gateway C rejects changed prior/runtime copies, bindings and undeclared selection even with self-consistent metadata hashes',()=>{
  const file='registry/consumers/gateway-bff.json';
  const hash=value=>createHash('sha256').update(encode(value)).digest('hex');
  for(const mutate of [
    value=>value.manifest.assets[0].destination='foreign/prior.json',
    value=>value.lock.assets[160].localSha256='0'.repeat(64),
    value=>value.manifest.bindings[0].path='foreign/prior.ts',
    value=>value.manifest.contracts.at(-1).operations.push('unapproved'),
  ]){
    const value=JSON.parse(read(file));mutate(value);
    value.manifestSha256=hash(value.manifest);value.lock.manifestSha256=value.manifestSha256;value.lockSha256=hash(value.lock);
    const bytes=encode(value);
    assert.throws(()=>validateOperationalConsumers(p=>p===file?bytes:read(p)),/OPERATIONAL_CONSUMER_BYTES/);
    assert.strictEqual(projectOperationalConsumerFile(file,bytes),bytes);
    assert.strictEqual(projectOperationalConsumerDocument(file,value),value);
  }
});
test('pure projections are isolated, idempotent and reject non-JSON document additions',()=>{
  for(const file of operationalConsumerFiles){
    const current=read(file),projected=projectOperationalConsumerFile(file,current);
    assert.strictEqual(projectOperationalConsumerFile(file,projected),projected);
    projected.fill(0);assert.deepEqual(projectOperationalConsumerFile(file,current),old(file));
    const value=JSON.parse(current);value.extra=undefined;
    assert.strictEqual(projectOperationalConsumerDocument(file,value),value);
    const bytes=Buffer.from('{}');assert.strictEqual(projectOperationalConsumerFile('foreign.json',bytes),bytes);
  }
});
test('projections do not read another live input even for 1, 10 or 100 supplied values',()=>{
  const inputs=operationalConsumerFiles.map(file=>[file,read(file)]);
  const original=fs.readFileSync;
  fs.readFileSync=()=>{throw Error('projection performed a live read');};syncBuiltinESMExports();
  try{for(const count of [1,10,100])for(let i=0;i<count;i++)for(const [file,bytes]of inputs){
    assert.deepEqual(projectOperationalConsumerFile(file,bytes),old(file));
    assert.deepEqual(projectOperationalConsumerDocument(file,JSON.parse(bytes)),JSON.parse(old(file)));
  }}finally{fs.readFileSync=original;syncBuiltinESMExports();}
});
test('one synchronous context reads each live input once regardless of projection count',()=>{
  for(const count of [1,10,100]){
    const visits=new Map();
    withOperationalConsumersScope([],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
      assert.deepEqual(paths,[...new Set([...browserReadsAdmissionScopeFiles,...browserReadsFiles,...browserReadsPreservedFiles,...operationalConsumerFiles])]);
      for(let i=0;i<count;i++)for(const file of operationalConsumerFiles)assert.deepEqual(historical(file),old(file));
    });
    assert.equal(visits.size,new Set([...browserReadsAdmissionScopeFiles,...browserReadsFiles,...browserReadsPreservedFiles,...operationalConsumerFiles]).size);
    assert([...visits.values()].every(n=>n===1));
  }
});
test('fresh contexts reject drift, partial rollback and omission after a successful invocation',()=>{
  withOperationalConsumersScope([],read,()=>true);
  for(const file of operationalConsumerFiles){
    for(const mode of ['changed','missing'])assert.throws(()=>withOperationalConsumersScope([],p=>{
      if(p!==file)return read(p);if(mode==='missing')throw Error('synthetic missing input');
      return Buffer.concat([read(p),Buffer.from('\nunapproved')]);
    },()=>assert.fail('invalid scope accepted')));
  }
  for(const file of operationalConsumerFiles)assert.throws(()=>withOperationalConsumersScope([],p=>p===file?old(p):read(p),()=>assert.fail('partial B/C accepted')));
  assert.throws(()=>withOperationalConsumersScope([],p=>operationalConsumerFiles.includes(p)?old(p):read(p),()=>assert.fail('complete B/C rollback accepted')));
  withOperationalConsumersScope([],read,()=>true);
});
test('the existing tooling owner retains freshness and omission checks for the modified/new code',()=>{
  validateValidationTooling(read);
  for(const file of [...operationalConsumerToolingFiles,'tools/architecture/validation-tooling.json'])
    for(const mode of ['changed','missing'])assert.throws(()=>validateValidationTooling(p=>{
      if(p!==file)return read(p);if(mode==='missing')throw Error('synthetic missing tooling');
      return Buffer.concat([read(p),Buffer.from('\nunapproved')]);
    }));
  validateValidationTooling(read);
});
test('context lifetime is closed on success/failure and asynchronous approval is forbidden',()=>{
  let escaped;
  withOperationalConsumersScope([],read,(_paths,historical)=>{escaped=historical;return true;});
  assert.throws(()=>escaped(operationalConsumerFiles[0]),/CONTEXT_CLOSED/);
  assert.throws(()=>withOperationalConsumersScope([],read,(_paths,historical)=>{escaped=historical;throw Error('synthetic failure');}),/synthetic failure/);
  assert.throws(()=>escaped(operationalConsumerFiles[0]),/CONTEXT_CLOSED/);
  assert.throws(()=>withOperationalConsumersScope([],read,()=>Promise.resolve(true)),/SYNCHRONOUS/);
});
test('tooling views recognize only reviewed current bytes and preserve changed supplied values',()=>{
  for(const file of operationalConsumerToolingFiles.slice(0,-1)){
    assert.deepEqual(projectOperationalConsumerToolingFile(file,read(file)),old(file));
    const changed=Buffer.concat([read(file),Buffer.from('\nunapproved')]);
    assert.strictEqual(projectOperationalConsumerToolingFile(file,changed),changed);
  }
});
