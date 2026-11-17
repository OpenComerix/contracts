import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parse} from 'yaml';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {root,ianaBase,ianaPattern,ianaSuccessors,ianaFixtures,ianaSourceFiles,ianaSourceDocuments,validateIanaSource,validateIanaInput,projectIanaFile,projectIanaDocument,withIanaScope} from '../../scripts/sales/iana-source-v1.mjs';
import {nativeIanaCases} from '../../scripts/sales/iana-native-v1.mjs';
const read=file=>fs.readFileSync(path.join(root,file)),source=createGitReader()(root,ianaBase);
test('IANA successor package preserves every published source/admission and consumer pin',()=>{
 assert.deepEqual({...validateIanaSource(),preservedFiles:0},{successors:9,planned:10,admitted:0,preservedFiles:0,runtimeDemonstrated:false});
 const before=JSON.parse(source('registry/contracts.json')),after=JSON.parse(read('registry/contracts.json'));
 assert.equal(new Set([...after.contracts,...after.planned].map(row=>row.id)).size,after.contracts.length+after.planned.length);
 assert.deepEqual(after.contracts,before.contracts);assert.deepEqual(after.preservedFiles,before.preservedFiles);
 assert.deepEqual(after.planned.slice(0,before.planned.length),before.planned);assert.equal(after.planned.length,before.planned.length+10);
});
test('named IANA digit zones retain exact names and the old type remains immutable',()=>{
 const old=JSON.parse(source(ianaSuccessors[0][0])),current=JSON.parse(read(ianaSuccessors[0][1]));
 assert.equal(current.$defs.OperatingDate.properties.time_zone.pattern,ianaPattern);
 const restored=structuredClone(current);restored.$id=old.$id;restored.title=old.title;restored.$defs.OperatingDate.properties.time_zone.pattern=old.$defs.OperatingDate.properties.time_zone.pattern;
 const restoreHistory=(value,previous)=>{
  if(!value||typeof value!=='object')return;
  if(previous?.const==='sales.sale.completed.v2'&&JSON.stringify(value.enum)===JSON.stringify(['sales.sale.completed.v2','sales.sale.completed.v3'])){delete value.enum;value.const=previous.const;}
  if(value.properties?.families&&previous?.properties?.families){value.properties.families.maxItems=previous.properties.families.maxItems;if(previous.properties.families.uniqueItems===undefined)delete value.properties.families.uniqueItems;else value.properties.families.uniqueItems=previous.properties.families.uniqueItems;}
  for(const key of Object.keys(value))restoreHistory(value[key],previous?.[key]);
 };
 restoreHistory(restored,old);assert.deepEqual(restored,old);
 const vectors=JSON.parse(read(ianaFixtures));
 for(const zone of vectors.positive){assert(new RegExp(ianaPattern).test(zone));assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:zone}).resolvedOptions().timeZone.length>0,true);}
 for(const zone of vectors.negative_shape)assert(!new RegExp(ianaPattern).test(zone));
 assert.throws(()=>new Intl.DateTimeFormat('en-CA',{timeZone:vectors.unsupported_named}),RangeError);
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Etc/GMT+3',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date('2026-11-16T02:59:59.999Z'));assert.equal(parts,'2026-11-15');
});
test('every new HTTP boundary selects the successor request/response types without a free ref override',()=>{
 for(const [before,after]of ianaSuccessors.slice(1)){
  const value=JSON.parse(read(after)),text=JSON.stringify(value);
  if(after.includes('pos-sales')||after.includes('sales-browser')){assert(text.includes('sales-types-v3.schema.json'));assert(!text.includes('sales-types-v2.schema.json'));}
  if(after.includes('/private/v2/identity-sales-')){assert(text.includes('shared/v2/identity-sales-authority-v2.schema.json'));assert(!text.includes('shared/v1/identity-sales-authority-v1.schema.json'));}
  const original=JSON.parse(source(before));if(value.openapi){assert.deepEqual(Object.keys(value.paths),Object.keys(original.paths));assert.deepEqual(value.security,original.security);assert.deepEqual(value.components,original.components);}
 }
 const completed=JSON.parse(read('sales/events/v3/sales.sale.completed.v3.schema.json'));
 assert.equal(completed.allOf[1].properties.event_type.const,'sales.sale.completed.v3');assert.equal(completed.allOf[1].properties.schema_version.const,1);
 const batch=nativeIanaCases();assert.equal(batch.instances.length,29);
 for(let start=0;start<20;start+=5){
  const previous=batch.instances[start+3],current=batch.instances[start+4];
  assert.equal(previous.event_type,'sales.sale.completed.v2');assert.equal(current.event_type,'sales.sale.completed.v3');
  assert.notStrictEqual(previous,current);assert.deepEqual(previous.payload,current.payload);
  current.payload.operating_date.time_zone='changed';assert.notEqual(previous.payload.operating_date.time_zone,'changed');
 }
});
test('closed scope reads each source once; pure projections preserve changed supplied values',()=>{
 const reads=new Map();let escaped;
 withIanaScope([],file=>{reads.set(file,(reads.get(file)??0)+1);return read(file);},(paths,historical)=>{escaped=historical;assert(paths.includes(ianaFixtures));assert.deepEqual(JSON.parse(historical('registry/contracts.json')),JSON.parse(source('registry/contracts.json')));});
 assert([...reads.values()].every(n=>n===1));assert.throws(()=>escaped('registry/contracts.json'),/CONTEXT_CLOSED/);
 for(const file of ianaSourceFiles){
  const wrong=Buffer.concat([read(file),Buffer.from('Drift')]);assert.throws(()=>validateIanaInput(file,wrong),/SOURCE_BYTES/);assert.strictEqual(projectIanaFile(file,wrong),wrong);
  if(file.endsWith('.json')){const value={...JSON.parse(read(file)),unapproved:true};assert.strictEqual(projectIanaDocument(file,value),value);}
 }
 const registry=JSON.parse(read('registry/contracts.json'));registry.planned.pop();assert.throws(()=>withIanaScope([],file=>file==='registry/contracts.json'?Buffer.from(JSON.stringify(registry)):read(file),()=>{}),/PARTIAL_SCOPE/);
 assert.throws(()=>withIanaScope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
 withIanaScope(['prior'],source,(paths,historical)=>{assert.deepEqual(paths,['prior']);assert.deepEqual(historical('registry/contracts.json'),source('registry/contracts.json'));});
 assert.throws(()=>withIanaScope([],source,()=>Promise.resolve()),/SYNCHRONOUS/);
 assert.throws(()=>withIanaScope([],file=>file==='registry/contracts.json'?Buffer.from('{broken'):read(file),()=>{},'CALLER_BOUNDARY'),/CALLER_BOUNDARY:registry\/contracts.json/);
});
test('materialization is exact and complete, not a cache of a previous live approval',()=>{
 const docs=ianaSourceDocuments();assert.equal(docs.size,ianaSourceFiles.length);
 for(const [file,bytes]of docs){assert.deepEqual(read(file),bytes);validateIanaInput(file,bytes);}
 const file=ianaSuccessors[0][1];assert.throws(()=>withIanaScope([],name=>name===file?Buffer.from('{}'):read(name),()=>{}),/SOURCE_BYTES/);
});
test('IANA CI prepares inside Node and validates transferred artifacts in the existing host schema job',()=>{
 const file='.github/workflows/ci.yml',workflow=parse(read(file).toString('utf8'));
 const previous=parse(createGitReader()(root,'4843c21741b62889f27bfe1e48ae79705089a534')(file).toString('utf8'));
 const contracts=workflow.jobs.validate_sales_contracts,schema=workflow.jobs.validate_sales_schema;
 assert.equal(contracts.container.image,'node:24.21.0-bookworm-slim');assert.equal(schema.container,undefined);
 const commands=contracts.steps.find(step=>step.name==='Run original validation commands');
 assert(commands.run.endsWith('node scripts/sales/iana-native-v1.mjs prepare'));assert(!commands.run.includes('docker'));
 const validation=schema.steps.at(-1);
 assert.equal(validation.name,'Validate IANA successor schemas and vectors');
 assert(validation.run.includes('ghcr.io/sourcemeta/jsonschema:v16.10.0'));
 for(const restriction of ['--network none','--read-only','--cap-drop ALL','--security-opt no-new-privileges','target=/workspace,readonly'])assert(validation.run.includes(restriction));
 assert(validation.run.includes('sh scripts/sales/validate-iana-v1.sh .ci-artifacts/sales-v2-iana-source-ci'));
 assert(schema.needs.includes('validate_sales_contracts'));
 assert(contracts.steps.find(step=>step.name==='Package original artifact paths').run.includes('.ci-artifacts/sales-v2-*/'));
 // No job, permission, dependency, prior command or artifact edge changes accompany the fix.
 commands.run=commands.run.replace('node scripts/sales/iana-native-v1.mjs prepare','node scripts/sales/iana-native-v1.mjs');
 schema.steps.pop();assert.deepEqual(workflow,previous);
});
