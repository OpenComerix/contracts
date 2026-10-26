import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'yaml';

export const root=path.resolve(import.meta.dirname,'../..');
export const base='67cb6f9e45904f5a142912c60aafe08cda851c55';
export const manifestPath='finance/fixtures/acceptance/v1/package.json';
export const verifierPath='scripts/finance/reviewed-package-v1.mjs';
// Filled only after the complete concrete candidate exists. A different file
// list or digest cannot be authorized by editing the manifest itself.
export const expectedManifestHash='3d88b0b8d1bd30f8ff3dfdc8df300a066615905514b0c081c8abd4bd530143bb';
const raw=f=>fs.readFileSync(path.join(root,f));
const text=b=>new TextDecoder('utf-8',{fatal:true}).decode(b).replaceAll('\r\n','\n');
export const hash=b=>createHash('sha256').update(text(b)).digest('hex');
const originals=new Map();
export function original(f){if(!originals.has(f))originals.set(f,execFileSync('git',['show',base+':'+f],{cwd:root,maxBuffer:32*1024*1024}));return originals.get(f);}
const permittedModified=new Set(['.gitlab-ci.yml','registry/contracts.json','finance/index.json','identity/index.json','sales/index.json','common/index.json','finance/README.md','identity/README.md','sales/README.md','common/README.md','scripts/inventory/candidate-v1.mjs','test/inventory/package-v1.test.mjs']);
export function validateFinanceCI(actual=parse(text(raw('.gitlab-ci.yml')))){
 const prior=parse(text(original('.gitlab-ci.yml')));
 for(const [key,value] of Object.entries(prior))assert.deepEqual(actual[key],value,'C_PRIOR_CI_JOB:'+key);
 assert.deepEqual(Object.keys(actual).filter(key=>!Object.hasOwn(prior,key)),['validate:finance-contracts','validate:finance-schema'],'C_CI_SCOPE');
 // The two authorized jobs use the already accepted inventory gate shape,
 // with only the capability paths changed to finance. No existing job changes.
 for(const suffix of ['contracts','schema']){
  const expected=JSON.parse(JSON.stringify(prior['validate:inventory-'+suffix]).replaceAll('inventory','finance'));
  assert.deepEqual(actual['validate:finance-'+suffix],expected,'C_FINANCE_CI_JOB:'+suffix);
 }
 return {prior_jobs:Object.keys(prior).filter(key=>key.startsWith('validate:')).length,new_jobs:2};
}
let checked;
export function validateReviewedFinance(read=raw){
 if(read===raw&&checked)return checked;
 const bytes=read(manifestPath);assert.equal(hash(bytes),expectedManifestHash,'C_SNAPSHOT_DIGEST');const m=JSON.parse(bytes);assert.equal(m.base,base,'C_SNAPSHOT_BASE');assert.equal(m.status,'local-candidate','C_SNAPSHOT_STATUS');assert.equal(m.runtime_demonstrated,false,'C_RUNTIME');assert.equal(m.functional_admission,false,'C_ADMISSION');
 assert.equal(new Set(m.files.map(x=>x.path)).size,m.files.length,'C_SNAPSHOT_DUPLICATE');
 for(const e of m.files){assert(!e.path.includes('..')&&!e.path.includes('\\')&&!path.posix.isAbsolute(e.path),'C_SNAPSHOT_PATH');if(e.kind==='modified')assert(permittedModified.has(e.path),'C_MODIFIED_SCOPE');else assert.equal(e.kind,'new','C_ENTRY_KIND');assert.equal(hash(read(e.path)),e.sha256,'C_SNAPSHOT_BYTES:'+e.path);if(e.kind==='modified')assert.equal(hash(original(e.path)),e.previous_sha256,'C_BASE_BYTES:'+e.path);}
 const before=JSON.parse(original('registry/contracts.json')),registry=JSON.parse(read('registry/contracts.json'));
 assert.deepEqual({...registry,planned:before.planned},before,'C_REGISTRY_PRESERVATION');assert.deepEqual(registry.planned.slice(0,before.planned.length),before.planned,'C_PRIOR_PLANNED');assert.deepEqual(registry.planned.slice(before.planned.length),m.planned,'C_PLANNED_EXACT');assert.equal(m.planned.length,25,'C_PLANNED_COUNT');assert(m.planned.every(x=>x.status==='planned'&&x.materializeIn==='F1-10C'),'C_PLANNED_STATUS');assert.equal(new Set(registry.planned.map(x=>x.id)).size,registry.planned.length,'C_PLANNED_DUPLICATE');
 for(const d of ['finance','identity','sales','common']){const beforeIndex=JSON.parse(original(d+'/index.json')),actual=JSON.parse(read(d+'/index.json'));assert.deepEqual({...actual,planned:beforeIndex.planned},beforeIndex,'C_INDEX_PRESERVED');assert.deepEqual(actual.planned,registry.planned.filter(x=>x.domain===d).map(x=>x.id),'C_INDEX_DERIVED');}
 validateFinanceCI(parse(text(read('.gitlab-ci.yml'))));
 for(const f of ['package.json','pnpm-lock.yaml','registry/consumers/index.json',...before.requiredConsumers.map(x=>'registry/consumers/'+x+'.json'),'inventory/fixtures/acceptance/v1/package.json'])assert.equal(text(read(f)),text(original(f)),'C_PRESERVED:'+f);
 for(const e of [...before.contracts,...before.preservedFiles]){const b=read(e.path);assert(createHash('sha256').update(b).digest('hex')===e.sha256||hash(b)===e.sha256,'C_TRANSPORT_PRESERVED:'+e.path);}
 const bManifest=JSON.parse(original('inventory/fixtures/acceptance/v1/package.json'));
 for(const e of bManifest.files)if(!permittedModified.has(e.path))assert.equal(text(read(e.path)),text(original(e.path)),'C_B_PRESERVED:'+e.path);
 const allowed=new Set([manifestPath,verifierPath,...m.files.map(x=>x.path)]);
 for(const args of [['diff','--name-only',base],['ls-files','--others','--exclude-standard']])for(const f of execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean))assert(allowed.has(f),'C_UNDECLARED_PATH:'+f);
 const result={files:m.files.length,new_planned:m.planned.length,prior_roots:before.contracts.length,prior_artifacts:before.preservedFiles.length,manifest:m,runtime_demonstrated:false};if(read===raw)checked=result;return result;
}
// Historical comparison only: this is NOT the current C validation view.
// The pinned package above is verified in full before returning any B bytes.
// Mutated caller-supplied bytes pass unchanged to the original negative gate.
export function reviewedFinanceHistoricalFile(f,b){const {manifest:m}=validateReviewedFinance();const e=m.files.find(x=>x.kind==='modified'&&x.path===f);return e&&hash(b)===e.sha256?original(f):b;}
export const reviewedFinanceHistoricalRead=read=>f=>reviewedFinanceHistoricalFile(f,read(f));
export function reviewedFinanceHistoricalRegistry(registry){const actual=JSON.parse(raw('registry/contracts.json'));if(!isDeepStrictEqual(registry,actual))return registry;validateReviewedFinance();return JSON.parse(original('registry/contracts.json'));}
export function withReviewedFinanceScope(paths){const {manifest:m}=validateReviewedFinance();return new Set([...paths,manifestPath,verifierPath,...m.files.map(x=>x.path)]);}
