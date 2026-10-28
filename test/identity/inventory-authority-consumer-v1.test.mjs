import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryConsumerSnapshot, validateInventoryConsumer, validateInventoryConsumerPackage,
  inventoryConsumerReadView, inventoryConsumerHistoricalFile, consumerSource, consumerPath,
  rawConsumerRead, consumerFiles, producerTestPath, producerTestBytes,
  publishedOwnerCommit, verifyPublishedInventoryConsumer } from '../../scripts/identity/inventory-authority-consumer-v1.mjs';
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

test('Identity alone adds the exact four selections and keeps all 32 pins and coverage intact', () => {
  const before = JSON.parse(consumerSource(consumerPath)), next = inventoryConsumerSnapshot();
  assert.deepEqual(validateInventoryConsumerPackage(), { service: 'identity-tenancy', prior_preserved: 32,
    added: 4, selections: 36, runtime_demonstrated: false, publication: JSON.parse(rawConsumerRead(consumerPath)).publication });
  assert.deepEqual(next.manifest.contracts.slice(0,32), before.manifest.contracts);
  assert.deepEqual(next.lock.entries.slice(0,32), before.lock.entries);
  assert.deepEqual(next.manifest.assets, before.manifest.assets);
  assert.deepEqual(next.manifest.bindings, before.manifest.bindings);
  assert.deepEqual(next.lock.entries.slice(32).map(({id,role,commit}) => ({id,role,commit})), [
    {id:'identity.inventory-authority.http.v1-1',role:'producer',commit:'0bff3a242784599c400875f37e1c2d3ef64f4538'},
    ...[['identity.inventory-authority.schema.v1','validation'],['identity.inventory-authority.policy.v1','semantic-owner'],['common.error-catalog.v9','validation']]
      .map(([id,role])=>({id,role,commit:'7cd2b548fb909c5eff47d0319c162c498ee68e92'})),
  ]);
  assert(next.lock.entries[34].pointers.includes('/profiles/0'));
  assert(!next.lock.entries[34].pointers.includes(''));
});
for (const [name, mutate] of [
  ['old pin', s => {s.lock.entries[0].commit = 'f'.repeat(40);}],
  ['prior selection', s => {s.manifest.contracts[0].role = 'consumer';}],
  ['new role', s => {s.manifest.contracts[32].role = 'consumer';}],
  ['operation omission', s => {s.manifest.contracts[32].operations.pop();}],
  ['profile expansion', s => {s.manifest.contracts[34].pointers.push('/profiles/1');}],
  ['missing selection', s => {s.manifest.contracts.pop();}],
  ['extra selection', s => {s.manifest.contracts.push(structuredClone(s.manifest.contracts[32]));}],
  ['source', s => {s.lock.entries[32].commit = s.lock.entries[0].commit;}],
  ['closure hash', s => {s.lock.entries[32].files[0].sha256 = '0'.repeat(64);}],
  ['omitted closure', s => {s.lock.entries[32].files.pop();}],
  ['forged publication', s => {s.publication = 'published';}],
  ['owner', s => {s.sourceRepository = 'opencomerix/inventory';}],
]) test('consumer transition refuses ' + name, () => {
  const snapshot=inventoryConsumerSnapshot();mutate(snapshot);
  assert.throws(()=>validateInventoryConsumer(snapshot), /IA11C_EXACT_SNAPSHOT/);
  const read=file=>file===consumerPath?encode(snapshot):rawConsumerRead(file);
  assert.throws(()=>validateInventoryConsumerPackage(read), /IA11C_EXACT_SNAPSHOT/);
  assert.throws(()=>inventoryConsumerReadView(read)('identity/README.md'), /IA11C_EXACT_SNAPSHOT/);
});
for (const file of [producerTestPath,'identity/README.md','registry/README.md','registry/contracts.json','identity/index.json',
  '.gitlab-ci.yml','pnpm-lock.yaml','registry/consumers/index.json',
  'registry/consumers/gateway-bff.json','registry/consumers/catalog-pricing.json',
  'registry/consumers/notifications.json','registry/consumers/web-pos.json',
  ...new Set(inventoryConsumerSnapshot().lock.entries.slice(32).flatMap(row=>row.files.map(file=>file.path)))]) {
  test('consumer package retains complete source and rejects altered/missing ' + file, () => {
    assert.throws(()=>validateInventoryConsumerPackage(name=>name===file?Buffer.concat([rawConsumerRead(name),Buffer.from('\nUnapproved')]):rawConsumerRead(name)), /IA11C_MAP|IA11C_UNCHANGED|IA11C_TRANSPORT|IA11C_TEST_TRANSITION/);
    assert.throws(()=>validateInventoryConsumerPackage(name=>{if(name===file)throw Error('Synthetic missing input');return rawConsumerRead(name);}),/Synthetic missing input/);
  });
}
test('historical view checks the full transition and never repairs caller drift', () => {
  const read=inventoryConsumerReadView();
  for(const file of [consumerPath,'identity/README.md','registry/README.md',producerTestPath])
    assert.deepEqual(read(file),consumerSource(file));
  const content=rawConsumerRead(consumerPath), drift=Buffer.concat([content,Buffer.from('\nUnapproved')]);
  assert.deepEqual(inventoryConsumerHistoricalFile(consumerPath,content),consumerSource(consumerPath));
  assert.equal(inventoryConsumerHistoricalFile(consumerPath,drift),drift);
  assert.equal(consumerFiles.length,4);
});

test('historical producer assertions and pins survive exactly; mutated tests are never projected', () => {
  assert.deepEqual(rawConsumerRead(producerTestPath).toString('utf8').replaceAll('\r\n','\n'),producerTestBytes().toString('utf8'));
  const original=consumerSource(producerTestPath).toString('utf8');
  const drift=Buffer.from(producerTestBytes().toString('utf8').replace('assert.equal(current.sourceRepository', 'assert.notEqual(current.sourceRepository'));
  const read=file=>file===producerTestPath?drift:rawConsumerRead(file);
  assert.throws(()=>inventoryConsumerReadView(read)(producerTestPath),/IA11C_TEST_TRANSITION/);
  assert.throws(()=>inventoryConsumerReadView(read)(consumerPath),/IA11C_TEST_TRANSITION/);
  assert.equal(inventoryConsumerHistoricalFile(producerTestPath,drift),drift);
  assert(original.includes("const previous='e3f39131b32ed136b17acea0a3289fad718029d6'"));
});

test('published export admits only the exact reviewed owner commit and requires immutable Git evidence', () => {
  const snapshot = { ...inventoryConsumerSnapshot(), publication: 'published', sourceCommit: publishedOwnerCommit };
  assert.equal(validateInventoryConsumer(snapshot).publication, 'published');
  assert.throws(() => verifyPublishedInventoryConsumer(snapshot), /IA11C_PUBLISHED_GIT_REQUIRED/);
  assert.throws(() => verifyPublishedInventoryConsumer(inventoryConsumerSnapshot(), () => snapshot), /IA11C_PUBLICATION/);
  let reads = 0;
  verifyPublishedInventoryConsumer(snapshot, revision => { reads++; assert.equal(revision,publishedOwnerCommit); return structuredClone(snapshot); });
  assert.equal(reads,1);
  assert.throws(() => verifyPublishedInventoryConsumer(snapshot, () => { throw Error('Synthetic missing Git source'); }), /Synthetic missing Git source/);
  assert.throws(() => verifyPublishedInventoryConsumer(snapshot, () => ({ ...snapshot, lockSha256:'0'.repeat(64) })), /Published consumer provenance drift/);
  for (const mutate of [
    s => {s.sourceCommit='f'.repeat(40);}, s => {s.sourceCommit=inventoryConsumerSnapshot().sourceCommit;},
    s => {s.manifest.contracts[0].role='consumer';}, s => {s.lock.entries[0].commit='f'.repeat(40);},
    s => {s.lock.entries[32].files.pop();}, s => {s.lockSha256='0'.repeat(64);},
  ]) {
    const changed=structuredClone(snapshot);mutate(changed);
    assert.throws(() => validateInventoryConsumer(changed), /IA11C_EXACT_SNAPSHOT/);
    assert.throws(() => verifyPublishedInventoryConsumer(changed, () => changed), /IA11C_EXACT_SNAPSHOT/);
    assert.throws(() => inventoryConsumerReadView(file => file===consumerPath?encode(changed):rawConsumerRead(file))(consumerPath),/IA11C_EXACT_SNAPSHOT/);
  }
});
