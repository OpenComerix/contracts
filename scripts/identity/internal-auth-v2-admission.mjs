import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {gitReader,resolveSelection} from '../../tools/architecture/graph.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {projectReuseConsumerFile} from './workload-reuse-consumers-v2.mjs';
import {projectCashConsumerFile,projectCashConsumerDocument} from '../finance/cash-consumer-v1.mjs';

export const root=path.resolve(import.meta.dirname,'../..');
export const sourceCommit='af6e8b3f5115d51f56a1ef94a36ae9f33cce3337';
const source=gitReader(root,sourceCommit);
const registryPath='registry/contracts.json',indexPath='identity/index.json';
const api='identity/http/private/v2/identity-internal-auth-v2.yaml';
const policy='identity/http/shared/v2/identity-workload-token-reuse-policy-v2.json';
const schema='identity/http/shared/v2/identity-workload-token-reuse-policy-v2.schema.json';
const fixtures='identity/fixtures/internal-auth/v2/policy-cases-v2.json';
const specifications=Object.freeze([
  ['identity.internal-auth.v2',api,'http-private','2.0.0',['issueInternalServiceToken','getInternalIdentityJwks']],
  ['identity.workload-token-reuse.policy.v2',policy,'policy','v2',[]],
  ['identity.workload-token-reuse.schema.v2',schema,'schema','v2',[]],
  ['identity.internal-auth.fixtures.v2',fixtures,'validation','v2',[]],
]);
export const admissionIds=Object.freeze(specifications.map(row=>row[0]));
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>readFileSync(path.join(root,file));
let immutable;
function facts(){
  if(immutable)return immutable;
  const before=JSON.parse(source(registryPath)),oldIndex=JSON.parse(source(indexPath));
  assert.equal(before.contracts.length,202);assert.equal(before.preservedFiles.length,236);
  assert.equal(before.requiredConsumers.length,7);
  assert.deepEqual(before.planned.filter(row=>row.materializeIn==='F1-ECO-M6').map(row=>row.id),admissionIds);
  const rows=specifications.map(([id,file,surface,version,operations])=>({
    id,domain:'identity',surface,owner:'identity-tenancy',status:'active',capability:'identity.workload-token-reuse',
    purpose:'ECO-M6 selected H1A v2 admission for two fixed workload profiles; owner runtime and consumer migration remain separate.',
    reasonForChange:'Admit the audited published source after complete exact CI; preserve H1A v1 and every prior consumer pin.',
    retirement:'Preserve source bytes and v1 admission; incompatible evolution requires a successor and explicit migration.',
    version,path:file,commit:sourceCommit,tag:null,tagObject:null,sha256:hash(source(file)),operations:[...operations],uriMappings:[],
  }));
  const registry={...before,contracts:[...before.contracts,...rows],planned:before.planned.filter(row=>!admissionIds.includes(row.id))};
  const index=domainIndex(registry,'identity');
  const common='Se admiten localmente solo las cuatro raíces H1A v2 desde `'+sourceCommit+'`, con hashes y cierres mínimos. '+
    '[CI fuente completa 23/23](https://github.com/OpenComerix/contracts/actions/runs/42493498581) verificada por SHA/ref exactos. '+
    'HTTP 2.0.0, política/schema/fixtures v2; 206 raíces, 236 artefactos preservados, dos planned ajenos y siete consumidores intactos. '+
    'V1 y todos los pins anteriores se conservan. Las secciones candidatas siguientes describen la entrega fuente histórica.\n\n'+
    'Esta admisión es candidata hasta auditoría/publicación y CI completa de su propia revisión. No migra manifiestos/locks, no actualiza gitlinks y no acredita reutilización runtime ni producción. '+
    'La política publicada conserva los indicadores de su corte fuente; no se modifica ni se interpreta active como activación runtime.\n\n';
  const sections={
    'identity/README.md':'## ECO-M6 — Admisión seleccionada H1A v2 (candidata)\n\n'+common+
      '[HTTP](http/private/v2/identity-internal-auth-v2.yaml), [política](http/shared/v2/identity-workload-token-reuse-policy-v2.json), '+
      '[schema](http/shared/v2/identity-workload-token-reuse-policy-v2.schema.json) y [fixtures](fixtures/internal-auth/v2/policy-cases-v2.json). '+
      'Selecciones semánticas de política y operaciones se declaran por separado en los futuros consumidores. '+
      'Gates: `node scripts/identity/internal-auth-v2-admission.mjs`; `node --test test/identity/internal-auth-v2-admission.test.mjs`.\n',
    'registry/README.md':'## ECO-M6 — Cuatro raíces H1A v2 seleccionadas (candidatas)\n\n'+common+
      '[Mapa y límites](../identity/README.md#eco-m6--admisión-seleccionada-h1a-v2-candidata). '+
      'El verificador compara metadata exacta, fuente/cierres y consumidores actuales por invocación, sin validar paquetes históricos por fixture.\n',
  };
  const metadata=new Map([[registryPath,encode(registry)],[indexPath,encode(index)]]);
  for(const [file,section]of Object.entries(sections)){
    const original=text(source(file)),headingEnd=original.indexOf('\n');assert(headingEnd>0);
    metadata.set(file,Buffer.from(original.slice(0,headingEnd+1)+'\n'+section+'\n'+original.slice(headingEnd+1).replace(/^\n/,'')));
  }
  immutable={before,oldIndex,rows,registry,index,metadata};
  return immutable;
}
export const admittedRegistry=()=>structuredClone(facts().registry);
export const admissionRows=()=>structuredClone(facts().rows);
export const admissionMetadata=()=>new Map([...facts().metadata].map(([file,bytes])=>[file,Buffer.from(bytes)]));

// A pure exact-value view for the historical candidate gate. It never reads or
// approves the checkout and never repairs unknown, partial or mutated input.
export function sourceCandidateDocument(file,value){
  const projected=projectCashConsumerDocument(file,value);
  if(projected!==value)return sourceCandidateDocument(file,projected);
  const model=facts();
  const current=file===registryPath?model.registry:file===indexPath?model.index:undefined;
  if(!current||!isDeepStrictEqual(value,current))return value;
  return structuredClone(file===registryPath?model.before:model.oldIndex);
}
export function validateAdmissionMetadata(registry,index){
  registry=projectCashConsumerDocument(registryPath,registry);
  assert.deepEqual(registry,facts().registry,'H1A_ADMISSION_REGISTRY');
  assert.deepEqual(index,facts().index,'H1A_ADMISSION_INDEX');
}
export function admissionClosures(){
  const model=facts();
  return model.rows.map(row=>({id:row.id,...resolveSelection(source,row,{version:row.version,operations:row.operations,pointers:['']},model.registry)}));
}
export function validateAdmission(readFile=read){
  const rawRead=readFile;
  readFile=file=>projectCashConsumerFile(file,rawRead(file));
  const model=facts();
  validateAdmissionMetadata(JSON.parse(readFile(registryPath)),JSON.parse(readFile(indexPath)));
  for(const [file,bytes]of model.metadata)if(file!==registryPath&&file!==indexPath)
    assert.equal(text(readFile(file)),text(bytes),'H1A_ADMISSION_DOCUMENTATION:'+file);
  // Immutable closures may be reused. Successful live checks remain local to
  // this invocation, with one read per distinct source or consumer file.
  const checked=new Set();
  const same=file=>{
    if(checked.has(file))return;
    assert.equal(text(projectReuseConsumerFile(file,readFile(file))),text(source(file)),'H1A_ADMISSION_SOURCE:'+file);
    checked.add(file);
  };
  same('openapi/identity-internal-auth-v1.yaml');
  for(const file of ['registry/consumers/index.json',...model.before.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json')])same(file);
  const closures=admissionClosures();
  for(const [index,closure]of closures.entries()){
    assert.equal(closure.files.length,index===0?11:1,'H1A_ADMISSION_CLOSURE:'+closure.id);
    for(const file of closure.files)same(file.path);
  }
  return {admitted:4,roots:206,preserved:236,planned:2,consumers:7,runtime_demonstrated:false};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  assert(process.argv.length===2||(process.argv.length===3&&['--write','--inspect'].includes(process.argv[2])),'Explicit --write or --inspect only');
  if(process.argv[2]==='--inspect')console.log(JSON.stringify(admissionClosures().map(row=>({id:row.id,files:row.files.map(file=>file.path)}))));
  else{
    if(process.argv[2]==='--write')for(const [file,bytes]of admissionMetadata()){
      const target=path.join(root,file),stat=lstatSync(target);assert(stat.isFile()&&!stat.isSymbolicLink(),'Metadata link forbidden');writeFileSync(target,bytes);
    }
    console.log(JSON.stringify(validateAdmission()));
  }
}
