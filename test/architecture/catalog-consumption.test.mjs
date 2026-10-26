import { withF110ADesignScope } from '../support/f1-10a-scope.mjs';
import { candidateReadView, withCandidateScope } from '../../scripts/inventory/candidate-v1.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitReader, makeLock, worktreeReader, parseSource, operationPointers } from '../../tools/architecture/graph.mjs';
import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';
import { sha256, validateConsumer } from '../../tools/architecture/consumer-gate.mjs';
import { root, consumptionBase, ownerBases, consumptionChangedFiles, consumptionOperations, selections,
  snapshotPath, bytes, consumptionSnapshot, consumptionBindingFiles, validateConsumptionSnapshot,
  consumptionReadView, consumptionReadmeView, validateConsumptionPackage, validateConsumptionCheckout, validateConsumptionPaths } from '../../scripts/catalog/catalog-consumption-v1-registry.mjs';

const source = gitReader(root, consumptionBase), read = candidateReadView(worktreeReader(root));
const registry = JSON.parse(source('registry/contracts.json'));
test('A README projection requires the complete approved document and preserves historical bytes', () => {
  const current = read('catalog/README.md');
  assert(consumptionReadmeView(current).equals(source('catalog/README.md')));
  assert(consumptionReadmeView(Buffer.from(current.toString('utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'))).equals(source('catalog/README.md')));
});
for (const [name, mutate] of [
  ['omitted map', () => source('catalog/README.md').toString('utf8')],
  ['partial map', text => text.replace('Gateway / consumer', 'Gateway / producer')],
  ['duplicated map', text => text + text.slice(text.indexOf('\n## F1-09A'), text.indexOf('\nCandidatos F1-07B:'))],
  ['reordered map', text => {
    const start = text.indexOf('\n## F1-09A'), end = text.indexOf('\nCandidatos F1-07B:');
    return text.slice(0, start) + text.slice(end) + text.slice(start, end);
  }],
  ['unrelated prefix', text => '# unapproved\n' + text],
  ['historical text', text => text.replace('## F1-08N — Certificación de AsyncAPI', '## F1-08N — Unapproved')],
  ['unrelated suffix', text => text + '\nUnapproved appendix.\n'],
  ['publication proof', text => text.replace('08a3f340c03e0463f0b94627e1a7249d17ae476c', '0'.repeat(40))],
]) test('A refuses README drift before historical projection: '+name, () => {
  const current = read('catalog/README.md'), changed = Buffer.from(mutate(current.toString('utf8')));
  assert(!changed.equals(current));
  assert.throws(() => consumptionReadmeView(changed), /A_CONSUMPTION_README/);
  assert.throws(() => validateConsumptionPackage(file => file === 'catalog/README.md' ? changed : read(file)), /A_CONSUMPTION_README/);
});
for (const service of Object.keys(ownerBases)) test('A published exports still reject altered contents before historical projection: '+service, () => {
  const published = {...consumptionSnapshot(service), publication:'published', sourceCommit:'a'.repeat(40)};
  const reader = snapshot => file => file === snapshotPath(service) ? bytes(snapshot) : read(file);
  assert(consumptionReadView(reader(published))(snapshotPath(service)).equals(source(snapshotPath(service))));
  for (const mutate of [s => s.manifest.contracts.pop(), s => {s.lock.entries[0].commit='0'.repeat(40);}]) {
    const changed = structuredClone(published); mutate(changed);
    assert.throws(() => consumptionReadView(reader(changed))(snapshotPath(service)), /A_CONSUMPTION/);
  }
});
test('A selects exactly 25 operations and their published public/private pairs, preserving the other owners', () => {
  assert.equal(validateConsumptionPackage().operations, 25);
  assert.equal(consumptionOperations.filter(row => row.method === 'GET').length, 12);
  assert.equal(consumptionOperations.filter(row => row.gatewayCut === 'F1-09C').length, 13);
  assert.equal(consumptionOperations.filter(row => row.path.startsWith('/api/v1/pricing/')).length, 5);
  const documents = ['catalog.http.public.v1', 'catalog.http.private.v1'].map(id => {
    const row = registry.contracts.find(row => row.id === id);
    return parseSource(gitReader(root, row.commit)(row.path), row.path);
  });
  for (const doc of documents) assert.deepEqual([...operationPointers(doc).keys()], consumptionOperations.map(row => row.operationId));
  for (const service of Object.keys(ownerBases)) {
    const actual = JSON.parse(read(snapshotPath(service))), previous = JSON.parse(source(snapshotPath(service)));
    validateConsumptionSnapshot(actual);
    assert(['local-candidate','published'].includes(actual.publication));
    if (actual.publication === 'local-candidate') assert.equal(actual.sourceCommit, ownerBases[service]);
    assert.deepEqual(actual.manifest.contracts.slice(0, previous.manifest.contracts.length), previous.manifest.contracts);
    assert.deepEqual(actual.lock.entries.slice(0, previous.lock.entries.length), previous.lock.entries);
    assert.deepEqual(actual.lock.assets.slice(0, previous.lock.assets.length), previous.lock.assets);
    assert(consumptionReadView(read)(snapshotPath(service)).equals(source(snapshotPath(service))));
    assert.deepEqual(actual.lock.entries, makeLock(root, actual.manifest, bytes(actual.manifest), registry, actual.lock.entries).entries);
    assert.equal(actual.manifest.assets.filter(row => row.purpose === 'runtime').length, 0);
    for (const entry of actual.manifest.contracts.slice(previous.manifest.contracts.length))
      assert(!/history|recovery|events/.test(entry.id));
    if (service === 'web-pos') {
      assert(actual.lock.entries.slice(previous.lock.entries.length).every(entry => !entry.root.includes('/private/')));
      assert(Object.keys(consumptionBindingFiles(service)).every(file => file.startsWith('.contracts/')));
    }
  }
});
for (const service of Object.keys(ownerBases)) for (const [name, change] of [
  ['omitted dependency', s => {s.manifest.contracts.pop();s.lock.entries.pop();}],
  ['manifest only', s => s.lock.entries.pop()], ['lock only', s => s.manifest.contracts.pop()],
  ['role', s => {s.manifest.contracts.at(-1).role='producer';}],
  ['version', s => {s.lock.entries.at(-1).version='99';}],
  ['pointer', s => {s.manifest.contracts.at(-1).pointers=[''];}],
  ['extra operation', s => s.manifest.contracts.at(-1).operations.push('checkCatalogAuthorization')],
  ['source pin', s => {s.lock.entries.at(-1).commit=consumptionBase;}],
  ['closure hash', s => {s.lock.entries.at(-1).files[0].sha256='0'.repeat(64);}],
  ['closure omitted', s => {s.lock.entries.at(-1).units.pop();}],
  ['H2 pin', s => {s.lock.entries[0].commit=consumptionBase;}],
  ['H2 purpose', s => {s.manifest.contracts[0].purpose+=' changed';}],
  ['duplicate', s => s.manifest.contracts.push(structuredClone(s.manifest.contracts.at(-1)))],
  ['gate', s => s.manifest.contracts.at(-1).gates.pop()],
  ['asset hash', s => {s.lock.assets.at(-1).localSha256='0'.repeat(64);}],
  ['asset omitted', s => s.manifest.assets.pop()],
  ['binding omitted', s => s.manifest.bindings.pop()],
  ['hash', s => {s.manifestSha256='0'.repeat(64);}],
  ['lifecycle', s => {s.publication='unreviewed';}],
  ['candidate base', s => {s.sourceCommit='a'.repeat(40);}],
]) test('A rejects drift before historical projection: '+service+'/'+name, () => {
  const wrong = consumptionSnapshot(service); change(wrong);
  assert.throws(() => validateConsumptionSnapshot(wrong), /A_CONSUMPTION/);
  const altered = file => file === snapshotPath(service) ? bytes(wrong) : read(file);
  assert.throws(() => consumptionReadView(altered)(snapshotPath(service)), /A_CONSUMPTION/);
  assert.throws(() => validateConsumptionPackage(altered), /A_CONSUMPTION/);
});
test('A refuses new and transitively draft roots even with previously generated pins', () => {
  const snapshot = consumptionSnapshot('gateway-bff');
  for (const id of ['catalog.http.public.v1', 'catalog.common.v1']) {
    const changed = structuredClone(registry);
    changed.contracts.find(row => row.id === id).status='draft';
    assert.throws(() => makeLock(root, snapshot.manifest, bytes(snapshot.manifest), changed, snapshot.lock.entries), /draft/);
  }
});
test('A public selection cannot include a private Identity authorization operation', () => {
  const snapshot = consumptionSnapshot('web-pos');
  snapshot.manifest.contracts.find(row => row.id === 'catalog.http.public.v1').operations.push('checkCatalogAuthorization');
  assert.throws(() => makeLock(root, snapshot.manifest, bytes(snapshot.manifest), registry, snapshot.lock.entries), /Unknown selected operation/);
});
test('A standalone metadata validation never proves published consumer Git provenance', () => {
  const candidate = consumptionSnapshot('gateway-bff');
  const published = {...candidate, publication:'published', sourceCommit:'a'.repeat(40)};
  validateConsumptionSnapshot(published);
  assert.throws(() => verifyLocalSnapshot(candidate, published, () => candidate), /Published consumer provenance drift/);
  assert.throws(() => verifyLocalSnapshot(candidate, published, () => {throw Error('Git unavailable');}), /Git unavailable/);
});
for (const file of ['registry/contracts.json', 'registry/consumers/index.json', '.gitlab-ci.yml', 'package.json',
  'registry/consumers/identity-tenancy.json', 'registry/consumers/catalog-pricing.json', 'registry/consumers/notifications.json',
  'catalog/http/public/v1/catalog-pricing-v1.yaml']) test('A rejects unrelated or source byte drift: '+file, () => {
  const altered = name => name === file ? Buffer.concat([read(name),Buffer.from('\n#unapproved')]) : read(name);
  assert.throws(() => validateConsumptionPackage(altered), /A_PRESERVATION|A_SOURCE_BYTES/);
});
function withCheckout(service, check) {
  const temporaryBase = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryBase,'opencomerix-f1-09a-'));
  const snapshot = consumptionSnapshot(service);
  const write = (file, value) => {
    const target = path.join(directory,file);
    fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,value);
  };
  try {
    write('contracts.manifest.json',bytes(snapshot.manifest)); write('contracts.lock.json',bytes(snapshot.lock));
    for (const asset of snapshot.lock.assets) {
      const entry = snapshot.lock.entries.find(row => row.id === asset.contractId);
      write(asset.destination,gitReader(root,entry.commit)(asset.sourcePath));
    }
    const previous = JSON.parse(source(snapshotPath(service)));
    // Standalone contracts CI has no sibling service checkout. Build only the
    // synthetic local verifier bundle and H2 binding used by this negative fixture.
    const tooling = [];
    for (const [sourcePath,destination] of [['tools/architecture/consumer-gate.mjs','.contracts/gate.mjs'],
      ['registry/manifest-v1.schema.json','.contracts/manifest-v1.schema.json'], ['registry/lock-v1.schema.json','.contracts/lock-v1.schema.json']]) {
      const content=source(sourcePath); write(destination,content); tooling.push({sourcePath,destination,sha256:sha256(content)});
    }
    write('.contracts/provenance.json',bytes({formatVersion:1,sourceRepository:'opencomerix/contracts',publication:'local-candidate',sourceBaseCommit:registry.baselineCommit,files:tooling}));
    for (const binding of previous.manifest.bindings) {
      const entry=previous.manifest.contracts.find(row=>row.id===binding.contractId&&row.role==='consumer');
      write(binding.path,binding.kind==='gateway-operation-registry'
        ? entry.operations.map(id=>"{operationId: '"+id+"'}").join('\n')
        : 'export const UI_OPERATION_CONTRACTS = Object.freeze({\n'+entry.operations.map(id=>'  '+id+': {},').join('\n')+'\n});');
    }
    for (const [file,value] of Object.entries(consumptionBindingFiles(service))) write(file,value);
    check(directory,snapshot,write);
  } finally {
    assert.equal(path.dirname(directory),temporaryBase);
    assert(path.basename(directory).startsWith('opencomerix-f1-09a-'));
    fs.rmSync(directory,{recursive:true,force:true});
  }
}
for (const service of Object.keys(ownerBases)) test('A native consumer gate checks actual copies and bindings: '+service, () => withCheckout(service,(dir,snapshot,write)=>{
  validateConsumptionCheckout(service,dir);
  const asset=snapshot.lock.assets.at(-1), original=fs.readFileSync(path.join(dir,asset.destination));
  write(asset.destination,Buffer.concat([original,Buffer.from('\n')]));
  assert.throws(()=>validateConsumer(dir),/Local asset drift/);
  write(asset.destination,original);
  const binding='.contracts/catalog/operations.mjs';
  write(binding,fs.readFileSync(path.join(dir,binding),'utf8').replace('listCatalogUnits','unknownOperation'));
  assert.throws(()=>validateConsumer(dir),/operation drift/);
}));
for (const service of Object.keys(ownerBases)) test('A consumer checkout confines changes to metadata and navigation: '+service,()=>{
  const previous=JSON.parse(source(snapshotPath(service))), candidate=consumptionSnapshot(service);
  const expectedNew=[...candidate.manifest.assets.slice(previous.manifest.assets.length).map(row=>row.destination),...Object.keys(consumptionBindingFiles(service))];
  const tracked=['README.md','contracts.manifest.json','contracts.lock.json'];
  validateConsumptionPaths(service,tracked,expectedNew);
  // Later authorized publication tracks these same exact files; it does not
  // broaden the surface or require them to remain untracked forever.
  validateConsumptionPaths(service,[...tracked,...expectedNew],[]);
  assert.throws(()=>validateConsumptionPaths(service,[...tracked,'src/main.ts'],expectedNew),/A_CONSUMER_SCOPE/);
  assert.throws(()=>validateConsumptionPaths(service,tracked,[...expectedNew,'src/unapproved.ts']),/A_CONSUMER_NEW_FILES/);
  assert.throws(()=>validateConsumptionPaths(service,tracked,expectedNew.slice(1)),/A_CONSUMER_NEW_FILES/);
});
test('A confines changes to the reviewed metadata and its historical adapters',()=>{
  const allowed=withCandidateScope(withF110ADesignScope(consumptionChangedFiles));
  for(const args of [['diff','--name-only',consumptionBase],['ls-files','--others','--exclude-standard']])
    for(const file of execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean))
      assert(allowed.has(file),'A_SCOPE:'+file);
});
