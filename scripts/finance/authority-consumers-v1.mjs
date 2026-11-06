import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gitReader, makeLock } from '../../tools/architecture/graph.mjs';

const root = path.resolve(import.meta.dirname, '../..');
export const authorityConsumerBase = '74f63a87ac30d3ad6dc5f874b4b769c44cea3e55';
const base = gitReader(root, authorityConsumerBase);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n');
const native = file => fs.readFileSync(path.join(root, file));
const purpose = 'F1-12A Finance human authority and exact persisted Sales cash step; no Finance effects or full sale coordinator.';
const publishedOwnerCommits = {
  'identity-tenancy': 'c206dc39c201a5ff57a946f073dd9e3cb9317b8a',
  'sales-pos': 'b6407da6e3367a6dffd138f667175d4cf57ff9ad',
};
let cached;
export const authorityConsumerFiles=Object.freeze(['scripts/finance/authority-consumers-v1.mjs','test/finance/authority-consumers-v1.test.mjs','scripts/inventory/delivery-history-consumer-v1.mjs','scripts/sales/inventory-step-consumer-v1.mjs','registry/consumers/identity-tenancy.json','registry/consumers/sales-pos.json']);
function bridges() {
  const changes=new Map();
  let delivery=text(base('scripts/inventory/delivery-history-consumer-v1.mjs'));
  delivery=delivery.replace("import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';","import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';\nimport {authorityConsumerHistoricalFile,authorityConsumerHistoricalSnapshot,authorityConsumerReadView} from '../finance/authority-consumers-v1.mjs';");
  delivery=delivery.replace('export function deliveryHistoryHistoricalFile(name,bytes){return','export function deliveryHistoryHistoricalFile(name,bytes){bytes=authorityConsumerHistoricalFile(name,bytes);return').replace('export function deliveryHistoryHistoricalSnapshot(value){return','export function deliveryHistoryHistoricalSnapshot(value){value=authorityConsumerHistoricalSnapshot(value);return').replace('export function validateDeliveryHistoryConsumer(read=native){','export function validateDeliveryHistoryConsumer(read=native){\n const authorityRead=authorityConsumerReadView(read);read=name=>{try{return authorityRead(name);}catch(cause){throw new Error(\'IEH_SOURCE_DRIFT\',{cause});}};');
  changes.set('scripts/inventory/delivery-history-consumer-v1.mjs',Buffer.from(delivery));
  const sales="import {withAuthorityConsumerScope,authorityConsumerFiles} from '../finance/authority-consumers-v1.mjs';\n"+text(base('scripts/sales/inventory-step-consumer-v1.mjs')).replace('...sourceFiles])];','...sourceFiles,...authorityConsumerFiles])];').replace('return new Set([...paths,...admissionScope]);','return withAuthorityConsumerScope([...paths,...admissionScope]);');
  changes.set('scripts/sales/inventory-step-consumer-v1.mjs',Buffer.from(sales));
  return changes;
}
function model() {
  if (cached) return cached;
  const registry = JSON.parse(base('registry/contracts.json'));
  const previous = new Map(), snapshots = new Map(), closures = new Map();
  for (const service of Object.keys(publishedOwnerCommits)) {
    const file = 'registry/consumers/' + service + '.json', before = JSON.parse(base(file));
    previous.set(file, before);
    const manifest = structuredClone(before.manifest);
    const gates = service === 'identity-tenancy'
      ? ['pnpm contracts:metadata', 'pnpm test:all', 'pnpm test:finance-authority-runtime']
      : ['pnpm contracts:metadata', 'pnpm test:cov', 'pnpm test:integration', 'pnpm test:process-authority-runtime'];
    const add = (id, role, operations = [], pointers = []) => {
      const descriptor = registry.contracts.find(row => row.id === id);
      assert.equal(descriptor?.status, 'active', 'FCA_ADMISSION:' + id);
      const previous = manifest.contracts.find(row => row.id === id && row.role === role);
      if (previous) {
        assert.equal(id,'identity.inventory-authority.policy.v1','FCA_DUPLICATE_SELECTION');
        previous.pointers = [...new Set([...previous.pointers,...pointers])];
        return;
      }
      manifest.contracts.push({ id, role, version: descriptor.version, operations, pointers, purpose, gates });
    };
    if (service === 'identity-tenancy') {
      add('identity.finance-authority.http.v1', 'producer', ['createFinanceDelegation', 'checkFinanceAuthorization']);
      add('identity.finance-authority.schema.v1', 'validation', [], ['']);
      add('identity.finance-authority.policy.v1', 'semantic-owner', [], ['']);
    } else {
      add('sales.finance-step-authority.http.v1', 'producer', ['authorizeSaleProcessStep']);
      add('sales.finance-step-authority.schema.v1', 'validation', [], ['']);
      add('finance.record-sale-cash.v1', 'producer', [], ['']);
      add('finance.record-sale-cash.result.v1', 'validation', [], ['']);
      add('finance.types.v1', 'validation', [], ['/$defs/Context', '/$defs/CashAmounts', '/$defs/StockEvidence']);
      add('identity.finance-authority.policy.v1', 'consumer', [], ['/profiles/2', '/issuance']);
      add('identity.inventory-authority.policy.v1', 'consumer', [], ['/profiles/5', '/issuance']);
      add('identity.internal-auth.v1', 'consumer', ['issueInternalServiceToken', 'getInternalIdentityJwks']);
      add('inventory.http.private.v1', 'consumer', ['getInventorySaleStockResult']);
      add('inventory.types.v1', 'validation', [], ['/$defs/SaleStockResult']);
    }
    // First resolve exactly the approved selections, then add only their required runtime copies.
    const provisional = makeLock(root, manifest, encode(manifest), registry, before.lock.entries);
    if (service === 'sales-pos') {
      const existing = new Set(manifest.assets.map(asset => asset.destination));
      for (const entry of provisional.entries.slice(before.lock.entries.length)) {
        for (const source of entry.files) {
          const destination = 'src/modules/sale-process/transport/contracts/' + source.path;
          if (existing.has(destination)) continue;
          existing.add(destination);
          manifest.assets.push({ contractId: entry.id, sourcePath: source.path, destination, representation: 'exact', purpose: 'runtime' });
        }
      }
    }
    const manifestBytes = encode(manifest), lock = makeLock(root, manifest, manifestBytes, registry, before.lock.entries);
    for(const asset of lock.assets) {
      const previous=before.lock.assets.find(row=>row.destination===asset.destination);
      if(previous) {
        for(const [key,value]of Object.entries(asset))assert.deepEqual(value,previous[key],'FCA_PRIOR_ASSET');
        asset.localSha256=previous.localSha256;
      } else asset.localSha256=asset.sourceSha256;
    }
    for (let index = 0; index < before.lock.entries.length; index++) {
      const previous=before.lock.entries[index],next=lock.entries[index];
      if (service==='sales-pos' && previous.id==='identity.inventory-authority.policy.v1') {
        for (const key of ['commit','tag','tagObject','root','files']) assert.deepEqual(next[key],previous[key],'FCA_PRIOR_PIN');
        for (const unit of previous.units) assert(next.units.some(candidate=>isDeepStrictEqual(candidate,unit)),'FCA_PRIOR_UNIT');
      } else assert.deepEqual(next,previous,'FCA_PRIOR_PIN');
    }
    for (const entry of lock.entries) for (const source of entry.files) {
      const bytes = gitReader(root, entry.commit)(source.path);
      if (closures.has(source.path)) assert.equal(text(closures.get(source.path)), text(bytes), 'FCA_SOURCE_COLLISION');
      closures.set(source.path, bytes);
    }
    snapshots.set(file, { ...before, publication: 'published', sourceCommit: publishedOwnerCommits[service], manifestSha256: hash(manifestBytes), lockSha256: hash(encode(lock)), manifest, lock });
  }
  const unchanged = new Map(JSON.parse(base('registry/consumers/index.json')).consumers
    .map(row => 'registry/consumers/' + row.file).filter(file => !snapshots.has(file))
    .map(file => [file, base(file)]));
  cached = { snapshots, previous, closures, unchanged, bridges:bridges() };
  return cached;
}
export const authorityConsumerMetadata = () => new Map([...model().snapshots].map(([file, value]) => [file, encode(value)]));
export function validateAuthorityConsumers(read = native) {
  for(const [file,bytes]of model().bridges)assert.equal(text(read(file)),text(bytes),'FCA_EXACT_BRIDGE:'+file);
  for (const [file, snapshot] of model().snapshots)
    assert.equal(text(read(file)), text(encode(snapshot)), 'FCA_EXACT_METADATA:' + file);
  for (const file of ['registry/contracts.json', 'registry/consumers/index.json'])
    assert.equal(text(read(file)), text(base(file)), 'FCA_REGISTRY_COVERAGE:' + file);
  for (const [file, bytes] of [...model().unchanged, ...model().closures])
    assert.equal(text(read(file)), text(bytes), 'FCA_SOURCE_DRIFT:' + file);
  return { consumers: 2, previousPinsPreserved: true, publication: 'published', runtimeDemonstrated: false };
}
// Pure historical projections recognize only the exact approved delta. Full
// source validation belongs to validateAuthorityConsumers/read-view/scope,
// rather than being repeated for every file in each nested historical reader.
export function authorityConsumerHistoricalFile(file, bytes) {
  const bridge=model().bridges.get(file);
  if(bridge&&text(bytes)===text(bridge))return base(file);
  const expected = model().snapshots.get(file);
  if (!expected || text(bytes) !== text(encode(expected))) return bytes;
  return encode(model().previous.get(file));
}
export function authorityConsumerHistoricalSnapshot(value) {
  const file = 'registry/consumers/' + value?.manifest?.service + '.json';
  if (!isDeepStrictEqual(value, model().snapshots.get(file))) return value;
  return structuredClone(model().previous.get(file));
}
export function authorityConsumerReadView(read = native) {
  let checked = false;
  return file => {
    const bytes = read(file), expected = model().snapshots.get(file),bridge=model().bridges.get(file);
    if ((!expected || text(bytes) !== text(encode(expected)))&&(!bridge||text(bytes)!==text(bridge))) return bytes;
    if (!checked) { validateAuthorityConsumers(read); checked = true; }
    return bridge?base(file):encode(model().previous.get(file));
  };
}
export function withAuthorityConsumerScope(paths) {validateAuthorityConsumers();return new Set([...paths,...authorityConsumerFiles]);}
export function writeAuthorityConsumers() {
  for (const [file, snapshot] of model().snapshots) {
    const directory = path.resolve(root, '../../services', snapshot.manifest.service);
    for (const [name, value] of [['contracts.manifest.json', snapshot.manifest], ['contracts.lock.json', snapshot.lock]])
      fs.writeFileSync(path.join(directory, name), encode(value));
    for (const asset of snapshot.manifest.assets) {
      const target = path.join(directory, asset.destination);
      // Existing assets and pins are preserved byte-for-byte, never reformatted.
      if (model().previous.get(file).manifest.assets.some(previous => previous.destination === asset.destination)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, model().closures.get(asset.sourcePath));
    }
    fs.writeFileSync(path.join(root, file), encode(snapshot));
  }
  return validateAuthorityConsumers();
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  assert(process.argv.length === 3 && process.argv[2] === '--write', 'Explicit --write required');
  console.log(JSON.stringify(writeAuthorityConsumers()));
}
