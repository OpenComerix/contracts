import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLifecycleRegistry } from '../../scripts/catalog/catalog-lifecycle-v1-registry.mjs';
import { validateRuntimeRegistry } from '../../scripts/catalog/catalog-runtime-v1-registry.mjs';
import { validateFoundationRegistry } from '../../scripts/catalog/catalog-foundation-v1-registry.mjs';
import { execFileSync } from 'node:child_process';
import { gitReader, worktreeReader, makeLock } from '../../tools/architecture/graph.mjs';
import { verifyLocalSnapshot } from '../../tools/architecture/registry.mjs';
import { root, consumerBase, ownerBases, snapshotPath, workloadConsumerSnapshot, validateWorkloadConsumer, verifyPublishedConsumer,
  consumerSnapshotView, consumerReadView, validateWorkloadConsumers, consumerChangedFiles } from '../../scripts/identity/catalog-workload-consumers-v2-registry.mjs';
import { validateOperationalSnapshot, operationalSnapshotView } from '../../scripts/catalog/catalog-operational-recovery-v1-registry.mjs';
const read = worktreeReader(root), source = gitReader(root, consumerBase), bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const registry = JSON.parse(source('registry/contracts.json'));
test('O4 requires exactly three selections and preserves the other consumers and entire registry', () => {
  assert.equal(validateWorkloadConsumers().selections, 103);
  for (const service of Object.keys(ownerBases)) {
    const actual = JSON.parse(read(snapshotPath(service))), previous = JSON.parse(source(snapshotPath(service)));
    const before = structuredClone(actual);
    validateWorkloadConsumer(actual);
    assert.deepEqual(actual.manifest.contracts.slice(0, previous.manifest.contracts.length), previous.manifest.contracts);
    assert.deepEqual(actual.lock.entries.slice(0, previous.lock.entries.length), previous.lock.entries);
    assert.deepEqual(actual.manifest.contracts.slice(previous.manifest.contracts.length).map(({id,role,version,operations,pointers})=>({id,role,version,operations,pointers})), service === 'identity-tenancy' ? [
      {id:'identity.catalog-workload-profiles.policy.v2',role:'semantic-owner',version:'2',operations:[],pointers:['']},
      {id:'identity.catalog-workload-profiles.fixtures.v2',role:'validation',version:'v2',operations:[],pointers:['']},
    ] : [{id:'identity.catalog-workload-profiles.policy.v2',role:'consumer',version:'2',operations:[],pointers:['']}]);
    assert.deepEqual(actual.lock, makeLock(root, actual.manifest, bytes(actual.manifest), registry, actual.lock.entries));
    assert.deepEqual(consumerSnapshotView(actual), previous);
    assert(consumerReadView(read)(snapshotPath(service)).equals(source(snapshotPath(service))));
    assert.deepEqual(actual, before);
    assert.equal(consumerSnapshotView(previous), previous);
    const copy=workloadConsumerSnapshot(service); copy.manifest.contracts.pop();
    assert.equal(workloadConsumerSnapshot(service).manifest.contracts.length, service==='identity-tenancy'?32:49);
  }
  assert.equal(validateOperationalSnapshot().dependencies,48);
});
for (const service of Object.keys(ownerBases)) for (const [name,change] of [
  ['omitted',s=>{s.manifest.contracts.pop();s.lock.entries.pop();}],
  ['manifest only',s=>s.lock.entries.pop()], ['lock only',s=>s.manifest.contracts.pop()],
  ['role',s=>{s.manifest.contracts.at(-1).role='producer';}],
  ['version',s=>{s.lock.entries.at(-1).version='3';}],
  ['pointer',s=>{s.manifest.contracts.at(-1).pointers=['/profiles'];}],
  ['operation',s=>s.manifest.contracts.at(-1).operations.push('issueInternalServiceToken')],
  ['source pin',s=>{s.lock.entries.at(-1).commit=consumerBase;}],
  ['closure hash',s=>{s.lock.entries.at(-1).files[0].sha256='0'.repeat(64);}],
  ['prior pin',s=>{s.lock.entries[0].commit=consumerBase;}],
  ['prior purpose',s=>{s.manifest.contracts[0].purpose+=' changed';}],
  ['duplicate',s=>s.manifest.contracts.push(structuredClone(s.manifest.contracts.at(-1)))],
  ['purpose',s=>{s.manifest.contracts.at(-1).purpose='unapproved';}],
  ['gate',s=>s.manifest.contracts.at(-1).gates.pop()],
  ['assets',s=>s.manifest.assets.push({unapproved:true})], ['binding',s=>s.manifest.bindings.push({unapproved:true})],
  ['hash',s=>{s.manifestSha256='0'.repeat(64);}], ['lifecycle',s=>{s.publication='unreviewed';}],
  ['candidate base',s=>{s.sourceCommit='a'.repeat(40);}], ['metadata',s=>{s.unapproved=true;}],
]) test('O4 rejects drift before projection '+service+'/'+name,()=>{
  const wrong=workloadConsumerSnapshot(service);change(wrong);
  assert.throws(()=>validateWorkloadConsumer(wrong),/O4_CONSUMER/);
  if ([wrong.manifest.contracts,wrong.lock.entries].some(rows=>rows.some(row=>row.id.includes('workload-profiles')&&row.id.endsWith('.v2')))) {
    assert.throws(()=>consumerSnapshotView(wrong),/O4_CONSUMER/);
    if(service==='catalog-pricing')assert.throws(()=>operationalSnapshotView(wrong),/O4_CONSUMER/);
  }
  const changed=file=>file===snapshotPath(service)?bytes(wrong):read(file);
  assert.throws(()=>validateWorkloadConsumers(changed),/O4_CONSUMER/);
  if(service==='identity-tenancy') {
    assert.throws(()=>validateFoundationRegistry(undefined, undefined, changed),/O4_CONSUMER/);
    assert.throws(()=>validateLifecycleRegistry(undefined, changed),/O4_CONSUMER/);
    assert.throws(()=>validateRuntimeRegistry(undefined, changed),/O4_CONSUMER/);
  }
});
for(const service of Object.keys(ownerBases))test('O4 published provenance requires Git evidence '+service,()=>{
  const candidate=workloadConsumerSnapshot(service), published={...candidate,publication:'published',sourceCommit:'a'.repeat(40)},reads=[];
  validateWorkloadConsumer(published);
  verifyPublishedConsumer(published,revision=>{reads.push(revision);return published;});
  assert.deepEqual(reads,[published.sourceCommit]);
  assert.throws(()=>verifyPublishedConsumer(published),/O4_CONSUMER_GIT_REQUIRED/);
  assert.throws(()=>verifyPublishedConsumer(published,()=>{throw Error('Git unavailable');}),/Git unavailable/);
  assert.throws(()=>verifyPublishedConsumer(published,()=>candidate),/Published consumer provenance drift/);
  assert.throws(()=>verifyLocalSnapshot(candidate,published,()=>({...published,sourceCommit:consumerBase})),/Published consumer provenance drift/);
});
test('O4 current package content checks retain the published lifecycle without claiming Git or CI evidence',()=>{
  const changed=file=>{const service=Object.keys(ownerBases).find(service=>snapshotPath(service)===file);return service?bytes({...workloadConsumerSnapshot(service),publication:'published',sourceCommit:'a'.repeat(40)}):read(file);};
  assert.equal(validateWorkloadConsumers(changed).selections,103);
  for(const service of Object.keys(ownerBases))assert(consumerReadView(changed)(snapshotPath(service)).equals(source(snapshotPath(service))));
});
test('O4 confines registry changes to its exact transition and historical adapters',()=>{
  const allowed=new Set(consumerChangedFiles);
  for(const args of [['diff','--name-only',consumerBase],['ls-files','--others','--exclude-standard']])for(const file of execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean))assert(allowed.has(file),'O4_CONSUMER_SCOPE:'+file);
});
