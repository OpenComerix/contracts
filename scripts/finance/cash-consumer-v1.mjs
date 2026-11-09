import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {gitReader, makeLock} from '../../tools/architecture/graph.mjs';
import {sha256} from '../../tools/architecture/consumer-gate.mjs';

export const cashConsumerBase = 'c7cf3a9528320ada1203cc8cf311d8851af74ef5';
export const financeBase = 'c8ce23f47c76675d68b837c67c58b0c3746a33b2';
const root = path.resolve(import.meta.dirname, '../..');
const source = gitReader(root, cashConsumerBase);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const text = bytes => new TextDecoder('utf-8', {fatal:true}).decode(bytes).replaceAll('\r\n', '\n');
const native = file => readFileSync(path.join(root, file));
const same = (actual,expected,label) => assert.equal(sha256(Buffer.from(text(actual))),sha256(Buffer.from(text(expected))),label);
const operations = Object.freeze(['createPosCashRegister','listCashRegisters','openCashShift','getCashShift','getCashShiftExpected']);
export const cashConsumerFiles = Object.freeze([
  'registry/contracts.json','registry/consumers/index.json','registry/consumers/finance.json',
  'finance/README.md','scripts/finance/cash-consumer-v1.mjs','test/finance/cash-consumer-v1.test.mjs',
]);
let immutable;
function facts() {
  if (immutable) return immutable;
  const previousRegistry = JSON.parse(source('registry/contracts.json'));
  const previousIndex = JSON.parse(source('registry/consumers/index.json'));
  assert.equal(previousRegistry.requiredConsumers.length, 7);
  assert(!previousRegistry.requiredConsumers.includes('finance'));
  const registry = {...structuredClone(previousRegistry), requiredConsumers:[...previousRegistry.requiredConsumers,'finance']};
  const index = {...structuredClone(previousIndex),
    coverage:'Eight known consumers; Finance cash register/opening only in F1-12B; external consumers remain unknown.',
    consumers:[...previousIndex.consumers,{service:'finance',file:'finance.json',localDirectory:'services/finance'}]};
  const purpose = 'F1-12B authorized cash registers, opening and expected ARS; no sale payment, history reader or broker delivery.';
  const gates = ['pnpm contracts:metadata','pnpm test:contract','pnpm test:cov','pnpm test:integration','pnpm test:e2e'];
  const contracts = [];
  const add = (id,role,selectedOperations=[],pointers=[]) => {
    const descriptor = registry.contracts.find(row => row.id===id);
    assert.equal(descriptor?.status,'active','CASH_ADMISSION:'+id);
    contracts.push({id,role,version:descriptor.version,operations:selectedOperations,pointers,purpose,gates});
  };
  add('finance.http.private.v1','producer',[...operations]);
  add('finance.http.public.v1','semantic-owner',[...operations]);
  add('finance.types.v1','validation',[],['CashRegisterCreate','CashRegister','CashRegisters','OpenShiftRequest','CashShift','Expected','ShiftOpened','Movement'].map(name=>'/$defs/'+name));
  add('finance.protocol-policy.v1','semantic-owner',[],['/operations/0','/operations/1','/operations/2','/operations/3','/operations/4','/canonicalization','/money','/opening','/atomicity','/location','/limits','/history']);
  add('finance.lifecycle-policy.v1','semantic-owner',[],['']);
  add('finance.cash-shift.opened.v1','producer',[],['']);
  add('finance.cash-movement.recorded.v1','producer',[],['']);
  add('identity.finance-authority.http.v1','consumer',['checkFinanceAuthorization']);
  add('identity.finance-authority.schema.v1','validation',[],['/$defs/AuthorizationRequest','/$defs/Authorization']);
  add('identity.finance-authority.policy.v1','consumer',[],['/profiles/0','/profiles/1','/issuance',...Array.from({length:5},(_,n)=>'/permissions/'+n)]);
  add('identity.internal-auth.v1','consumer',['issueInternalServiceToken','getInternalIdentityJwks']);
  const manifest = {formatVersion:1,service:'finance',contracts,assets:[],bindings:[]};
  const closure = makeLock(root,manifest,encode(manifest),previousRegistry);
  const sources = new Map();
  for(const entry of closure.entries) for(const file of entry.files) {
    const bytes = gitReader(root,entry.commit)(file.path);
    if(sources.has(file.path)) assert(sources.get(file.path).equals(bytes),'CASH_SOURCE_COLLISION:'+file.path);
    else {
      sources.set(file.path,bytes);
      manifest.assets.push({contractId:entry.id,sourcePath:file.path,
        destination:'src/modules/cash/transport/contracts/'+file.path,representation:'exact',purpose:'runtime'});
    }
  }
  const manifestBytes = encode(manifest);
  const lock = makeLock(root,manifest,manifestBytes,previousRegistry);
  for(const asset of lock.assets) asset.localSha256=asset.sourceSha256;
  const snapshot = {formatVersion:1,publication:'local-candidate',sourceRepository:'opencomerix/finance',sourceCommit:financeBase,
    manifestSha256:sha256(manifestBytes),lockSha256:sha256(encode(lock)),manifest,lock};
  const oldReadme = text(source('finance/README.md'));
  const section = '\n## F1-12B — Selección consumidora de caja y apertura\n\n'+
    'Finance se incorpora como octavo consumidor conocido con cinco operaciones de caja/apertura, autoridad humana Identity y hechos de apertura/movimiento. '+
    'Las once selecciones fijan fuentes H4 publicadas; no incluyen cobro, lector histórico, resultado Sales ni entrega al broker. '+
    'El manifiesto/lock/export conserva las siete admisiones consumidoras anteriores y todos los transportes. '+
    'Candidato hasta auditoría, publicación y CI exacta; materializar en Finance solo después de verificar esa revisión. '+
    'No acredita runtime. Gate: `node --test test/finance/cash-consumer-v1.test.mjs`; metadata: `node tools/architecture/cli.mjs consumers`.\n';
  const metadata = new Map([
    ['registry/contracts.json',encode(registry)],['registry/consumers/index.json',encode(index)],
    ['registry/consumers/finance.json',encode(snapshot)],['finance/README.md',Buffer.from(oldReadme+section)],
  ]);
  immutable={previousRegistry,previousIndex,registry,index,snapshot,sources,metadata};
  return immutable;
}
export function cashConsumerSnapshot(){ return structuredClone(facts().snapshot); }
export function cashConsumerMetadata(){ return new Map([...facts().metadata].map(([file,bytes])=>[file,Buffer.from(bytes)])); }
// Pure exact projections adapt older proofs without approving other live files.
// Altered and partial supplied values are never repaired.
export function projectCashConsumerFile(file,bytes){
  if(!['registry/contracts.json','registry/consumers/index.json','finance/README.md'].includes(file)) return bytes;
  const expected=facts().metadata.get(file);
  return text(bytes)===text(expected)?source(file):bytes;
}
export function projectCashConsumerDocument(file,value){
  if(!['registry/contracts.json','registry/consumers/index.json'].includes(file)) return value;
  return isDeepStrictEqual(value,JSON.parse(facts().metadata.get(file)))?JSON.parse(source(file)):value;
}
export function validateCashConsumer(read=native){
  const model=facts();
  for(const [file,expected]of model.metadata) same(read(file),expected,'CASH_METADATA:'+file);
  for(const service of model.previousRegistry.requiredConsumers){
    const file='registry/consumers/'+service+'.json';
    same(read(file),source(file),'CASH_PREVIOUS_CONSUMER:'+service);
  }
  for(const [file,expected]of model.sources) same(read(file),expected,'CASH_SOURCE:'+file);
  return {consumers:8,selections:model.snapshot.manifest.contracts.length,assets:model.sources.size,runtime_demonstrated:false};
}
export function withCashConsumerScope(paths,read){
  const registry=read('registry/contracts.json');
  if(projectCashConsumerFile('registry/contracts.json',registry)===registry)return new Set(paths);
  // Only this closed delta is checked here. The capability gate verifies
  // original source bytes and prior consumers once, outside historical views.
  for(const [file,expected]of facts().metadata)
    same(file==='registry/contracts.json'?registry:read(file),expected,'CASH_SCOPE:'+file);
  return new Set([...paths,...cashConsumerFiles]);
}
export function materializeCashConsumer(){
  const model=facts(),directory=path.resolve(root,'../../services/finance');
  for(const [name,value]of [['contracts.manifest.json',model.snapshot.manifest],['contracts.lock.json',model.snapshot.lock]])
    writeFileSync(path.join(directory,name),encode(value));
  for(const asset of model.snapshot.manifest.assets){
    const target=path.join(directory,asset.destination);mkdirSync(path.dirname(target),{recursive:true});
    writeFileSync(target,model.sources.get(asset.sourcePath));
  }
  const tooling=[];
  for(const [sourcePath,destination]of [['tools/architecture/consumer-gate.mjs','.contracts/gate.mjs'],['registry/manifest-v1.schema.json','.contracts/manifest-v1.schema.json'],['registry/lock-v1.schema.json','.contracts/lock-v1.schema.json']]){
    const bytes=source(sourcePath),target=path.join(directory,destination);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes);
    tooling.push({sourcePath,destination,sha256:sha256(bytes)});
  }
  writeFileSync(path.join(directory,'.contracts/provenance.json'),encode({formatVersion:1,sourceRepository:'opencomerix/contracts',publication:'local-candidate',sourceBaseCommit:cashConsumerBase,files:tooling}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
  assert(process.argv.length===3&&process.argv[2]==='--write','Explicit --write required');
  for(const [file,bytes]of cashConsumerMetadata()) writeFileSync(path.join(root,file),bytes);
  console.log(JSON.stringify(validateCashConsumer()));
}
