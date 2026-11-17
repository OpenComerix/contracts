import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import tooling from '../../tools/architecture/validation-tooling.json' with {type:'json'};
import {projectBrowserReadsFile,projectBrowserReadsDocument,withBrowserReadsScope} from '../finance/browser-reads-v1.mjs';

const root=path.resolve(import.meta.dirname,'../..');
export const operationalConsumersBase='c7364039f0b770f046c05eaaaca56661961dfb47';
const source=createGitReader()(root,operationalConsumersBase);
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(text(bytes)).digest('hex');
const native=file=>readFileSync(path.join(root,file));
// Captured from immutable producer commits after exact SHA/ref CI, not the worktree.
const published=Object.freeze({
  'identity-tenancy':Object.freeze({revision:'4f0604a066d96c3e0094a350fca1f0c0584c5842',
    snapshot:'f414f2dd4ecbf604b85e512bf5591ef3c351efd5c464d4094b7d20ae35533cef',
    manifest:'6fc7ab8430069abf08808581553fab09666edb8c74067ed43c14c52a9072242f',
    lock:'7e405d3a53f65d23746425bcd852a847ab74716e1071a6cb3dc358b63f1fd2f3',pins:45,assets:0,registryPins:41,registryAssets:0,
    previousRevision:'00460a720f9287ffc51986485133386f11200ec2',
    previousManifest:'6b84daa6de8bb8d58f145e3f73bfe78808f201ba5253b54ebbfbe45a179c0f98',
    previousLock:'c23d39a062430143161ea3a3c975c91e590a0185ec4fd46b9ce150d06fe0e866'}),
  finance:Object.freeze({revision:'4a1b1ada41761b4e27482ca61722a0af78050b85',
    snapshot:'3aac21156784b2dec563af755275b30cea3345e2e55a04a16ce2aa5be5b207aa',
    manifest:'c2b92c3064c00aba8f5346027565d0fb7a7d2cf319a481990a0f182e42034f40',
    lock:'7f6c33903dc6189087dd276a3d67f9b1259dc8b7f7ec47267874acd87a3dfb13',pins:20,assets:36,registryPins:17,registryAssets:32,
    previousRevision:'9a483dafee6363658e6e1c3e4deadd6a665de327',
    previousManifest:'b8462b9b6044059c58a0f446728e495834bbf7141eb0e28741758c43bc1ba431',
    previousLock:'747ecc0ddbb97b8f27e791748f4a03fc820ae4ec29c6ea297e10517cee6fcd6d'}),
  'gateway-bff':Object.freeze({revision:'1bac15076e7e9338b1176996c3a417d7e7b21802',
    snapshot:'1fbf91e07ae2cf71daaf7d0376e0e8fb38a0955181d01b7ab466ecfb50036b88',
    manifest:'4b4d0fda604cc701b3e4571d936a4c3df91e034b42c6c9283d1bb03f1be50107',
    lock:'d9df550ab39be3d5feb002c4a2c92ce7d64c75076e120423815eb07b416a5962',pins:17,assets:160,registryPins:17,registryAssets:160,
    previousRevision:'08a3f340c03e0463f0b94627e1a7249d17ae476c',
    previousManifest:'cf969de4c3e99a53729355b14a087f1c8135793371d8b43b383fdc5b78731dd7',
    previousLock:'72ed16de6aaf3bdb60aa353a985dccba6a04211b75cb4aea0e382fe524db2c41'}),
});
export const operationalConsumerFiles=Object.freeze(Object.keys(published).map(owner=>'registry/consumers/'+owner+'.json'));
const ownerFor=file=>operationalConsumerFiles.includes(file)?path.posix.basename(file,'.json'):undefined;
const selections={
  'identity-tenancy':[
    ['identity.f1-14a.public.identity-operational-options-v1','semantic-owner',['listOperationalOptions']],
    ['identity.f1-14a.private.identity-operational-options-v1','producer',['listOperationalOptions']],
    ['identity.f1-14a.shared.identity-operational-options-v1','validation',[]],
    ['identity.f1-14a.private.identity-finance-operational-authority-v1','producer',['createFinanceOperationalDelegation','checkFinanceOperationalAuthorization']],
    ['identity.f1-14a.shared.identity-finance-operational-authority-v1','validation',[]],
    ['identity.f1-14a.shared.identity-operational-context-policy-v1','validation',[]],
  ],
  finance:[
    ['finance.f1-14a.public.finance-open-shift-v1','semantic-owner',['getOpenCashShift']],
    ['finance.f1-14a.private.finance-open-shift-v1','producer',['getOpenCashShift']],
    ['finance.f1-14a.shared.finance-open-shift-v1','validation',[]],
    ['identity.f1-14a.private.identity-finance-operational-authority-v1','consumer',['checkFinanceOperationalAuthorization']],
    ['identity.f1-14a.shared.identity-finance-operational-authority-v1','validation',[]],
    ['identity.f1-14a.shared.identity-operational-context-policy-v1','validation',[]],
  ],
};
const previous=new Map(operationalConsumerFiles.map(file=>[file,JSON.parse(source(file))]));

function validateSnapshot(file,bytes,label){
  const owner=ownerFor(file),pin=published[owner];assert(pin,label+':UNKNOWN');
  assert.equal(hash(bytes),pin.snapshot,label+':'+file);
  const value=JSON.parse(text(bytes)),old=previous.get(file);
  assert.equal(value.publication,'published',label+':LIFECYCLE');
  assert.equal(value.sourceCommit,pin.revision,label+':REVISION');
  assert.equal(value.sourceRepository,'opencomerix/'+owner,label+':OWNER');
  assert.equal(value.manifest.service,owner,label+':SERVICE');
  assert.equal(hash(encode(value.manifest)),pin.manifest,label+':MANIFEST');
  assert.equal(value.manifestSha256,pin.manifest,label+':MANIFEST_HASH');
  assert.equal(hash(encode(value.lock)),pin.lock,label+':LOCK');
  assert.equal(value.lockSha256,pin.lock,label+':LOCK_HASH');
  assert.equal(value.lock.manifestSha256,pin.manifest,label+':ADMISSION');
  assert.equal(old.lock.entries.length,pin.registryPins,label+':BASE_PINS');
  assert.equal(old.lock.assets.length,pin.registryAssets,label+':BASE_ASSETS');
  assert.deepEqual(value.manifest.contracts.slice(0,pin.registryPins),old.manifest.contracts,label+':PREVIOUS_SELECTIONS');
  assert.deepEqual(value.lock.entries.slice(0,pin.registryPins),old.lock.entries,label+':PREVIOUS_PINS');
  assert.deepEqual(value.manifest.assets.slice(0,pin.registryAssets),old.manifest.assets,label+':PREVIOUS_ASSETS');
  assert.deepEqual(value.lock.assets.slice(0,pin.registryAssets),old.lock.assets,label+':PREVIOUS_ASSET_HASHES');
  if(owner==='gateway-bff'){
    // C's complete published snapshot is pinned above. Preserve the admitted
    // H2/Catalog prefix while recognizing only its 21 selections and 38 copies.
    assert.equal(old.sourceCommit,pin.previousRevision,label+':BASE_REVISION');
    assert.equal(old.manifestSha256,pin.previousManifest,label+':BASE_MANIFEST');
    assert.equal(old.lockSha256,pin.previousLock,label+':BASE_LOCK');
    assert.equal(value.lock.entries.length,38,label+':ADDITIONS');
    assert.equal(value.manifest.assets.length,198,label+':ASSETS');
    assert.equal(value.lock.assets.length,198,label+':ASSET_ADMISSION');
    assert.deepEqual(value.manifest.bindings.slice(0,old.manifest.bindings.length),old.manifest.bindings,label+':PREVIOUS_BINDINGS');
    assert.equal(value.manifest.bindings.length,18,label+':BINDINGS');
    return {service:owner,previousPins:17,registryPreviousPins:17,carriedSelections:0,additions:21,assets:198,publication:value.publication};
  }
  // The registry lagged the already published pre-B producers by four/three
  // selections. Preserve that complete producer baseline as well as A's prefix.
  const priorManifest={...value.manifest,contracts:value.manifest.contracts.slice(0,pin.pins),assets:value.manifest.assets.slice(0,pin.assets)};
  assert.equal(hash(encode(priorManifest)),pin.previousManifest,label+':PREVIOUS_PRODUCER_MANIFEST');
  const priorLock={...value.lock,manifestSha256:pin.previousManifest,entries:value.lock.entries.slice(0,pin.pins),assets:value.lock.assets.slice(0,pin.assets)};
  assert.equal(hash(encode(priorLock)),pin.previousLock,label+':PREVIOUS_PRODUCER_LOCK');
  assert.equal(value.lock.entries.length,pin.pins+6,label+':ADDITIONS');
  assert.deepEqual(value.manifest.contracts.slice(pin.pins).map(row=>[row.id,row.role,row.operations]),selections[owner],label+':SELECTIONS');
  assert.equal(value.manifest.assets.length,pin.assets+(owner==='finance'?6:0),label+':ASSETS');
  assert.equal(value.lock.assets.length,value.manifest.assets.length,label+':ASSET_ADMISSION');
  for(const row of value.lock.entries.slice(pin.pins))assert.equal(row.commit,'362d9fc3ee816d08bc541a0f93fe2907f2f8d764',label+':SOURCE');
  return {service:owner,previousPins:pin.pins,registryPreviousPins:pin.registryPins,carriedSelections:pin.pins-pin.registryPins,additions:6,assets:value.lock.assets.length,publication:value.publication};
}
export function validateOperationalConsumers(read=native,label='OPERATIONAL_CONSUMER_BYTES'){
  return operationalConsumerFiles.map(file=>validateSnapshot(file,projectBrowserReadsFile(file,read(file)),label));
}
// A supplied value proves only itself. These projections never read live files,
// validate another input, or turn an altered/partial value into a historical one.
export function projectOperationalConsumerFile(file,bytes){
  bytes=projectBrowserReadsFile(file,bytes);
  const owner=ownerFor(file);if(!owner)return bytes;
  try{return hash(bytes)===published[owner].snapshot?source(file):bytes;}catch{return bytes;}
}
export function projectOperationalConsumerDocument(file,value){
  value=projectBrowserReadsDocument(file,value);
  const owner=ownerFor(file);if(!owner)return value;
  try{const bytes=encode(value);return isDeepStrictEqual(value,JSON.parse(bytes))&&hash(bytes)===published[owner].snapshot?JSON.parse(source(file)):value;}catch{return value;}
}
const changedTooling=Object.freeze([
  'test/identity/operational-context-admission-v1.test.mjs',
  'scripts/identity/operational-context-admission-v1.mjs',
  'scripts/identity/operational-context-v1.mjs',
  'scripts/identity/operational-context-history-v1.mjs',
  'scripts/finance/cash-consumer-v1.mjs',
  'test/architecture/internal-auth-v2-history.test.mjs',
  'test/architecture/sales-recovery-consumer.test.mjs',
  'test/identity/operational-context-v1.test.mjs',
  'test/sales/inventory-step-consumer-v1.test.mjs',
]);
export const operationalConsumerToolingFiles=Object.freeze([...changedTooling,'scripts/identity/operational-context-consumers-v1.mjs']);
export function projectOperationalConsumerToolingFile(file,bytes){
  if(!changedTooling.includes(file))return bytes;
  try{return hash(bytes)===tooling[file]?source(file):bytes;}catch{return bytes;}
}
// One explicit synchronous current context; no approval survives this invocation.
export function withOperationalConsumersScope(paths,read,verify,label='OPERATIONAL_CONSUMER_BYTES'){
  return withBrowserReadsScope(paths,read,(paths,read)=>withConsumerScope(paths,read,verify,label),label);
}
function withConsumerScope(paths,read,verify,label){
  let active=true;const live=new Map();
  const raw=file=>{assert(active,'OPERATIONAL_CONSUMER_CONTEXT_CLOSED');if(!live.has(file))live.set(file,Buffer.from(read(file)));return Buffer.from(live.get(file));};
  try{
    validateOperationalConsumers(raw,label);
    // Code integrity belongs to validateValidationTooling and the existing
    // capability guards. Metadata scopes must not widen older readers to code.
    const result=verify([...new Set([...paths,...operationalConsumerFiles])],file=>projectOperationalConsumerFile(file,raw(file)));
    assert(!result||typeof result.then!=='function','OPERATIONAL_CONSUMER_SYNCHRONOUS');return result;
  }finally{active=false;live.clear();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,'OPERATIONAL_CONSUMER_OPTIONS');
  console.log(JSON.stringify(validateOperationalConsumers()));
}
