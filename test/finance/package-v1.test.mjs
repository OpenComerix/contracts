import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {makeLock} from '../../tools/architecture/graph.mjs';
import {parse} from 'yaml';
import {root,manifestPath,expectedManifestHash,validateReviewedFinance,validateFinanceCI,reviewedFinanceHistoricalFile,reviewedFinanceHistoricalRegistry,withReviewedFinanceScope,hash,original} from '../../scripts/finance/reviewed-package-v1.mjs';
const bytes=f=>fs.readFileSync(path.join(root,f)),read=f=>JSON.parse(bytes(f));
test('concrete C snapshot has pinned digest and preserves all earlier roots/artifacts/consumers/CI',()=>{assert.equal(hash(bytes(manifestPath)),expectedManifestHash);const r=validateReviewedFinance();assert.equal(r.new_planned,25);assert.equal(r.prior_roots,121);assert.equal(r.prior_artifacts,236);assert.equal(r.runtime_demonstrated,false);});
test('a forged manifest cannot authorize a new file or updated digest',()=>{const fake=read(manifestPath);fake.files.push({path:'src/free.ts',kind:'new',sha256:'0'.repeat(64)});assert.throws(()=>validateReviewedFinance(f=>f===manifestPath?Buffer.from(JSON.stringify(fake)):bytes(f)),/C_SNAPSHOT_DIGEST/);});
for(const f of ['.gitlab-ci.yml','registry/contracts.json','finance/README.md','identity/index.json','scripts/inventory/candidate-v1.mjs','test/inventory/package-v1.test.mjs','finance/http/shared/v1/finance-types-v1.schema.json','common/errors/v10/error-catalog-v10.json'])test('C current view rejects changed or missing source: '+f,()=>{assert.throws(()=>validateReviewedFinance(n=>n===f?Buffer.concat([bytes(n),Buffer.from('\nUnapproved')]):bytes(n)),/C_SNAPSHOT_BYTES/);assert.throws(()=>validateReviewedFinance(n=>{if(n===f)throw Error('Synthetic missing source');return bytes(n);}),/Synthetic missing source/);});
test('historical comparisons expose only exact pinned bytes, never caller drift or a foreign registry',()=>{const b=bytes('registry/contracts.json');assert(reviewedFinanceHistoricalFile('registry/contracts.json',b).equals(original('registry/contracts.json')));const wrong=Buffer.concat([b,Buffer.from('\nUnapproved')]);assert(reviewedFinanceHistoricalFile('registry/contracts.json',wrong).equals(wrong));const fake=read('registry/contracts.json');fake.contracts[0].status='draft';assert.equal(reviewedFinanceHistoricalRegistry(fake),fake);assert(!withReviewedFinanceScope([]).has('src/free.ts'));});
for(const role of ['producer','consumer','semantic-owner','validation'])test('new C planned roots cannot be selected or pinned: '+role,()=>{const r=read('registry/contracts.json'),entry=r.planned.find(x=>x.materializeIn==='F1-10C');const c={contracts:[{id:entry.id,role,version:'1.0.0',operations:[],pointers:['']}],assets:[]};assert.throws(()=>makeLock(root,c,Buffer.from(JSON.stringify(c)),r),/Unknown\/unmaterialized contract/);});

test('CI adds exactly the two authorized jobs with frozen install and prepared schema artifacts',()=>{const result=validateFinanceCI();assert.equal(result.prior_jobs,16);assert.equal(result.new_jobs,2);});
for(const [name,edit,error] of [
 ['removed old job',ci=>delete ci['validate:inventory-schema'],/C_PRIOR_CI_JOB/],
 ['changed old script',ci=>ci['validate:inventory-contracts'].script.pop(),/C_PRIOR_CI_JOB/],
 ['missing finance test',ci=>ci['validate:finance-contracts'].script.shift(),/C_FINANCE_CI_JOB/],
 ['nonfrozen install',ci=>ci['validate:finance-contracts'].before_script.pop(),/C_FINANCE_CI_JOB/],
 ['wrong validator',ci=>ci['validate:finance-schema'].image.name='different:latest',/C_FINANCE_CI_JOB/],
 ['allowed failure',ci=>ci['validate:finance-schema'].allow_failure=true,/C_FINANCE_CI_JOB/],
 ['unexpected job',ci=>ci['validate:extra']={script:['echo extra']},/C_CI_SCOPE/]
])test('CI rejects '+name,()=>{const ci=parse(bytes('.gitlab-ci.yml').toString('utf8'));edit(ci);assert.throws(()=>validateFinanceCI(ci),error);});
