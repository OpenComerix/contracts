import {projectOnlineFile,projectOnlineDocument,withOnlineSourceScope} from '../sales/online-source-v1.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';

const root=path.resolve(import.meta.dirname,'../..');
export const preparationConsumersBase='dc37eaadc16e411a9729960ba7b977b9e7a896ab';
const source=createGitReader()(root,preparationConsumersBase);
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(text(bytes)).digest('hex');
const native=file=>readFileSync(path.join(root,file));
// Derived from the exact published consumer Git objects, after SHA/ref CI.
// No executing gate reads a neighboring checkout or trusts mutable reference data.
const published=Object.freeze({
  'gateway-bff':Object.freeze({revision:'ef12752e68b761b9c84a8f62588e334d0d754f93',
    snapshot:'05475c3a1eabb1f22bf6d29dfbf5cf7ef58e73deb69c8004d3004e867013cf43',
    manifest:'8399825378a6399f66415efbcb58de88d40f6cdd9c87418181810a0e05a302bc',
    lock:'964b27e4c1ff9802be312f3d8e919d6712835a1f430e7a228d54d97b59887cf7',entries:38,assets:198,bindings:18}),
  'web-pos':Object.freeze({revision:'dc9c2291ce8227c4f357fa266fd88b5d7442c3df',
    snapshot:'2a44397de718ba1c43639c8b8369e5a3d0f699969a0bb57cdc674933d7cd78bc',
    manifest:'7045f69b5e45a648035d350d9ae580112dd8f59713a6df84de24fe4b108546a0',
    lock:'0cae1795dfe453504fb5b145b97350c293ec99f8e12292cb404f488694af52cf',entries:16,assets:120,bindings:6}),
});
export const preparationConsumerFiles=Object.freeze(Object.keys(published).map(owner=>'registry/consumers/'+owner+'.json'));
const pins=new Map(preparationConsumerFiles.map(file=>[file,published[path.posix.basename(file,'.json')]]));
const previousHashes=new Map(preparationConsumerFiles.map(file=>[file,hash(source(file))]));
const oldRead='finance.f1-14a.public.finance-open-shift-v1';
const newRead='finance.f1-14d.public.finance-browser-reads-v1';
export function validatePreparationConsumerInput(file,bytes){
  assert(pins.has(file),'PREPARATION_CONSUMER_UNKNOWN_INPUT:'+file);
  assert.equal(hash(bytes),pins.get(file).snapshot,'PREPARATION_CONSUMER_BYTES:'+file);
}
export function validatePreparationConsumers(read=native){
  const results=[];
  for(const file of preparationConsumerFiles){
    const bytes=read(file);validatePreparationConsumerInput(file,bytes);
    const value=JSON.parse(text(bytes)),old=JSON.parse(source(file)),pin=pins.get(file);
    assert.equal(value.publication,'published');assert.equal(value.sourceCommit,pin.revision);
    assert.equal(value.sourceRepository,'opencomerix/'+value.manifest.service);
    assert.equal(value.manifestSha256,pin.manifest);assert.equal(hash(encode(value.manifest)),pin.manifest);
    assert.equal(value.lockSha256,pin.lock);assert.equal(hash(encode(value.lock)),pin.lock);
    assert.equal(value.lock.manifestSha256,pin.manifest);
    assert.equal(value.lock.entries.length,pin.entries);assert.equal(value.lock.assets.length,pin.assets);
    assert.equal(value.manifest.bindings.length,pin.bindings);
    if(value.manifest.service==='web-pos'){
      assert.deepEqual(value.manifest.contracts.slice(0,11),old.manifest.contracts);
      assert.deepEqual(value.lock.entries.slice(0,11),old.lock.entries);
      assert.deepEqual(value.manifest.assets.slice(0,104),old.manifest.assets);
      assert.deepEqual(value.lock.assets.slice(0,104),old.lock.assets);
      assert.deepEqual(value.manifest.bindings.slice(0,old.manifest.bindings.length),old.manifest.bindings);
      assert.deepEqual(value.manifest.contracts.slice(11).map(row=>row.id),[
        'identity.f1-14a.public.identity-operational-options-v1','inventory.http.public.v1',
        'finance.http.public.v1',newRead,'identity.f1-14a.shared.identity-operational-context-policy-v1',
      ]);
    }else{
      const retained=row=>![oldRead,newRead,'finance.http.public.v1'].includes(row.id);
      assert.deepEqual(value.manifest.contracts.filter(retained),old.manifest.contracts.filter(retained));
      assert.deepEqual(value.lock.entries.filter(retained),old.lock.entries.filter(retained));
      for(const kind of ['manifest','lock'])assert.deepEqual(
        value[kind].assets.filter(row=>row.contractId!==newRead),old[kind].assets.filter(row=>row.contractId!==oldRead));
      const mutations=value.manifest.contracts.find(row=>row.id==='finance.http.public.v1');
      assert.deepEqual(mutations.operations,['createPosCashRegister','openCashShift']);
    }
    assert.deepEqual(value.manifest.contracts.find(row=>row.id===newRead).operations,
      value.manifest.service==='web-pos'
        ? ['listCashRegisters','getOpenCashShift','getCashShift','getCashShiftExpected']
        : ['listCashRegisters','getCashShift','getCashShiftExpected','getOpenCashShift']);
    results.push({service:value.manifest.service,revision:pin.revision,entries:pin.entries,assets:pin.assets});
  }
  const index=JSON.parse(source('registry/consumers/index.json'));
  for(const file of ['registry/consumers/index.json',...index.consumers.map(row=>'registry/consumers/'+row.file)])
    if(!pins.has(file))assert.equal(text(read(file)),text(source(file)),'PREPARATION_CONSUMER_PRESERVATION:'+file);
  return results;
}
// Pure single-value transforms: no live reads, no complete validator per file.
export function projectPreparationConsumerFile(file,bytes){
  bytes=projectOnlineFile(file,bytes);
  if(!pins.has(file))return bytes;
  try{return hash(bytes)===pins.get(file).snapshot?source(file):bytes;}catch{return bytes;}
}
export function projectPreparationConsumerDocument(file,value){
  value=projectOnlineDocument(file,value);
  if(!pins.has(file))return value;
  try{const bytes=encode(value);return isDeepStrictEqual(value,JSON.parse(bytes))&&hash(bytes)===pins.get(file).snapshot?JSON.parse(source(file)):value;}catch{return value;}
}
// Historical callers may supply the complete old pair. Mixed, altered or omitted
// exports never project. Current standalone validation requires the new pair.
export function withPreparationConsumersScope(paths,read,verify){
  return withOnlineSourceScope(paths,read,(paths,read)=>withPreparedSourceScope(paths,read,verify));
}
function withPreparedSourceScope(paths,read,verify){
  let active=true;const live=new Map();
  const raw=file=>{
    assert(active,'PREPARATION_CONSUMER_CONTEXT_CLOSED');
    if(!live.has(file))live.set(file,Buffer.from(read(file)));
    return Buffer.from(live.get(file));
  };
  try{
    const hashes=preparationConsumerFiles.map(file=>hash(raw(file)));
    const historical=preparationConsumerFiles.every((file,i)=>hashes[i]===previousHashes.get(file));
    if(!historical)for(const [i,file]of preparationConsumerFiles.entries())
      assert.equal(hashes[i],pins.get(file).snapshot,'PREPARATION_CONSUMER_PARTIAL_SCOPE:'+file);
    const result=verify(historical?paths:[...new Set([...paths,...preparationConsumerFiles])],
      file=>historical?raw(file):projectPreparationConsumerFile(file,raw(file)));
    assert(!result||typeof result.then!=='function','PREPARATION_CONSUMER_SYNCHRONOUS');return result;
  }finally{active=false;live.clear();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,'PREPARATION_CONSUMER_OPTIONS');
  console.log(JSON.stringify(validatePreparationConsumers()));
}
