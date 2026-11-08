import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {makeLock,gitReader} from '../../tools/architecture/graph.mjs';
import {root,sourceCommit,admissionIds,admissionRows,admittedRegistry,admissionMetadata,
  admissionClosures,sourceCandidateDocument,validateAdmissionMetadata,validateAdmission,
} from '../../scripts/identity/internal-auth-v2-admission.mjs';

const read=file=>fs.readFileSync(path.join(root,file));
const source=gitReader(root,sourceCommit);
const registryPath='registry/contracts.json',indexPath='identity/index.json';
const before=JSON.parse(source(registryPath));

test('four selected admissions preserve all prior roots, intentions, consumers and source bytes',()=>{
  const visits=[];
  assert.deepEqual(validateAdmission(file=>{visits.push(file);return read(file);}),
    {admitted:4,roots:206,preserved:236,planned:2,consumers:7,runtime_demonstrated:false});
  assert.equal(visits.length,new Set(visits).size,'one current read per distinct input');
  const registry=admittedRegistry();
  assert.deepEqual(registry.contracts.slice(0,before.contracts.length),before.contracts);
  assert.deepEqual(registry.planned,before.planned.filter(row=>!admissionIds.includes(row.id)));
  assert.deepEqual(registry.requiredConsumers,before.requiredConsumers);
  assert.deepEqual(registry.preservedFiles,before.preservedFiles);
  assert.equal(registry.contracts.at(-4).commit,sourceCommit);
  assert.deepEqual(admissionRows().map(row=>[row.status,row.tag,row.tagObject]),Array.from({length:4},()=>['active',null,null]));
});

test('source projection recognizes exact metadata only and isolates returned values',()=>{
  for(const file of [registryPath,indexPath]){
    const value=JSON.parse(read(file)),expected=JSON.parse(source(file));
    const projected=sourceCandidateDocument(file,value);
    assert.deepEqual(projected,expected);projected.extra='mutated return';
    assert.deepEqual(sourceCandidateDocument(file,value),expected);
    for(const extra of [undefined,NaN,1n]){
      const altered=structuredClone(value);altered.extra=extra;
      assert.equal(sourceCandidateDocument(file,altered),altered);
    }
  }
  const value=admittedRegistry();assert.equal(sourceCandidateDocument('unapproved.json',value),value);
  const rows=admissionRows();rows[0].operations.pop();assert.equal(admissionRows()[0].operations.length,2);
  const metadata=admissionMetadata();metadata.get(indexPath).fill(0);
  assert.notEqual(admissionMetadata().get(indexPath)[0],0);
});

for(const [label,mutate]of [
  ['missing root',value=>value.contracts.pop()],
  ['draft rollback',value=>value.contracts.at(-1).status='draft'],
  ['wrong source',value=>value.contracts.at(-4).commit='0'.repeat(40)],
  ['wrong hash',value=>value.contracts.at(-4).sha256='0'.repeat(64)],
  ['wrong owner',value=>value.contracts.at(-4).owner='unapproved'],
  ['operation omitted',value=>value.contracts.at(-4).operations.pop()],
  ['mapping added',value=>value.contracts.at(-4).uriMappings.push({uri:'https://unapproved.invalid/',path:indexPath})],
  ['old root changed',value=>value.contracts[0].purpose='unapproved'],
  ['foreign intention removed',value=>value.planned.pop()],
  ['consumer added',value=>value.requiredConsumers.push('unapproved')],
])test('metadata rejects partial or unapproved transition: '+label,()=>{
  const registry=admittedRegistry();mutate(registry);
  assert.throws(()=>validateAdmissionMetadata(registry,JSON.parse(read(indexPath))));
  assert.equal(sourceCandidateDocument(registryPath,registry),registry);
});

test('an incomplete Identity index cannot be projected or admitted',()=>{
  const index=JSON.parse(read(indexPath));index.contracts.pop();
  assert.throws(()=>validateAdmissionMetadata(admittedRegistry(),index));
  assert.equal(sourceCandidateDocument(indexPath,index),index);
});

test('closures retain the H1A policy and nine immutable wire examples without global mappings',()=>{
  const closures=admissionClosures();
  assert.deepEqual(closures.map(row=>row.files.length),[11,1,1,1]);
  assert.equal(closures[0].files.filter(row=>row.path.startsWith('openapi/examples/identity-internal-auth-v1/')).length,9);
  assert(closures[0].files.some(row=>row.path==='identity/http/shared/v2/identity-workload-token-reuse-policy-v2.json'));
  assert(admissionRows().every(row=>row.uriMappings.length===0));
});

for(const role of ['producer','consumer','semantic-owner','validation'])test('synthetic '+role+' locks only published af6 selections and leaves real consumers untouched',()=>{
  const manifest={service:'isolated-h1a-admission',contracts:admissionRows().map(row=>({id:row.id,role,version:row.version,
    operations:row.operations,pointers:row.operations.length?['/info','/x-workload-token-reuse-policy']:['']})),assets:[]};
  const lock=makeLock(root,manifest,Buffer.from(JSON.stringify(manifest)),admittedRegistry());
  assert.equal(lock.entries.length,4);assert(lock.entries.every(row=>row.commit===sourceCommit));
  assert.deepEqual(lock.entries.map(row=>row.files.length),[11,1,1,1]);
});

const protectedFiles=[...admissionMetadata().keys(),...admissionRows().map(row=>row.path),
  'openapi/identity-internal-auth-v1.yaml','openapi/examples/identity-internal-auth-v1/jwks-current.json',
  'registry/consumers/index.json','registry/consumers/identity-tenancy.json'];
for(const file of protectedFiles)for(const mutation of ['changed','missing'])
test('admission rereads after warmup and rejects '+mutation+': '+file,()=>{
  validateAdmission();
  assert.throws(()=>validateAdmission(name=>{
    if(name===file){if(mutation==='missing')throw Error('Synthetic missing input');return Buffer.concat([read(name),Buffer.from('\nUnapproved')]);}
    return read(name);
  }));
  assert.equal(validateAdmission().admitted,4);
});
