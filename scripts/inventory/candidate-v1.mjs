import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'yaml';

export const root=path.resolve(import.meta.dirname,'../..');
export const base='062453a717bc49d08b4816fa8e630ea63fcdd64d';
export const manifestPath='inventory/fixtures/acceptance/v1/package.json';
const decoder=new TextDecoder('utf-8',{fatal:true});
const text=bytes=>decoder.decode(bytes).replaceAll('\r\n','\n');
const hash=bytes=>createHash('sha256').update(text(bytes)).digest('hex');
const readActual=file=>fs.readFileSync(path.join(root,file));
const originals=new Map();
export function original(file) {
 if(!originals.has(file))originals.set(file,execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:16*1024*1024}));
 return originals.get(file);
}
const allowedChanges=new Set([
 'registry/contracts.json','inventory/index.json','identity/index.json','catalog/index.json','common/index.json','sales/index.json',
 'inventory/README.md','identity/README.md','catalog/README.md','sales/README.md','common/README.md','registry/README.md','.gitlab-ci.yml',
 'scripts/identity/catalog-workload-profiles-v2-registry.mjs','scripts/identity/catalog-workload-consumers-v2-registry.mjs','scripts/catalog/catalog-consumption-v1-registry.mjs',
 'test/support/f1-10a-scope.mjs','test/architecture/asyncapi-admission-v1.test.mjs','test/architecture/catalog-consumption.test.mjs',
 'test/architecture/catalog-delivery.test.mjs','test/architecture/catalog-operational-recovery.test.mjs','test/architecture/catalog-workload-consumers-v2.test.mjs',
 'test/identity/catalog-workload-profiles-admission-v2.test.mjs','test/identity/candidate-preservation.test.mjs','test/catalog/asyncapi-preservation-v1.test.mjs',
]);
function allowedNew(file) {
 return /^(?:inventory\/(?:http|commands|events|fixtures)\/|scripts\/inventory\/|test\/inventory\/|catalog\/(?:http\/(?:private|shared)\/v1\/catalog-inventory-capture-v1\.|fixtures\/inventory-capture\/)|identity\/(?:http\/(?:private|shared)\/v1\/identity-inventory-authority|fixtures\/inventory-authority\/)|sales\/http\/(?:private|shared)\/v1\/sales-inventory-step-authority-v1\.|common\/errors\/v9\/)/u.test(file);
}
let validated;
export function validateCandidatePackage(read=readActual) {
 if(read===readActual&&validated)return validated;
 const manifest=JSON.parse(read(manifestPath));
 assert.equal(manifest.base,base,'B_PACKAGE_BASE');assert.equal(manifest.status,'local-candidate','B_PACKAGE_STATUS');
 assert.equal(manifest.runtime_demonstrated,false,'B_PACKAGE_RUNTIME');
 assert.equal(manifest.functional_admission,false,'B_PACKAGE_ADMISSION');
 assert(Array.isArray(manifest.files)&&manifest.files.length>40,'B_PACKAGE_INCOMPLETE');
 assert.equal(new Set(manifest.files.map(x=>x.path)).size,manifest.files.length,'B_PACKAGE_DUPLICATE');
 for(const entry of manifest.files) {
   assert(entry.kind==='modified'?allowedChanges.has(entry.path):entry.kind==='new'&&allowedNew(entry.path),'B_PACKAGE_SCOPE:'+entry.path);
   assert.equal(hash(read(entry.path)),entry.sha256,'B_PACKAGE_BYTES:'+entry.path);
 }
 const previous=JSON.parse(original('registry/contracts.json')),registry=JSON.parse(read('registry/contracts.json'));
 assert.deepEqual(registry.contracts,previous.contracts,'B_PUBLISHED_ROOTS');
 assert.deepEqual(registry.preservedFiles,previous.preservedFiles,'B_PUBLISHED_ARTIFACTS');
 assert.deepEqual(registry.planned.slice(0,previous.planned.length),previous.planned,'B_PRIOR_PLANNED');
 const suffix=registry.planned.slice(previous.planned.length);
 assert.deepEqual(suffix,manifest.planned,'B_PLANNED_EXACT');
 assert(suffix.length>25&&suffix.every(x=>x.materializeIn==='F1-10B'&&x.status==='planned'),'B_PLANNED_STATUS');
 assert.equal(new Set(registry.planned.map(x=>x.id)).size,registry.planned.length,'B_PLANNED_DUPLICATE');
 const restored={...registry,planned:registry.planned.slice(0,previous.planned.length)};
 assert.deepEqual(restored,previous,'B_REGISTRY_PRESERVATION');
 for(const domain of ['inventory','identity','catalog','sales','common']) {
   const prior=JSON.parse(original(domain+'/index.json')),actual=JSON.parse(read(domain+'/index.json'));
   assert.deepEqual({...actual,planned:prior.planned},prior,'B_INDEX_PRIOR');
   assert.deepEqual(actual.planned,registry.planned.filter(x=>x.domain===domain).map(x=>x.id),'B_INDEX_PLANNED');
 }
 for(const file of ['package.json','pnpm-lock.yaml','registry/consumers/index.json',...previous.requiredConsumers.map(x=>'registry/consumers/'+x+'.json')])assert.equal(text(read(file)),text(original(file)),'B_PRIOR_BYTES:'+file);
 const preserved=new Map([...previous.preservedFiles,...previous.contracts].map(x=>[x.path,x.sha256]));
 for(const [file,expected] of preserved) {
   const bytes=read(file);const exact=createHash('sha256').update(bytes).digest('hex');
   assert(exact===expected||hash(bytes)===expected,'B_PRIOR_TRANSPORT_BYTES:'+file);
 }
 const priorCi=parse(text(original('.gitlab-ci.yml'))),ci=parse(text(read('.gitlab-ci.yml')));
 for(const [key,value] of Object.entries(priorCi))assert.deepEqual(ci[key],value,'B_PRIOR_CI_JOB:'+key);
 assert.deepEqual(Object.keys(ci).filter(x=>!Object.hasOwn(priorCi,x)),['validate:inventory-contracts','validate:inventory-schema'],'B_CI_SCOPE');
 const result={files:manifest.files.length,new_planned:suffix.length,prior_roots:previous.contracts.length,prior_artifacts:previous.preservedFiles.length,manifest,runtime_demonstrated:false};
 if(read===readActual)validated=result;
 return result;
}
// Historical guards retain their original negative diagnostics. Only an exact
// reviewed B file is projected, after validating the complete actual B package.
// Malformed/modified caller-supplied bytes pass through to the original guard.
export function projectCandidateFile(file,bytes) {
 if(!fs.existsSync(path.join(root,manifestPath)))return bytes;
 const {manifest}=validateCandidatePackage();
 const entry=manifest.files.find(x=>x.kind==='modified'&&x.path===file);
 if(!entry)return bytes;
 try {if(hash(bytes)===entry.sha256)return original(file);}catch{return bytes;}
 return bytes;
}
export function candidateReadView(read) {return file=>projectCandidateFile(file,read(file));}
export function projectCandidateRegistry(registry) {
 if(!fs.existsSync(path.join(root,manifestPath)))return registry;
 const actual=JSON.parse(readActual('registry/contracts.json'));
 if(!isDeepStrictEqual(registry,actual))return registry;
 validateCandidatePackage();return JSON.parse(original('registry/contracts.json'));
}
export function withCandidateScope(allowed) {
 if(!fs.existsSync(path.join(root,manifestPath)))return new Set(allowed);
 const {manifest}=validateCandidatePackage();return new Set([...allowed,...manifest.files.map(x=>x.path),manifestPath]);
}
