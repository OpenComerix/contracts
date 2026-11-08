import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {gitReader,makeLock} from '../../tools/architecture/graph.mjs';
import {sha256} from '../../tools/architecture/consumer-gate.mjs';

const root=path.resolve(import.meta.dirname,'../..');
export const admissionCommit='36d56296b737e15b1bc7289385023899c81ccf87';
const source=gitReader(root,admissionCommit);
const owners=Object.freeze({
  'identity-tenancy':'c206dc39c201a5ff57a946f073dd9e3cb9317b8a',
  inventory:'d67430d466c5efbcc69badf7debc3c7be4ae1887',
  'sales-pos':'b6407da6e3367a6dffd138f667175d4cf57ff9ad',
});
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const consumerFiles=new Set(Object.keys(owners).map(owner=>'registry/consumers/'+owner+'.json'));
let immutable;
function facts(){
  if(immutable)return immutable;
  const registry=JSON.parse(source('registry/contracts.json'));
  const snapshots=new Map(),previous=new Map();
  for(const [owner,base]of Object.entries(owners)){
    const file='registry/consumers/'+owner+'.json';
    const old=JSON.parse(source(file));
    const gates=['pnpm contracts:metadata','pnpm test:cov','pnpm test:integration'];
    if(owner==='sales-pos')gates.push('pnpm test:process-authority-runtime');
    const manifest=structuredClone(old.manifest);
    manifest.contracts.push({
      id:'identity.internal-auth.v2',role:owner==='identity-tenancy'?'producer':'consumer',version:'2.0.0',
      operations:owner==='sales-pos'?['issueInternalServiceToken']:['issueInternalServiceToken','getInternalIdentityJwks'],
      pointers:[],purpose:'ECO-M6 H1A v2 for the two approved workload reuse profiles; existing v1 selections/pins remain for their prior purposes.',gates,
    },{
      id:'identity.workload-token-reuse.policy.v2',role:owner==='identity-tenancy'?'semantic-owner':'consumer',version:'v2',
      operations:[],pointers:[''],purpose:'ECO-M6 bounded private RAM, fixed profiles, per-use verification, deadlines and residual secret/key retirement; no authority cache.',gates,
    });
    const manifestBytes=encode(manifest);
    // Resolve only the two new selections, not every historical dependency
    // for every supplied-value projection. Old immutable pins/assets survive.
    const additions=makeLock(root,{...manifest,contracts:manifest.contracts.slice(old.manifest.contracts.length),assets:[]},manifestBytes,registry);
    const lock={...structuredClone(old.lock),manifestSha256:sha256(manifestBytes),
      entries:[...structuredClone(old.lock.entries),...additions.entries]};
    const snapshot={formatVersion:1,publication:'local-candidate',sourceRepository:'opencomerix/'+owner,
      sourceCommit:base,manifestSha256:sha256(manifestBytes),lockSha256:sha256(encode(lock)),manifest,lock};
    previous.set(file,old);snapshots.set(file,snapshot);
  }
  immutable={snapshots,previous};return immutable;
}
export function reuseConsumerSnapshots(){
  return new Map([...facts().snapshots].map(([file,value])=>[file,structuredClone(value)]));
}
export function validateReuseConsumer(file,value){
  const expected=facts().snapshots.get(file);assert(expected,'REUSE_CONSUMER_UNKNOWN');
  assert.deepEqual(value,expected,'REUSE_CONSUMER_METADATA:'+file);
  return {service:value.manifest.service,additions:2,previousPins:value.lock.entries.length-2,publication:value.publication};
}
// Exact supplied-value projection for the earlier admission gate. It does not
// read mutable inputs, certify a checkout, or project altered/partial metadata.
export function projectReuseConsumerDocument(file,value){
  if(!consumerFiles.has(file))return value;
  const model=facts(),expected=model.snapshots.get(file);
  return expected&&isDeepStrictEqual(value,expected)?structuredClone(model.previous.get(file)):value;
}
export function projectReuseConsumerFile(file,bytes){
  if(!consumerFiles.has(file))return bytes;
  return text(bytes)===text(encode(facts().snapshots.get(file)))?source(file):bytes;
}
export function validateReuseConsumers(read=file=>readFileSync(path.join(root,file))){
  return [...facts().snapshots.keys()].map(file=>validateReuseConsumer(file,JSON.parse(read(file))));
}
