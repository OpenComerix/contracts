import {projectOnlineFile} from '../../scripts/sales/online-source-v1.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {makeLock,resolveSelection} from '../../tools/architecture/graph.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {preparationConsumerFiles,projectPreparationConsumerFile} from '../../scripts/identity/preparation-consumers-v1.mjs';
import {validateBrowserReads,projectBrowserReadsFile,withBrowserReadsScope} from '../../scripts/finance/browser-reads-v1.mjs';
import {
  browserReadsAdmissionSourceRevision,browserReadsAdmissionSource,browserReadsAdmissionId,
  browserReadsAdmittedRegistry,browserReadsAdmissionClosure,browserReadsAdmissionMetadata,
  browserReadsAdmissionScopeFiles,browserReadsAdmissionInputPaths,
  validateBrowserReadsAdmission,validateBrowserReadsAdmissionInput,
  projectBrowserReadsAdmissionFile,projectBrowserReadsAdmissionDocument,withBrowserReadsAdmissionScope,
} from '../../scripts/finance/browser-reads-admission-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => projectOnlineFile(file,fs.readFileSync(path.join(root, file)));
const registryPath = 'registry/contracts.json';
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const text = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const before = JSON.parse(browserReadsAdmissionSource(registryPath));
const expectedResult = {admitted:1,roots:224,priorRoots:223,planned:2,consumers:8,closureFiles:6,runtimeDemonstrated:false};

test('one exact admission preserves every previous descriptor, intention and consumer', () => {
  assert.deepEqual(validateBrowserReadsAdmission(), expectedResult);
  const value = JSON.parse(read(registryPath));
  assert.deepEqual(value, browserReadsAdmittedRegistry());
  assert.deepEqual(value.contracts.slice(0,-1), before.contracts);
  assert.deepEqual(value.preservedFiles, before.preservedFiles);
  assert.deepEqual(value.requiredConsumers, before.requiredConsumers);
  assert.deepEqual(value.planned, before.planned.filter(row => row.id !== browserReadsAdmissionId));
  for (const owner of before.requiredConsumers)
    assert.equal(text(projectPreparationConsumerFile('registry/consumers/'+owner+'.json',read('registry/consumers/'+owner+'.json'))), text(browserReadsAdmissionSource('registry/consumers/'+owner+'.json')));
  assert.deepEqual(validateBrowserReads(), {operations:4,planned:1,admitted:0,runtimeDemonstrated:false});
});

test('the immutable root, four operations and minimal six-file closure resolve for each functional role', () => {
  const registry = browserReadsAdmittedRegistry(), row = registry.contracts.at(-1);
  assert.equal(row.id, browserReadsAdmissionId);assert.equal(row.owner,'finance');assert.equal(row.status,'active');
  assert.equal(row.commit,browserReadsAdmissionSourceRevision);assert.equal(row.tag,null);assert.equal(row.tagObject,null);
  assert.deepEqual(row.operations,['listCashRegisters','getCashShift','getCashShiftExpected','getOpenCashShift']);
  assert.deepEqual(row.uriMappings,[]);
  const selection = {version:'1.0.0',operations:row.operations,pointers:[]};
  const closure = resolveSelection(browserReadsAdmissionSource,row,selection,registry);
  assert.deepEqual(closure,browserReadsAdmissionClosure());
  assert.equal(closure.files.length,6);
  assert.equal(closure.files.find(file=>file.path===row.path).sha256,row.sha256);
  for(const role of ['consumer','producer','semantic-owner','validation']) {
    const manifest = {service:'isolated-browser-admission',contracts:[{id:row.id,role,...selection}],assets:[]};
    const lock = makeLock(root,manifest,encode(manifest),registry);
    assert.equal(lock.entries.length,1);assert.equal(lock.entries[0].commit,browserReadsAdmissionSourceRevision);
    assert.deepEqual(lock.entries[0].files,closure.files);
    assert.deepEqual(lock.entries[0].units,closure.units);
    assert.throws(()=>makeLock(root,manifest,encode(manifest),before),/Unknown\/unmaterialized/);
  }
});

for (const [label, change] of [
  ['revision', row => row.commit='0'.repeat(40)],
  ['hash', row => row.sha256='0'.repeat(64)],
  ['version', row => row.version='2.0.0'],
  ['owner', row => row.owner='gateway-bff'],
  ['status', row => row.status='draft'],
  ['operation omitted', row => row.operations.pop()],
  ['mutation added', row => row.operations.push('openCashShift')],
  ['foreign mapping', row => row.uriMappings.push({uri:'https://foreign.example/schema',path:row.path})],
]) test('incorrect admission is rejected: '+label, () => {
  const value = browserReadsAdmittedRegistry();change(value.contracts.at(-1));
  const bytes = encode(value);
  assert.throws(()=>validateBrowserReadsAdmissionInput(registryPath,bytes),/BROWSER_ADMISSION_BYTES/);
  assert.strictEqual(projectBrowserReadsAdmissionFile(registryPath,bytes),bytes);
  assert.strictEqual(projectBrowserReadsAdmissionDocument(registryPath,value),value);
  let reached=false;
  assert.throws(()=>withBrowserReadsAdmissionScope([],file=>file===registryPath?bytes:read(file),()=>{reached=true;}),/PARTIAL_SCOPE/);
  assert.equal(reached,false);
});

test('partial admission and unrelated registry changes never satisfy the admission validator', () => {
  for(const change of [
    value=>value.contracts.pop(), value=>value.planned=before.planned,
    value=>value.contracts[0].purpose='Unreviewed', value=>value.planned.shift(),
    value=>value.requiredConsumers.push('unapproved'), value=>value.preservedFiles.pop(),
  ]) {
    const value=browserReadsAdmittedRegistry();change(value);
    assert.throws(()=>validateBrowserReadsAdmission(file=>file===registryPath?encode(value):read(file)),/BROWSER_ADMISSION_BYTES/);
  }
});

test('all admission inputs are checked without running a complete gate per protected path', () => {
  validateBrowserReadsAdmission();
  for(const file of browserReadsAdmissionInputPaths) {
    const bytes=read(file);validateBrowserReadsAdmissionInput(file,bytes);
    assert.throws(()=>validateBrowserReadsAdmissionInput(file,Buffer.concat([bytes,Buffer.from('drift')])),/BROWSER_ADMISSION_BYTES/);
  }
  assert.throws(()=>validateBrowserReadsAdmissionInput('unapproved.json',Buffer.from('{}')),/UNKNOWN_INPUT/);
  const selected='finance/http/shared/v1/finance-types-v1.schema.json';
  assert.throws(()=>validateBrowserReadsAdmission(file=>{if(file===selected)throw Error('missing closure');return read(file);}),/missing closure/);
  assert.throws(()=>validateBrowserReadsAdmission(file=>file===selected?Buffer.from('{}'):read(file)),/BROWSER_ADMISSION_BYTES/);
  assert.deepEqual(validateBrowserReadsAdmission(),expectedResult);
});

test('delta contexts read each current input once for 1, 10 or 100 projections and reject warmed drift', () => {
  for(const count of [1,10,100]) {
    const visits=new Map();
    withBrowserReadsAdmissionScope([],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
      assert.deepEqual(paths,[...preparationConsumerFiles,...browserReadsAdmissionScopeFiles]);
      for(let i=0;i<count;i++)assert.deepEqual(historical(registryPath),browserReadsAdmissionSource(registryPath));
    });
    assert.equal(visits.size,new Set([...preparationConsumerFiles,...browserReadsAdmissionScopeFiles]).size);
    assert([...visits.values()].every(value=>value===1));
  }
  for(const file of browserReadsAdmissionScopeFiles) {
    for(const missing of [false,true]) {
      let reached=false;
      assert.throws(()=>withBrowserReadsAdmissionScope([],name=>{
        if(name!==file)return read(name);
        if(missing)throw Error('missing delta');
        return Buffer.concat([read(name),Buffer.from('drift')]);
      },()=>{reached=true;}),/BROWSER_ADMISSION_BYTES|missing delta/);
      assert.equal(reached,false);
    }
  }
  withBrowserReadsAdmissionScope([],read,()=>true);
});

test('pure projections preserve caller drift and clone immutable results without live reads', () => {
  const metadata=browserReadsAdmissionMetadata();
  const bytes=metadata.get(registryPath), value=JSON.parse(bytes);
  const previous=browserReadsAdmissionSource(registryPath), original=fs.readFileSync;
  fs.readFileSync=()=>{throw Error('unexpected live read');};syncBuiltinESMExports();
  try {
    assert.deepEqual(projectBrowserReadsAdmissionFile(registryPath,bytes),previous);
    assert.deepEqual(projectBrowserReadsAdmissionDocument(registryPath,value),before);
    const drift=Buffer.concat([bytes,Buffer.from('drift')]);
    assert.equal(projectBrowserReadsAdmissionFile(registryPath,drift),drift);
    value.extra=undefined;assert.equal(projectBrowserReadsAdmissionDocument(registryPath,value),value);
  } finally {fs.readFileSync=original;syncBuiltinESMExports();}
  metadata.get(registryPath).fill(0);
  const mutable=browserReadsAdmittedRegistry();mutable.contracts.pop();
  const mutableClosure=browserReadsAdmissionClosure();mutableClosure.files.pop();
  assert.equal(browserReadsAdmittedRegistry().contracts.length,224);
  assert.equal(browserReadsAdmissionClosure().files.length,6);
  assert.deepEqual(validateBrowserReadsAdmission(),expectedResult);
  assert.deepEqual(projectBrowserReadsFile(registryPath,read(registryPath)),projectBrowserReadsFile(registryPath,previous));
});

test('composed source context closes escaped readers and still rejects altered admission metadata', () => {
  let escaped;
  withBrowserReadsAdmissionScope([],read,(_paths,historical)=>{escaped=historical;});
  assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
  assert.throws(()=>withBrowserReadsAdmissionScope([],read,(_paths,historical)=>{escaped=historical;throw Error('callback failure');}),/callback failure/);
  assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
  assert.throws(()=>withBrowserReadsAdmissionScope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
  const wrong=encode({...browserReadsAdmittedRegistry(),extra:'unapproved'});
  assert.throws(()=>withBrowserReadsScope([],file=>file===registryPath?wrong:read(file),()=>assert.fail('drift accepted')),/PARTIAL_SCOPE/);
  validateValidationTooling(read);
  for(const file of ['scripts/finance/browser-reads-admission-v1.mjs','test/finance/browser-reads-admission-v1.test.mjs'])
    assert.throws(()=>validateValidationTooling(name=>name===file?Buffer.concat([read(name),Buffer.from('drift')]):read(name)),/VALIDATION_TOOLING_DRIFT/);
});
