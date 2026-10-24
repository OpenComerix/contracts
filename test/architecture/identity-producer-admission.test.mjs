import assert from 'node:assert/strict';
import { consumptionReadView } from '../../scripts/catalog/catalog-consumption-v1-registry.mjs';
import { consumerSnapshotView } from '../../scripts/identity/catalog-workload-consumers-v2-registry.mjs';
import test from 'node:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { readJSON,sha256 } from '../../tools/architecture/consumer-gate.mjs';
import { gitReader,makeLock } from '../../tools/architecture/graph.mjs';
import { foundationBase,foundationRegistryView } from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const previous='e3f39131b32ed136b17acea0a3289fad718029d6';
const file='registry/consumers/identity-tenancy.json';
const prior=JSON.parse(gitReader(root,previous)(file));
const current=consumerSnapshotView(readJSON(root,file)),registry=readJSON(root,'registry/contracts.json');
const addedIds=[
  "identity.catalog-authority.v1",
  "identity.catalog-authority.v1.schema",
  "catalog.security-policy.v1",
  "identity.catalog-authority-v1-fixtures",
  "identity.catalog-authority-semantic-v1-fixtures",
  "identity.catalog-recovery-authority.v1",
  "identity.catalog-recovery-authority.v1.schema",
  "identity.catalog-recovery-authority-v1-fixtures",
  "common.error-catalog.v8",
  "identity.catalog-recovery-verification.http.v2",
  "identity.catalog-recovery-verification.schema.v2",
  "identity.catalog-recovery-verification.policy.v2",
  "identity.catalog-recovery-verification.fixtures.v2",
  "identity.catalog-history-permissions.http.v1",
  "identity.catalog-history-permissions.schema.v1",
  "identity.catalog-history-permissions.policy.v1",
  "identity.catalog-history-permissions.fixtures.v1",
  "identity.catalog-workload-profiles.policy.v1",
  "identity.catalog-workload-profiles.fixtures.v1",
  "identity.catalog-recovery-renewal.http.v2",
  "identity.catalog-recovery-renewal.schema.v2",
  "identity.catalog-recovery-renewal.policy.v2",
  "identity.catalog-recovery-renewal.fixtures.v2"
];
test('F1-08I changes only the selected identity admission and preserves its previous seven entries',()=>{
 assert.equal(current.sourceRepository,'opencomerix/identity-tenancy');
 assert(['local-candidate','published'].includes(current.publication));
 assert.deepEqual(current.manifest.contracts.slice(0,7),prior.manifest.contracts);
 assert.deepEqual(current.lock.entries.slice(0,7),prior.lock.entries);
 assert.deepEqual(current.manifest.contracts.slice(7).map(x=>x.id),addedIds);
 for(const entry of current.manifest.contracts.slice(7)){
  const descriptor=registry.contracts.find(x=>x.id===entry.id);
  assert(descriptor&&descriptor.status==='active',entry.id);
  assert.equal(entry.version,descriptor.version);
  assert.equal(entry.role,descriptor.operations.length?'producer':'validation');
  assert.deepEqual(entry.operations,descriptor.operations);
  assert.deepEqual(entry.pointers,descriptor.operations.length?[]:['']);
  assert.deepEqual(entry.gates,['pnpm contracts:metadata','pnpm test:all']);
 }
 assert.deepEqual(current.manifest.assets,[]);
 assert.deepEqual(current.manifest.bindings,[]);
 const bytes=Buffer.from(JSON.stringify(current.manifest,null,2)+'\n');
 assert.equal(current.manifestSha256,sha256(bytes));
 const lock=makeLock(root,current.manifest,bytes,registry,current.lock.entries);
 assert.deepEqual(current.lock,lock);
 assert.equal(current.lockSha256,sha256(JSON.stringify(lock,null,2)+'\n'));
});
test('F1-08I preserves the other three consumers, coverage index and all source descriptors',()=>{
 for(const file of ['registry/consumers/index.json',...['gateway-bff','notifications','web-pos'].map(x=>'registry/consumers/'+x+'.json')]){
  const actual=file==='registry/consumers/index.json' ? gitReader(root,foundationBase)(file).toString('utf8')
    : consumptionReadView(name=>readFileSync(path.join(root,name)))(file).toString('utf8').replaceAll('\r\n','\n');
  assert.equal(actual,gitReader(root,previous)(file).toString('utf8'),file);
 }
 assert.deepEqual(foundationRegistryView(registry),JSON.parse(gitReader(root,previous)('registry/contracts.json')));
});
