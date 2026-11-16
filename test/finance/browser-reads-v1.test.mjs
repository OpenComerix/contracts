import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {makeLock,resolveSelection} from '../../tools/architecture/graph.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {projectBrowserReadsAdmissionFile} from '../../scripts/finance/browser-reads-admission-v1.mjs';
import {
  browserReadsBase,browserReadsPath,browserReadsFixturesPath,browserReadsId,
  browserReadsFiles,browserReadsPreservedFiles,validateBrowserReads,validateBrowserReadsInput,
  projectBrowserReadsFile,projectBrowserReadsDocument,withBrowserReadsScope,
} from '../../scripts/finance/browser-reads-v1.mjs';

const root = path.resolve(import.meta.dirname, '../..');
// Source assertions retain their published snapshot; admission has its own gate.
const read = file => projectBrowserReadsAdmissionFile(file, fs.readFileSync(path.join(root, file)));
const old = createGitReader()(root, browserReadsBase);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const registryPath = 'registry/contracts.json';

test('four selected GETs preserve every original field except the optional Origin requirement and its explanation', () => {
  assert.deepEqual(validateBrowserReads(), {operations:4,planned:1,admitted:0,runtimeDemonstrated:false});
  const document = JSON.parse(read(browserReadsPath));
  const expected = new Set(['listCashRegisters','getCashShift','getCashShiftExpected','getOpenCashShift']);
  const predecessors = ['finance-v1','finance-open-shift-v1'].map(name =>
    JSON.parse(old('finance/http/public/v1/' + name + '.yaml')));
  for (const [route,item] of Object.entries(document.paths)) {
    assert.deepEqual(Object.keys(item), ['get']);
    const operation = structuredClone(item.get);
    assert(expected.delete(operation.operationId), 'Unexpected or duplicate operation');
    const prior = predecessors.map(value => value.paths[route]?.get).find(Boolean);
    const origin = operation.parameters.find(value => value.name === 'Origin');
    assert.equal(origin.required, false);
    assert.match(origin.description, /reject foreign, null, malformed or duplicate origins/);
    assert.match(origin.description, /Absence grants no authority/);
    Object.assign(origin, prior.parameters.find(value => value.name === 'Origin'));
    assert.deepEqual(operation, prior);
    assert.equal(operation['x-permission'], 'finance.cash.read');
    assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
  }
  assert.equal(expected.size, 0);
  assert.deepEqual(document.security, [{session:[]}]);
  assert.deepEqual(document.components, predecessors[0].components);
});

test('the selected closure resolves unchanged schemas and examples without inventing admission or consumer pins', () => {
  const registry = JSON.parse(read(registryPath)), before = JSON.parse(old(registryPath));
  assert.deepEqual(registry.contracts, before.contracts);
  assert.deepEqual(registry.preservedFiles, before.preservedFiles);
  assert.deepEqual(registry.planned.slice(0,-1), before.planned);
  const planned = registry.planned.at(-1);
  assert.equal(planned.id, browserReadsId);assert.equal(planned.status, 'planned');
  const selection = {version:'1.0.0',operations:planned.operations,pointers:[]};
  const descriptor = {...planned,uriMappings:registry.contracts.flatMap(row => row.uriMappings)};
  const closure = resolveSelection(read,descriptor,selection,registry);
  assert(closure.files.some(file => file.path.endsWith('finance-types-v1.schema.json')));
  assert(closure.files.some(file => file.path.endsWith('finance-open-shift-v1.schema.json')));
  for (const file of closure.files.filter(file => file.path !== browserReadsPath))
    assert.deepEqual(read(file.path), old(file.path));
  const manifest = {service:'isolated-browser-reads',contracts:[{id:browserReadsId,role:'consumer',...selection}],assets:[]};
  assert.throws(() => makeLock(root,manifest,encode(manifest),registry), /Unknown\/unmaterialized/);
  for (const owner of before.requiredConsumers) assert.deepEqual(read('registry/consumers/'+owner+'.json'),old('registry/consumers/'+owner+'.json'));
});

test('acceptance fixtures distinguish origin checks from current authority and retain negative browser inputs', () => {
  const fixture = JSON.parse(read(browserReadsFixturesPath));
  assert.equal(fixture.runtime_demonstrated,false);
  assert.deepEqual(fixture.cases.map(row => [row.id,row.origin_check]), [
    ['same-origin-browser','continue-to-authority'],['explicit-allowed','continue-to-authority'],
    ['foreign','reject'],['opaque','reject'],['empty','reject'],['malformed','reject'],
    ['duplicate-allowed','reject'],['allowed-and-foreign','reject'],
  ]);
  assert.deepEqual(fixture.cases[0].origins,[]);
  assert.deepEqual(fixture.cases[1].origins,[fixture.allowed_origin]);
  assert(fixture.authority_controls.includes('foreign-tenant'));
  assert(fixture.authority_controls.includes('open-shift-other-responsible'));
  assert.match(fixture.constraints,/not runtime authorization evidence/);
});

test('unapproved Origin, security, response, operation, fixture and registry changes fail closed', () => {
  const mutations = [
    [browserReadsPath,value => Object.values(value.paths)[0].get.parameters.at(-1).required = true],
    [browserReadsPath,value => value.security = []],
    [browserReadsPath,value => Object.values(value.paths)[0].get['x-permission'] = 'public'],
    [browserReadsPath,value => delete Object.values(value.paths)[0].get.responses['403']],
    [browserReadsPath,value => value.paths['/finance/cash-registers'].post = value.paths['/finance/cash-registers'].get],
    [browserReadsFixturesPath,value => value.cases[2].origin_check = 'continue-to-authority'],
    [browserReadsFixturesPath,value => value.authority_controls.pop()],
    [registryPath,value => value.planned.at(-1).owner = 'gateway-bff'],
    [registryPath,value => value.contracts[0].sha256 = '0'.repeat(64)],
  ];
  for (const [file,mutate] of mutations) {
    const value = JSON.parse(read(file));mutate(value);const bytes = encode(value);
    assert.throws(() => validateBrowserReadsInput(file,bytes),/BROWSER_READS_BYTES/);
    assert.strictEqual(projectBrowserReadsFile(file,bytes),bytes);
    assert.strictEqual(projectBrowserReadsDocument(file,value),value);
  }
});

test('a current context reads each input once for 1, 10 or 100 historical projections and retains no approval', () => {
  for (const count of [1,10,100]) {
    const visits = new Map();
    withBrowserReadsScope([],file => {visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical) => {
      assert.deepEqual(paths,[...browserReadsFiles,...browserReadsPreservedFiles]);
      for(let i=0;i<count;i++) assert.deepEqual(historical(registryPath),old(registryPath));
    });
    assert.equal(visits.size,browserReadsFiles.length+2);
    assert([...visits.values()].every(value => value === 1));
  }
  for (const file of browserReadsFiles) {
    let callbackReached = false;
    assert.throws(() => withBrowserReadsScope([],name => name === file ? Buffer.concat([read(name),Buffer.from('unapproved')]) : read(name), () => {
      callbackReached = true;
    }), /BROWSER_READS_BYTES/);
    assert.equal(callbackReached, false, 'altered input must not reach the callback');
    assert.throws(() => withBrowserReadsScope([],name => {if(name===file)throw Error('missing');return read(name);}, () => assert.fail('omission accepted')),/missing/);
  }
  withBrowserReadsScope([],read,() => true);
});

test('pure projections never validate another file or repair partial metadata', () => {
  const bytes = read(registryPath), document = JSON.parse(bytes);
  const prior = old(registryPath), originalRead = fs.readFileSync;
  fs.readFileSync = () => {throw Error('live read during projection');};syncBuiltinESMExports();
  try {
    assert.deepEqual(projectBrowserReadsFile(registryPath,bytes),prior);
    assert.strictEqual(projectBrowserReadsFile(registryPath,prior),prior);
    assert.deepEqual(projectBrowserReadsDocument(registryPath,document),JSON.parse(prior));
    document.extra = undefined;
    assert.strictEqual(projectBrowserReadsDocument(registryPath,document),document);
  } finally {fs.readFileSync=originalRead;syncBuiltinESMExports();}
  const partial = JSON.parse(bytes);partial.planned.at(-1).operations.pop();
  assert.throws(() => withBrowserReadsScope([],file => file === registryPath ? encode(partial) : read(file),() => assert.fail('partial accepted')),/BROWSER_READS_PARTIAL_SCOPE/);
});

test('context closes after success/failure and forbids deferred validation; verifier code has its existing owner guard', () => {
  let escaped;
  withBrowserReadsScope([],read,(_paths,historical) => {escaped=historical;});
  assert.throws(() => escaped(registryPath),/CONTEXT_CLOSED/);
  assert.throws(() => withBrowserReadsScope([],read,(_paths,historical) => {escaped=historical;throw Error('failure');}),/failure/);
  assert.throws(() => escaped(registryPath),/CONTEXT_CLOSED/);
  assert.throws(() => withBrowserReadsScope([],read,() => Promise.resolve(true)),/SYNCHRONOUS/);
  validateValidationTooling(read);
  for(const file of ['scripts/finance/browser-reads-v1.mjs','test/finance/browser-reads-v1.test.mjs'])
    assert.throws(() => validateValidationTooling(name => name === file ? Buffer.concat([read(name),Buffer.from('drift')]) : read(name)),/VALIDATION_TOOLING_DRIFT/);
});
