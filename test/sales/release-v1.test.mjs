import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {makeLock,parseSource,resolveSelection} from '../../tools/architecture/graph.mjs';
import {root,source,baseline,validateAdmission,admittedRegistry,validateReleasePackage,releaseHistoricalFile,releaseHistoricalRegistry,withReleaseScope,validateReleaseCI,packagePath} from '../../scripts/sales/release-v1.mjs';
const bytes=f=>fs.readFileSync(path.join(root,f)),registry=()=>JSON.parse(bytes('registry/contracts.json'));
test('E exact selected admission preserves 121 roots/236 artifacts and leaves unrelated drafts/planned',()=>assert.deepEqual(validateAdmission(),{roots:199,added:78,preserved:236,planned:2,runtime_demonstrated:false}));
for(const [name,edit] of [
 ['removed prior root',r=>r.contracts.shift()],['partial set',r=>r.contracts.pop()],['wrong source',r=>r.contracts.at(-1).commit='0'.repeat(40)],
 ['wrong hash',r=>r.contracts.at(-1).sha256='0'.repeat(64)],['wrong mapping',r=>r.contracts.at(-1).uriMappings=[]],
 ['unrelated draft enabled',r=>r.contracts.find(x=>x.id==='sales.sale.completed.v1').status='active'],
 ['unrelated planned removed',r=>r.planned.pop()],['forged tag',r=>r.contracts.at(-1).tag='unapproved'],
])test('E admission rejects '+name,()=>{const r=registry();edit(r);assert.throws(()=>validateAdmission(r),/E_EXACT_ADMISSION/);});
test('every new admitted whole closure resolves from exact published source and excludes drafts',()=>{
 const r=admittedRegistry();for(const row of r.contracts.slice(121)){
  const closure=resolveSelection(source,row,{version:row.version,operations:[],pointers:['']},r);
  assert(closure.files.length);assert(!closure.files.some(f=>r.contracts.some(x=>x.path===f.path&&x.status==='draft')));
 }
});
for(const role of ['producer','consumer','semantic-owner'])test('old incomplete completed v1 still fails functional admission '+role,()=>{
 const r=registry(),d=r.contracts.find(x=>x.id==='sales.sale.completed.v1'),manifest={contracts:[{id:d.id,role,version:d.version,operations:[],pointers:['']}],assets:[]};
 assert.throws(()=>makeLock(root,manifest,Buffer.from(JSON.stringify(manifest)),r),/New use of a draft/);
});
test('E pins complete package and preserves consumers, contracts and dependencies',()=>assert.equal(validateReleasePackage().roots,199));
test('forged acceptance manifest cannot authorize extra paths',()=>{const m=JSON.parse(bytes(packagePath));m.files.push({path:'services/foreign.ts'});assert.throws(()=>validateReleasePackage(f=>f===packagePath?Buffer.from(JSON.stringify(m)):bytes(f)),/E_PACKAGE_DIGEST/);});
for(const f of ['registry/contracts.json','.gitlab-ci.yml','sales/fixtures/integration/v1/normal.json','scripts/sales/integration-v1.mjs'])test('E package rejects changed bytes '+f,()=>assert.throws(()=>validateReleasePackage(file=>file===f?Buffer.concat([bytes(file),Buffer.from('\nchanged')]):bytes(file)),/E_PACKAGE_BYTES/));
test('historical view projects only exact reviewed E bytes and never mutated caller input',()=>{
 const f='registry/contracts.json',b=bytes(f);assert(releaseHistoricalFile(f,b).equals(source(f)));
 const changed=Buffer.concat([b,Buffer.from('\nchanged')]);assert(releaseHistoricalFile(f,changed).equals(changed));
 const fake=registry();fake.contracts[0].status='draft';assert.equal(releaseHistoricalRegistry(fake),fake);assert.deepEqual(releaseHistoricalRegistry(registry()),baseline());
 assert(!withReleaseScope([]).has('src/foreign.ts'));
});
test('CI preserves all twenty existing jobs and adds two joint frozen gates',()=>assert.deepEqual(validateReleaseCI(),{prior_jobs:20,new_jobs:2}));
for(const [name,edit,code] of [
 ['prior job removed',v=>delete v['validate:finance-schema'],/E_PRIOR_CI/],['source script changed',v=>v['validate:sales-contracts'].script.pop(),/E_PRIOR_CI/],
 ['joint omitted',v=>delete v['validate:sale-flow-integration'],/E_CI_SCOPE/],['nonfrozen install',v=>v['validate:sale-flow-integration'].before_script.pop(),/E_INTEGRATION_CI/],
 ['validator replaced',v=>v['validate:sale-flow-integration-schema'].image.name='latest',/E_INTEGRATION_CI/],['allowed failure',v=>v['validate:sale-flow-integration'].allow_failure=true,/E_INTEGRATION_CI/],
])test('E CI rejects '+name,()=>{const ci=parseSource(bytes('.gitlab-ci.yml'),'.gitlab-ci.yml');edit(ci);assert.throws(()=>validateReleaseCI(ci),code);});
