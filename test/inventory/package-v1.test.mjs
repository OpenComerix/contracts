import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {makeLock} from '../../tools/architecture/graph.mjs';
import {reviewedFinanceHistoricalRead,withReviewedFinanceScope} from '../../scripts/finance/reviewed-package-v1.mjs';
import {validateCandidatePackage,candidateReadView,projectCandidateRegistry,withCandidateScope,original,root,manifestPath,base} from '../../scripts/inventory/candidate-v1.mjs';
const bytes=reviewedFinanceHistoricalRead(file=>fs.readFileSync(path.join(root,file)));
const read=file=>JSON.parse(bytes(file));
const manifest=read(manifestPath);

test('complete B package preserves prior roots, bytes, consumers and CI; new metadata remains planned',()=>{
 const result=validateCandidatePackage();assert.equal(result.prior_roots,121);assert.equal(result.prior_artifacts,236);assert.equal(result.new_planned,34);assert.equal(result.runtime_demonstrated,false);
 const registry=read('registry/contracts.json'),before=JSON.parse(original('registry/contracts.json'));
 assert.deepEqual(projectCandidateRegistry(registry),before);assert.deepEqual(registry.planned.slice(3),manifest.planned);
});
test('scope includes every modified, indexed or new path from the declared contracts base',()=>{
 const actual=withReviewedFinanceScope([manifestPath,...manifest.files.map(x=>x.path)]);
 for(const args of [['diff','--name-only',base],['ls-files','--others','--exclude-standard']])for(const file of execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean))assert(actual.has(file),'B_UNDECLARED_PATH:'+file);
 assert(!withCandidateScope([]).has('src/main.ts'));
});
for(const file of ['registry/contracts.json','inventory/index.json','.gitlab-ci.yml','inventory/README.md','inventory/http/shared/v1/inventory-types-v1.schema.json','identity/http/private/v1/identity-inventory-authority-v1.yaml','catalog/http/private/v1/catalog-inventory-capture-v1.yaml','sales/http/private/v1/sales-inventory-step-authority-v1.yaml','common/errors/v9/error-catalog-v9.json','scripts/inventory/candidate-v1.mjs'])test('closed B package rejects drift or omission: '+file,()=>{
 const wrong=name=>name===file?Buffer.concat([bytes(name),Buffer.from('\nUnapproved')]):bytes(name);
 assert.throws(()=>validateCandidatePackage(wrong),/B_PACKAGE_BYTES/);
 const missing=name=>{if(name===file)throw Error('Synthetic missing candidate');return bytes(name);};assert.throws(()=>validateCandidatePackage(missing),/Synthetic missing candidate/);
});
test('historical view never grants a blanket path exemption or suppresses caller-supplied drift',()=>{
 const current=bytes('registry/contracts.json');assert(candidateReadView(bytes)('registry/contracts.json').equals(original('registry/contracts.json')));
 const wrong=Buffer.concat([current,Buffer.from('\n# invalid')]);assert(candidateReadView(name=>name==='registry/contracts.json'?wrong:bytes(name))('registry/contracts.json').equals(wrong));
 const changed=read('registry/contracts.json');changed.contracts[0].status='draft';assert.equal(projectCandidateRegistry(changed),changed);
});
for(const role of ['consumer','producer','semantic-owner','validation'])test('new planned B root cannot be selected or pinned: '+role,()=>{
 const registry=read('registry/contracts.json');const intent=registry.planned.find(x=>x.materializeIn==='F1-10B');
 const consumer={contracts:[{id:intent.id,role,version:'1.0.0',operations:[],pointers:['']}],assets:[]};
 assert.throws(()=>makeLock(root,consumer,Buffer.from(JSON.stringify(consumer)),registry),/Unknown\/unmaterialized contract/);
});
test('v9 preserves each v8 error and gives every new code one explicit owner and status',()=>{
 const previous=read('common/errors/v8/error-catalog-v8.json'),current=read('common/errors/v9/error-catalog-v9.json');assert.equal(current.version,9);assert.deepEqual(current.errors.slice(0,previous.errors.length),previous.errors);
 assert.equal(new Set(current.errors.map(x=>x.code)).size,current.errors.length);for(const row of current.errors.slice(previous.errors.length)){assert(row.owner&&row.domain);assert.equal(row.statuses.length,1);assert.deepEqual(row.allowed_parameters,[]);}
});
test('classification enumerates every new schema property, retains no secrets and declares all storage guards',()=>{
 const catalogue=read('inventory/http/shared/v1/inventory-lifecycle-policy-v1.json');const expected=[];
 function visit(value,pointer,file){if(!value||typeof value!=='object')return;if(value.properties)for(const name of Object.keys(value.properties))expected.push(file+'#'+pointer+'/properties/'+name.replaceAll('~','~0').replaceAll('/','~1'));for(const [key,v] of Object.entries(value))if(!key.startsWith('x-')){if(Array.isArray(v))v.forEach((x,i)=>visit(x,pointer+'/'+key+'/'+i,file));else if(v&&typeof v==='object')visit(v,pointer+'/'+key,file);}}
 for(const source of catalogue.sources){assert.equal(createHash('sha256').update(bytes(source.path)).digest('hex'),source.sha256);visit(read(source.path),'',source.path);}
 assert.deepEqual(catalogue.transport_fields.map(x=>x.source+'#'+x.pointer).sort(),expected.sort());
 for(const field of catalogue.transport_fields){assert.equal(field.classification.sensitivity,'RESTRICTED');assert(field.classification.log_policy);if(/jwt|cookie|credential|secret/iu.test(field.pointer))assert.equal(field.persistence,'prohibited');}
 assert.equal(catalogue.production_enabled,false);assert.equal(catalogue.runtime_demonstrated,false);assert.equal(catalogue.storage_policies.length,12);
 for(const policy of catalogue.storage_policies){assert.equal(policy.production_enabled,false);assert(policy.bounds.minimum&&policy.bounds.default&&policy.bounds.maximum);assert(policy.guards.includes('unknown obligation or hold blocks disposition'));}
});
