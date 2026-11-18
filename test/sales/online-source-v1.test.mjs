import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {parse} from 'yaml';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {resolveSelection,makeLock} from '../../tools/architecture/graph.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {projectOnlineAdmissionFile} from '../../scripts/sales/online-admission-v1.mjs';
import {projectIanaConsumerExportFile} from '../../scripts/sales/iana-consumer-exports.mjs';
import {projectPrivateZoneFile} from '../../scripts/identity/branch-time-zone-private-v2.mjs';
import {root,base,sourceFiles,onlineScopeFiles,metadataFiles,openapis,validateSource,validateSourceInput,validatePreservation,projectOnlineFile,projectOnlineDocument,withOnlineSourceScope,operatingDate,verifyTemporalBinding} from '../../scripts/sales/online-source-v1.mjs';
const read=f=>fs.readFileSync(path.join(root,f));
const json=f=>JSON.parse(read(f));
const old=createGitReader()(root,base);
const encode=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const zonePath='/tenancy/branches/{branch_id}/time-zone';
const schemaPath='identity/http/shared/v1/identity-branch-time-zone-v1.schema.json';
const policyPath='sales/http/shared/v1/sales-operating-date-policy-v1.json';

test('browser successor selects only two GETs and preserves all semantics except the explicit Origin relaxation',()=>{
 const before=JSON.parse(old('sales/http/public/v2/pos-sales-v2.yaml')),current=json(openapis[0]);
 assert.deepEqual(Object.values(current.paths).map(i=>i.get.operationId),['getSaleFinalization','getCompletedSale']);
 assert.deepEqual(current.security,before.security);assert.deepEqual(current.components,before.components);
 for(const [route,item]of Object.entries(current.paths)){
  assert.deepEqual(Object.keys(item),['get']);assert(!item.get.requestBody);
  const op=structuredClone(item.get),origin=op.parameters.filter(p=>p.name==='Origin');assert.equal(origin.length,1);assert.equal(origin[0].required,false);
  assert.match(origin[0].description,/Absence grants no authority/);
  Object.assign(origin[0],before.paths[route].get.parameters.find(p=>p.name==='Origin'));
  assert.deepEqual(op,before.paths[route].get);
 }
});
test('explicit zone configuration retains separate mutation authority, CSRF, version and replay requirements',()=>{
 const pub=json(openapis[1]),priv=json(openapis[2]),schema=json(schemaPath);
 assert.deepEqual(pub.security,[{session:[]}]);assert.deepEqual(priv.security,[{delegatedBearer:[],originSession:[]}]);
 for(const d of [pub,priv]){
  const {get,put}=d.paths[zonePath];
  assert.equal(get.parameters.find(p=>p.name==='Origin').required,false);assert.equal(put.parameters.find(p=>p.name==='Origin').required,true);
  assert.match(put.parameters.find(p=>p.name==='Origin').description,/PUT always requires/);
  assert.equal(put['x-permission'],'tenant.branch.time-zone.manage');assert(put.security[0].csrfToken);
  assert(put.parameters.find(p=>p.name==='Idempotency-Key').required);assert(put.responses['409']);
  assert.match(put.description,/Current active session/);assert.match(put.description,/Replay requires current authority/);
  for(const op of [get,put])for(const response of Object.values(op.responses))assert.equal(response.headers['Cache-Control'].schema.const,'no-store');
 }
 assert.equal(schema.$defs.BranchTimeZone.additionalProperties,false);assert(!Object.hasOwn(schema.$defs.HttpBranchTimeZone,'additionalProperties'));
 assert.deepEqual(schema.$defs.Configure.required,['expected_version','time_zone']);assert.equal(schema.$defs.Configure.additionalProperties,false);
 assert.equal(json('identity/fixtures/branch-time-zone/v1/responses.json').absent.configuration,null);
 for(const op of Object.values(priv.paths[zonePath])){
  assert.equal(op['x-audience'],'identity-tenancy.user-api');assert(op.parameters.find(p=>p.name==='X-OC-Client-Signal').required);
 }
});
test('temporal authority reuses the bound canonical request and workload without fallback to an unbound zone',()=>{
 const predecessor=JSON.parse(old('identity/http/private/v1/identity-sales-authority-v1.yaml'));
 const prior=predecessor.paths['/internal/identity/sales-authorizations'].post;
 const d=json(openapis[3]),op=d.paths['/internal/identity/sales-temporal-authorizations'].post;
 assert.deepEqual(op.requestBody,prior.requestBody);assert.deepEqual(op.security,prior.security);
 assert.equal(op['x-caller'],prior['x-caller']);assert.equal(op['x-audience'],prior['x-audience']);
 assert.match(op.description,/same local consistent read/);assert.match(op.description,/no authority fallback/);
 const human=json('identity/fixtures/sales-authority/v1/human.json')[0],context=human.request.body.context;
 const envelope={authorization:human.decision,branch_time_zone:{organization_id:context.organization_id,branch_id:context.branch_id,version:2,time_zone:'America/Argentina/Buenos_Aires'}};
 verifyTemporalBinding(envelope,context);verifyTemporalBinding({...envelope,branch_time_zone:null},context);
 for(const mutate of [v=>v.branch_time_zone.organization_id='other',v=>v.branch_time_zone.branch_id='other',v=>v.branch_time_zone.version=0,v=>v.branch_time_zone.version=1.5,v=>v.authorization.organization_id='other',v=>v.authorization.scope.branch_ids=[],v=>v.authorization.operation_id='getCompletedSale',v=>v.branch_time_zone.time_zone='-03:00',v=>v.branch_time_zone.time_zone='Invalid/Zone']){
  const v=structuredClone(envelope);mutate(v);assert.throws(()=>verifyTemporalBinding(v,context));
 }
});
test('date vectors use branch IANA civil day at receipt across midnight, leap day and both DST transitions',()=>{
 const vectors=json('sales/fixtures/operating-date/v1/cases.json');assert.equal(vectors.dates.length,9);
 for(const row of vectors.dates)assert.deepEqual(operatingDate(row.received_at,row.time_zone),row.expected,row.id);
 assert.notEqual(vectors.dates[0].expected.business_date,vectors.dates[0].received_at.slice(0,10));
 for(const [instant,zone]of [['invalid','Etc/UTC'],['2026-02-30T00:00:00Z','Etc/UTC'],['2026-11-16T00:00:00+00:00','Etc/UTC'],['2026-11-16T00:00:00Z','-03:00'],['2026-11-16T00:00:00Z','Invalid/Zone']])assert.throws(()=>operatingDate(instant,zone));
 const policy=json(policyPath);assert.equal(policy.id,vectors.dates[0].expected.date_policy_version);
 assert.match(policy.source.instant,/server received_at/);assert.match(policy.validation.order,/accepted original response wins/);assert.match(policy.validation.replay,/Current authority still required/);
 assert.equal(policy.validation.unconfigured.effects,false);assert.equal(policy.validation.mismatch.effects,false);
 assert.equal(vectors.replay.effects,0);assert.notEqual(vectors.replay.original_date,vectors.replay.current_date);
});
test('ten planned roots preserve active sources, consumers and dependency bytes and remain unavailable to makeLock',()=>{
 assert.deepEqual(validateSource(),{planned:10,admitted:0,openapis:4,runtimeDemonstrated:false});assert(validatePreservation().files>224);
 const registry=JSON.parse(projectOnlineAdmissionFile('registry/contracts.json',read('registry/contracts.json'))),before=JSON.parse(old('registry/contracts.json'));
 assert.deepEqual(registry.requiredConsumers,before.requiredConsumers);assert.equal(registry.planned.length,before.planned.length+10);
 const selected=registry.planned.filter(r=>r.materializeIn==='F1-14E');assert.equal(selected.length,10);
 for(const row of selected){assert.equal(row.status,'planned');assert(!Object.hasOwn(row,'commit'));assert(!Object.hasOwn(row,'sha256'));}
 const first=selected.find(r=>r.path===openapis[0]),selection={version:first.version,operations:first.operations,pointers:[]};
 const manifest={service:'isolated-online-source',contracts:[{id:first.id,role:'consumer',...selection}],assets:[]};
 assert.throws(()=>makeLock(root,manifest,encode(manifest),registry),/Unknown\/unmaterialized/);
 const maps=[...registry.contracts.flatMap(r=>r.uriMappings??[]),...sourceFiles.filter(f=>f.endsWith('.schema.json')).map(f=>({uri:json(f).$id,path:f}))];
 for(const row of selected.filter(r=>r.operations)){
  const closure=resolveSelection(read,{...row,uriMappings:maps},{version:row.version,operations:row.operations,pointers:[]},registry);
  assert(closure.files.length>1);assert(closure.units.some(u=>u.path===row.path&&u.pointer.includes('/paths/')));
 }
});
test('standalone source preservation accepts only the exact published temporal Identity export',()=>{
 const file='registry/consumers/identity-tenancy.json',current=JSON.parse(projectIanaConsumerExportFile(file,read(file))),counts=new Map();
 assert.equal(current.sourceCommit,'ebe6e8e7dffa75f01774fdfff844a85819ee2085');assert.equal(current.lock.entries.length,58);
 validatePreservation(name=>{counts.set(name,(counts.get(name)??0)+1);return read(name);});
 assert([...counts.values()].every(count=>count===1));
 for(const change of [value=>value.sourceCommit='0'.repeat(40),value=>value.lock.entries.at(-1).commit='0'.repeat(40),value=>value.manifest.contracts.pop()]){
  const changed=structuredClone(current);change(changed);
  assert.throws(()=>validatePreservation(name=>name===file?encode(changed):read(name)),/ONLINE_SOURCE_PRESERVATION/);
 }
 const other='registry/consumers/sales-pos.json';
 assert.throws(()=>validatePreservation(name=>name===other?Buffer.concat([read(name),Buffer.from('Drift')]):read(name)),/ONLINE_SOURCE_PRESERVATION/);
});
test('source scope reads each mutable input once for repeated historical lookups and caches no approval',()=>{
 for(const count of [1,10,100]){
  const visits=new Map();
  withOnlineSourceScope(['historical-scope'],f=>{visits.set(f,(visits.get(f)??0)+1);return read(f);},(paths,historical)=>{
   assert.deepEqual(paths,['historical-scope',...onlineScopeFiles]);for(let i=0;i<count;i++)assert.deepEqual(historical('registry/contracts.json'),old('registry/contracts.json'));
  });
  assert.equal(visits.size,onlineScopeFiles.length);assert([...visits.values()].every(n=>n===1));
 }
 for(const f of sourceFiles){
  assert.throws(()=>withOnlineSourceScope([],n=>n===f?Buffer.concat([read(n),Buffer.from('\nDrift')]):read(n),()=>assert.fail('changed source accepted')));
  assert.throws(()=>withOnlineSourceScope([],n=>{if(n===f)throw Error('synthetic source missing');return read(n);},()=>assert.fail('missing source accepted')),/synthetic source missing/);
 }
 const partial=json('registry/contracts.json');partial.planned.at(-1).path='other.json';
 assert.throws(()=>withOnlineSourceScope([],f=>f==='registry/contracts.json'?encode(partial):read(f),()=>assert.fail('partial accepted')),/PARTIAL_SCOPE/);
});
test('pure projections never read another live input and cannot conceal changed metadata',()=>{
 const input=metadataFiles.map(f=>[f,read(f)]),originalRead=fs.readFileSync;
 fs.readFileSync=()=>{throw Error('unexpected live projection read');};syncBuiltinESMExports();
 try{for(const [f,bytes]of input){assert.deepEqual(projectOnlineFile(f,bytes),old(f));const wrong=Buffer.concat([bytes,Buffer.from('Drift')]);assert.strictEqual(projectOnlineFile(f,wrong),wrong);if(f.endsWith('.json')){assert.deepEqual(projectOnlineDocument(f,JSON.parse(bytes)),JSON.parse(old(f)));const changed={...JSON.parse(bytes),unapproved:true};assert.strictEqual(projectOnlineDocument(f,changed),changed);}}}
 finally{fs.readFileSync=originalRead;syncBuiltinESMExports();}
 for(const [f,bytes]of input)assert.throws(()=>validateSourceInput(f,Buffer.concat([bytes,Buffer.from('Drift')])),/SOURCE_BYTES/);
});
test('contexts close on success/failure and reject deferred verification',()=>{
 let escaped;withOnlineSourceScope([],read,(_paths,historical)=>{escaped=historical;});assert.throws(()=>escaped('registry/contracts.json'),/CONTEXT_CLOSED/);
 assert.throws(()=>withOnlineSourceScope([],read,(_paths,historical)=>{escaped=historical;throw Error('synthetic failure');}),/synthetic failure/);assert.throws(()=>escaped('registry/contracts.json'),/CONTEXT_CLOSED/);
 assert.throws(()=>withOnlineSourceScope([],read,()=>Promise.resolve(true)),/SYNCHRONOUS/);
});
test('CI adds one source bundle/schema pass in existing Sales jobs without changing prior commands or adding jobs',()=>{
 const current=parse(projectPrivateZoneFile('.github/workflows/ci.yml',read('.github/workflows/ci.yml')).toString()),before=parse(old('.github/workflows/ci.yml').toString());
 assert.deepEqual(Object.keys(current.jobs),Object.keys(before.jobs));
 const contract=current.jobs.validate_sales_contracts.steps.find(s=>s.name==='Run original validation commands');
 assert.equal(contract.run.split('node scripts/sales/online-source-v1.mjs openapi').length,2);
 contract.run=contract.run.replace('\nnode scripts/sales/online-source-v1.mjs openapi','');
 const steps=current.jobs.validate_sales_schema.steps,added=steps.filter(s=>s.name==='Validate F1-14E source schemas and vectors');assert.equal(added.length,1);assert(added[0].run.includes('ghcr.io/sourcemeta/jsonschema:v16.10.0'));
 current.jobs.validate_sales_schema.steps=steps.filter(s=>s!==added[0]);assert.deepEqual(current,before);
});
test('owner tooling guard rejects changed source validator, scope wrappers and tests after warmup',()=>{
 validateValidationTooling(read);
 for(const f of ['scripts/sales/online-source-v1.mjs','scripts/sales/validate-online-source-v1.sh','test/sales/online-source-v1.test.mjs','scripts/identity/preparation-consumers-v1.mjs','scripts/finance/browser-reads-admission-v1.mjs'])assert.throws(()=>validateValidationTooling(n=>n===f?Buffer.concat([read(n),Buffer.from('Drift')]):read(n)),/VALIDATION_TOOLING_DRIFT/);
});
