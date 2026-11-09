import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { candidate,source,root,encode,expectedRegistry,expectedIndex,validateSalesAdmission,salesHistoricalFile,salesHistoricalRegistry,historicalTest,historicalTestBytes,guardTransitionFiles,transitionBytes,salesHistoricalIndex,withSalesAdmissionScope,admissionScope } from '../../scripts/sales/inventory-step-consumer-v1.mjs';
import { publishedCandidate,publishedOwnerCommits,validateSalesSnapshot,verifyPublishedSalesSnapshot } from '../../scripts/sales/inventory-step-consumer-v1.mjs';
import { captureHistoricalFile } from '../../scripts/inventory/capture-authority-v2.mjs';
import { reuseCandidateFiles } from '../../tools/architecture/validation-history.mjs';
import { cashConsumerFiles } from '../../scripts/finance/cash-consumer-v1.mjs';
import { preparationMetadata, preparationNewFiles } from '../../scripts/sales/preparation-history-v1.mjs';
const read = file => fs.readFileSync(path.join(root,file));
for (const service of ['sales-pos','identity-tenancy']) test('published '+service+' admits only the reviewed immutable owner commit and unchanged export',()=>{
  const expected=publishedCandidate(service);
  assert.equal(expected.sourceCommit,publishedOwnerCommits[service]);
  validateSalesSnapshot(service,candidate(service));
  validateSalesSnapshot(service,expected);
  let reads=0;
  verifyPublishedSalesSnapshot(service,expected,revision=>{reads++;assert.equal(revision,publishedOwnerCommits[service]);return structuredClone(expected);});
  assert.equal(reads,1);
  for(const mutation of [{sourceCommit:'0'.repeat(40)},{publication:'unknown'},{sourceRepository:'opencomerix/unapproved'},{manifestSha256:'0'.repeat(64)}])
    assert.throws(()=>validateSalesSnapshot(service,{...expected,...mutation}),/SALES_SNAPSHOT/);
  const repinned=structuredClone(expected);repinned.lock.entries[0].commit='0'.repeat(40);
  assert.throws(()=>validateSalesSnapshot(service,repinned),/SALES_SNAPSHOT/);
  assert.throws(()=>verifyPublishedSalesSnapshot(service,expected,()=>candidate(service)),/Published consumer provenance drift/);
  assert.throws(()=>verifyPublishedSalesSnapshot(service,expected),/SALES_PUBLISHED_GIT_REQUIRED/);
  assert.throws(()=>verifyPublishedSalesSnapshot(service,candidate(service),()=>expected),/SALES_PUBLICATION/);
});
test('Sales adds only the exact six-consumer transition and one Identity profile without repinning prior selections',()=>{
  assert.deepEqual(validateSalesAdmission(),{consumers:6,salesSelections:9,identitySelections:36,preservedIdentityPins:35,runtimeDemonstrated:false});
  const before=JSON.parse(source('registry/consumers/identity-tenancy.json')),after=candidate('identity-tenancy');
  assert.equal(after.manifest.contracts.length,36);
  for(let i=0;i<36;i++)if(i!==34){assert.deepEqual(after.manifest.contracts[i],before.manifest.contracts[i]);assert.deepEqual(after.lock.entries[i],before.lock.entries[i]);}
  assert.deepEqual(after.lock.entries[34].pointers,[...before.lock.entries[34].pointers,'/profiles/4']);
  assert.equal(after.lock.entries[34].commit,before.lock.entries[34].commit);
  assert.deepEqual(expectedRegistry().contracts,JSON.parse(source('registry/contracts.json')).contracts);
  assert.deepEqual(expectedRegistry().planned,JSON.parse(source('registry/contracts.json')).planned);
  assert.equal(expectedRegistry().contracts.length,200);
  assert.equal(expectedRegistry().planned.length,2);
  assert.deepEqual(expectedIndex().consumers.slice(0,5),JSON.parse(source('registry/consumers/index.json')).consumers);
});
for(const file of ['registry/contracts.json','registry/consumers/index.json','registry/consumers/identity-tenancy.json','registry/consumers/sales-pos.json','sales/README.md',historicalTest,
  ...guardTransitionFiles,
  ...['gateway-bff','notifications','web-pos','catalog-pricing'].map(owner=>'registry/consumers/'+owner+'.json')])test('new admission refuses changed or missing '+file,()=>{
  assert.throws(()=>validateSalesAdmission(name=>name===file?Buffer.concat([read(name),Buffer.from('\nUnapproved')]):read(name)),file==='registry/consumers/catalog-pricing.json'?/SALES_PRIOR_CONSUMER/:undefined);
  assert.throws(()=>validateSalesAdmission(name=>{if(name===file)throw Error('Synthetic missing source');return read(name);}));
});
test('historical projection preserves original assertions and never sanitizes caller drift',()=>{
  for(const file of ['registry/contracts.json','registry/consumers/index.json','registry/consumers/identity-tenancy.json','sales/README.md',historicalTest]){
    assert.deepEqual(salesHistoricalFile(file,read(file)),source(file));
    const wrong=Buffer.concat([read(file),Buffer.from('wrong')]);assert.equal(salesHistoricalFile(file,wrong),wrong);
  }
  assert.deepEqual(salesHistoricalRegistry(expectedRegistry()),JSON.parse(source('registry/contracts.json')));
  const wrong=expectedRegistry();wrong.requiredConsumers.push('unapproved');assert.equal(salesHistoricalRegistry(wrong),wrong);
  assert.deepEqual(read(historicalTest),historicalTestBytes());
  for(const file of guardTransitionFiles){
    assert.deepEqual(captureHistoricalFile(file,read(file)),transitionBytes(file));
    assert.deepEqual(salesHistoricalFile(file,read(file)),source(file));
  }
  assert.deepEqual(salesHistoricalIndex(expectedIndex()),JSON.parse(source('registry/consumers/index.json')));
  const alteredIndex=expectedIndex();alteredIndex.consumers.pop();assert.equal(salesHistoricalIndex(alteredIndex),alteredIndex);
  const scope=withSalesAdmissionScope(['preserved-path']);assert(scope.has('preserved-path'));
  assert.deepEqual([...scope].sort(),[...new Set(['preserved-path',...admissionScope,...reuseCandidateFiles,...cashConsumerFiles,...preparationMetadata().keys(),...preparationNewFiles])].sort());
  assert(!scope.has('scripts/unapproved.mjs'));
});

test('Sales scope rejects changed or missing H1A policy after warmup',t=>{
  withSalesAdmissionScope([]);
  const target=path.join(root,'identity/http/shared/v2/identity-workload-token-reuse-policy-v2.json');
  const original=fs.readFileSync.bind(fs);
  let change;
  t.mock.method(fs,'readFileSync',(file,...options)=>{
    if(typeof file==='string'&&path.resolve(file)===target){
      if(change==='missing')throw Error('Synthetic missing H1A policy');
      if(change==='changed')return Buffer.concat([original(file,...options),Buffer.from('\nUnapproved')]);
    }
    return original(file,...options);
  });
  for(change of ['changed','missing'])assert.throws(()=>withSalesAdmissionScope([]));
  change=undefined;
  assert.doesNotThrow(()=>withSalesAdmissionScope([]));
});
test('all Sales runtime assets are exact Git bytes and scoped to its transport',()=>{
  const snapshot=candidate('sales-pos');
  assert.equal(snapshot.manifest.contracts.find(row=>row.id==='sales.inventory-step-authority.http.v1').role,'producer');
  assert.deepEqual(snapshot.manifest.contracts.find(row=>row.id==='identity.inventory-authority.policy.v1').pointers,['/profiles/4','/issuance']);
  for(const row of snapshot.lock.assets){
    assert(row.destination.startsWith('src/modules/sale-process/transport/contracts/'));
    assert.equal(row.localSha256,row.sourceSha256);
    assert.equal(row.representation,'exact');
  }
  const expanded=candidate('sales-pos');expanded.manifest.contracts.push(structuredClone(expanded.manifest.contracts[0]));
  assert.throws(()=>validateSalesAdmission(file=>file==='registry/consumers/sales-pos.json'?encode(expanded):read(file)),/SALES_SNAPSHOT/);
});
