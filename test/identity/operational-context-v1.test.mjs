import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,files,openapis,read,verify,operations,prepare,authorityExamples,verifyAuthorityBinding} from '../../scripts/identity/operational-context-v1.mjs';
import {operationalFiles,projectOperationalFile,withOperationalScope} from '../../scripts/identity/operational-context-history-v1.mjs';
import {operationalConsumerFiles} from '../../scripts/identity/operational-context-consumers-v1.mjs';
import {browserReadsFiles,browserReadsPreservedFiles} from '../../scripts/finance/browser-reads-v1.mjs';

test('exact operation selection preserves published transports and every consumer admission',()=>{
 assert.deepEqual(verify().operations,20);
 const rows=read(files.matrix).rows;
 assert.deepEqual(Object.fromEntries(['inventory','finance','sales','identity'].map(domain=>[domain,rows.filter(row=>row.domain===domain).length])),{inventory:9,finance:6,sales:4,identity:1});
 assert(rows.every(row=>!row.operation_id.includes('History')));
 for(const row of rows.filter(row=>row.closures))for(const closure of row.closures){assert(closure.files.length>1);assert(closure.units.some(unit=>unit.pointer.includes('/paths/')));}
});
test('public/owner response bindings select the strict producer and compatible reader',()=>{
 for(const file of openapis.slice(0,4)){const op=operations(read(file))[0],body=op.responses['200'].content['application/json'];assert(body.schema.$ref.includes('/Http'));assert(!body['x-producer-schema'].$ref.includes('/Http'));assert.equal(op.responses['200'].headers['Cache-Control'].schema.const,'no-store');assert(!op.requestBody);}
 const privateOptions=operations(read(openapis[1]))[0];assert.deepEqual(privateOptions.security,[{delegatedBearer:[],originSession:[]}]);assert(privateOptions.parameters.some(value=>value.name==='X-OC-Client-Signal'&&value.required));
 for(const operation of operations(read(openapis[4]))){const body=operation.responses['200'].content['application/json'];assert(body.schema.$ref.includes('#/$defs/Http'));assert(!body['x-producer-schema'].$ref.includes('#/$defs/Http'));}
});
test('isolated authority rejects widened operation, query, permission and decision lifetime',()=>{
 const native=file=>fs.readFileSync(path.join(root,file));
 for(const mutate of [d=>d.$defs.CanonicalRequest.properties.operation_id.const='openCashShift',d=>d.$defs.CanonicalRequest.properties.query.additionalProperties=true,d=>d.$defs.Authorization.properties.permission.const='finance.cash.open',d=>d.$defs.Authorization.properties.valid_for_ms.maximum=60000]){
 const wrong=read(files.authority);mutate(wrong);assert.throws(()=>verify(file=>file===files.authority?Buffer.from(JSON.stringify(wrong)):native(file)));}
});
test('zero/one/multiple and incomplete pages retain explicit absence and do not imply a grant',()=>{
 const responses=read('identity/fixtures/operational-options/v1/responses.json');assert.equal(responses.zero.items.length,0);assert.equal(responses.one.items.length,1);assert.equal(responses.multiple.items.length,2);assert.notEqual(responses.incomplete.next_cursor,null);
 const cash=read('finance/fixtures/open-shift/v1/responses.json');assert.equal(cash.absent.cash_shift,null);assert(cash.open.cash_shift.cash_shift_id);assert.deepEqual(Object.keys(cash.open.cash_shift).sort(),['cash_shift_id','version']);
 const cases=read('identity/fixtures/operational-options/v1/authority-cases.json');assert(cases.discovery.some(row=>row.name==='active-scoped'&&row.sales_permission===false&&row.status===200));assert(cases.discovery.some(row=>row.name==='restricted'&&row.status===403));assert(cases.discovery.some(row=>row.name==='revoked'&&row.status===401));assert(cases.finance.some(row=>row.name==='other-responsible'&&row.status===403&&!row.body_contains_shift));assert(cases.finance.some(row=>row.name==='other-tenant-register'&&row.status===404));
});
test('schema preparation shares each schema across cases and preserves native rejection counts',()=>{
 const result=prepare('.ci-artifacts/f1-14a-unit');assert.equal(result.schemas,17);assert.equal(result.accepted,29);assert.equal(result.rejected,43);
 const cases=read('.ci-artifacts/f1-14a-unit/cases.json');assert.equal(new Set(cases.map(row=>row.schema)).size,result.schemas);assert(cases.length>result.schemas);assert.equal(cases.filter(row=>!row.valid).length,result.rejected);
});
test('private signal is declared once and cannot disappear or become optional in the owner contract',()=>{
 const native=file=>fs.readFileSync(path.join(root,file)),target=openapis[3];
 for(const mutate of [operation=>operation.parameters=operation.parameters.filter(value=>value.name!=='X-OC-Client-Signal'),operation=>operation.parameters.find(value=>value.name==='X-OC-Client-Signal').required=false]){const wrong=read(target);mutate(Object.values(wrong.paths)[0].get);assert.throws(()=>verify(file=>file===target?Buffer.from(JSON.stringify(wrong)):native(file)));}
});
test('authority vectors bind the same canonical request, tenant and bounded lifetime',()=>{
 const examples=read(authorityExamples);verifyAuthorityBinding(examples);
 for(const mutate of [value=>value.Authorization.request_hash='0'.repeat(64),value=>value.Authorization.scope.organization_id='other',value=>value.AuthorizationRequest.request.path+='/other',value=>value.Delegation.expires_at='2026-11-15T00:02:00Z']){const changed=structuredClone(examples);mutate(changed);assert.throws(()=>verifyAuthorityBinding(changed));}
});
test('CLI rejects artifact escapes and shell metacharacters before invoking native tools',()=>{
 for(const output of ['../outside','.ci-artifacts/x&invalid']){const result=spawnSync(process.execPath,['scripts/identity/operational-context-v1.mjs','openapi',output],{cwd:root,encoding:'utf8',windowsHide:true});assert.notEqual(result.status,0);assert.match(result.stderr,/ARTIFACT_OUTPUT/);}
});
test('the current candidate proof reads each declared input once and rejects drift after warmup',()=>{
 const native=file=>fs.readFileSync(path.join(root,file));
 const visits=[];const invoke=reader=>withOperationalScope([],reader,(paths,read)=>{read('registry/contracts.json');return new Set(paths);});
 const scope=invoke(file=>{visits.push(file);return native(file);});assert.equal(new Set(visits).size,visits.length);assert.deepEqual([...scope].sort(),[...new Set([...operationalFiles,...operationalConsumerFiles,...browserReadsFiles,...browserReadsPreservedFiles])].sort());
 const file='identity/http/shared/v1/identity-operational-options-v1.schema.json';
 assert.throws(()=>invoke(name=>name===file?Buffer.concat([native(name),Buffer.from('\nDrift')]):native(name)),/OPERATIONAL_CURRENT_BYTES/);
 assert.throws(()=>invoke(name=>{if(name===file)throw Error('synthetic missing candidate');return native(name);}),/synthetic missing candidate/);
 const wrong=Buffer.concat([native('registry/contracts.json'),Buffer.from('\nDrift')]);assert.equal(projectOperationalFile('registry/contracts.json',wrong),wrong);
 let escaped;withOperationalScope([],native,(_paths,read)=>{escaped=read;});assert.throws(()=>escaped(file),/OPERATIONAL_CONTEXT_CLOSED/);
});
