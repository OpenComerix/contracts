import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {parse} from 'yaml';
import {makeLock} from '../../tools/architecture/graph.mjs';
import {validateValidationTooling} from '../../tools/architecture/validation-history.mjs';
import {withOnlineAdmissionScope} from '../../scripts/sales/online-admission-v1.mjs';
import {projectPrivateZoneAdmissionFile} from '../../scripts/identity/branch-time-zone-private-v2-admission.mjs';
import {root,privateZoneSource,privateZonePath,privateZonePreviousPath,privateZoneId,
 privateZoneRegistry,privateZoneMetadata,privateZoneSourceFiles,privateZoneScopeFiles,privateZoneProtectedPaths,
 validatePrivateZoneInput,validatePrivateZonePreservedInput,validatePrivateZone,
 projectPrivateZoneFile,projectPrivateZoneDocument,withPrivateZoneScope,
} from '../../scripts/identity/branch-time-zone-private-v2.mjs';
const read=file=>fs.readFileSync(path.join(root,file));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const registryPath='registry/contracts.json';
const route='/tenancy/branches/{branch_id}/time-zone';

test('private v2 retains human authority and moves only browser Origin/CSRF enforcement to Gateway',()=>{
 const before=JSON.parse(privateZoneSource(privateZonePreviousPath)),current=JSON.parse(read(privateZonePath));
 assert.equal(current.info.version,'2.0.0');assert.equal(current['x-browser-security-owner'],'gateway-bff');
 assert.equal(current['x-browser-contract'],'../../public/v1/identity-branch-time-zone-v1.yaml');
 assert.deepEqual(current.security,before.security);
 assert.deepEqual(Object.keys(current.paths),[route]);
 assert.deepEqual(Object.keys(current.paths[route]),['get','put']);
 const expected=structuredClone(before);
 expected.info=current.info;expected['x-browser-security-owner']='gateway-bff';
 expected['x-browser-contract']='../../public/v1/identity-branch-time-zone-v1.yaml';
 delete expected.components.securitySchemes.csrfToken;
 for(const method of ['get','put']){
  const op=current.paths[route][method],prior=expected.paths[route][method];
  assert(op.description.startsWith(prior.description));
  assert.match(op.description,/Gateway validates browser Origin and session-bound X-CSRF-Token before forwarding each mutation/);
  assert.match(op.description,/Identity independently enforces the current delegated caller, original session, gateway-derived signal/);
  assert.equal(op['x-caller'],'gateway-bff');assert.equal(op['x-audience'],'identity-tenancy.user-api');
  assert(op.parameters.find(row=>row.name==='X-OC-Client-Signal').required);
  assert(!op.parameters.some(row=>['Origin','X-CSRF-Token'].includes(row.name)));
  prior.description=op.description;prior.parameters=prior.parameters.filter(row=>row.name!=='Origin');
  if(prior.security)prior.security=[{delegatedBearer:[],originSession:[]}];
  prior.responses['403'].content['application/problem+json'].schema.allOf[1].properties.code.enum=['identity_access_denied','identity_reauthentication_required'];
 }
 assert.deepEqual(current,expected,'No unrelated transport, schema, permission or replay change');
 const put=current.paths[route].put;
 assert.deepEqual(put.security,[{delegatedBearer:[],originSession:[]}]);
 assert.equal(put['x-permission'],'tenant.branch.time-zone.manage');
 assert.match(put.description,/Replay requires current authority/);
 const publicApi=JSON.parse(read('identity/http/public/v1/identity-branch-time-zone-v1.yaml'));
 assert(publicApi.paths[route].put.security[0].csrfToken);
 assert(publicApi.paths[route].put.parameters.find(row=>row.name==='Origin').required);
});

test('one planned source preserves 234 admitted roots, 236 artifacts and eight consumers; consumption stays forbidden',()=>{
 const result=validatePrivateZone();assert.equal(result.roots,234);assert.equal(result.planned,3);
 assert.equal(result.added,1);assert.equal(result.consumers,8);assert.equal(result.functionalAdmission,false);
 assert.equal(result.runtimeDemonstrated,false);assert.equal(result.protectedFiles,privateZoneProtectedPaths.length);
 const before=JSON.parse(privateZoneSource(registryPath)),registry=JSON.parse(projectPrivateZoneAdmissionFile(registryPath,read(registryPath)));
 assert.deepEqual(registry,privateZoneRegistry());assert.deepEqual(registry.contracts,before.contracts);
 assert.deepEqual(registry.preservedFiles,before.preservedFiles);assert.deepEqual(registry.planned.slice(0,2),before.planned);
 const row=registry.planned.at(-1);assert.equal(row.id,privateZoneId);assert.equal(row.path,privateZonePath);
 assert(!Object.hasOwn(row,'commit'));assert(!Object.hasOwn(row,'sha256'));
 const manifest={service:'isolated-private-zone',contracts:[{id:row.id,role:'producer',version:'2.0.0',operations:row.operations,pointers:[]}],assets:[]};
 assert.throws(()=>makeLock(root,manifest,encode(manifest),registry),/Unknown\/unmaterialized/);
 for(const file of ['identity/http/public/v1/identity-branch-time-zone-v1.yaml',privateZonePreviousPath,'registry/consumers/identity-tenancy.json'])
  assert.throws(()=>validatePrivateZonePreservedInput(file,Buffer.concat([read(file),Buffer.from('drift')])),/PRESERVATION/);
});

test('CI adds one lint/bundle for the new OpenAPI in the existing Identity job and preserves all other commands/jobs',()=>{
 const current=parse(projectPrivateZoneAdmissionFile('.github/workflows/ci.yml',read('.github/workflows/ci.yml')).toString()),before=parse(privateZoneSource('.github/workflows/ci.yml').toString());
 const steps=current.jobs.validate_identity_catalog_contracts.steps;
 const run=steps.find(step=>step.name==='Run original validation commands');
 const lint='node scripts/validate-redocly-no-warnings.mjs '+privateZonePath;
 const bundle='npx --yes @redocly/cli@2.53.3 bundle '+privateZonePath+' --dereferenced --ext json --output .ci-artifacts/branch-time-zone-private-v2.bundle.json';
 for(const command of [lint,bundle]){assert.equal(run.run.split(command).length,2);run.run=run.run.replace(command+'\n','');}
 const artifact=steps.find(step=>step.name==='Package original artifact paths');
 artifact.run=artifact.run.replace(' .ci-artifacts/branch-time-zone-private-v2.bundle.json','');
 assert.deepEqual(current,before);
});

test('bounded scope rejects modified/missing delta, partial registry and stale approval without full preservation per input',()=>{
 for(const file of privateZoneSourceFiles){
  validatePrivateZoneInput(file,read(file));
  assert.throws(()=>validatePrivateZoneInput(file,Buffer.concat([read(file),Buffer.from('drift')])),/PRIVATE_ZONE_BYTES/);
  for(const missing of [false,true])assert.throws(()=>withPrivateZoneScope([],name=>{
   if(name!==file)return read(name);if(missing)throw Error('missing delta');return Buffer.concat([read(name),Buffer.from('drift')]);
  },()=>assert.fail('invalid delta accepted')));
 }
 const partial=privateZoneRegistry();partial.planned.at(-1).version='9.0.0';
 assert.throws(()=>withPrivateZoneScope([],file=>file===registryPath?encode(partial):read(file),()=>assert.fail('partial accepted')),/PARTIAL_SCOPE/);
 for(const count of [1,10,100]){
  const visits=new Map();withPrivateZoneScope(['prior'],file=>{visits.set(file,(visits.get(file)??0)+1);return read(file);},(paths,historical)=>{
   assert.deepEqual(paths,['prior',...privateZoneScopeFiles]);for(let i=0;i<count;i++)assert.deepEqual(historical(registryPath),privateZoneSource(registryPath));
  });assert.equal(visits.size,privateZoneScopeFiles.length);assert([...visits.values()].every(n=>n===1));
 }
});

test('pure projections use exact supplied values; contexts close and reject asynchronous consumers',()=>{
 const metadata=privateZoneMetadata(),original=fs.readFileSync;
 fs.readFileSync=()=>{throw Error('unexpected live read');};syncBuiltinESMExports();
 try{for(const [file,bytes]of metadata){
  if(file===privateZonePath){assert.strictEqual(projectPrivateZoneFile(file,bytes),bytes);continue;}
  assert.deepEqual(projectPrivateZoneFile(file,bytes),privateZoneSource(file));
  const changed=Buffer.concat([bytes,Buffer.from('drift')]);assert.strictEqual(projectPrivateZoneFile(file,changed),changed);
  if(file.endsWith('.json')){
   assert.deepEqual(projectPrivateZoneDocument(file,JSON.parse(bytes)),JSON.parse(privateZoneSource(file)));
   const changed={...JSON.parse(bytes),unexpected:undefined};assert.strictEqual(projectPrivateZoneDocument(file,changed),changed);
  }
 }}finally{fs.readFileSync=original;syncBuiltinESMExports();}
 let escaped;withPrivateZoneScope([],read,(_paths,historical)=>{escaped=historical;});assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
 assert.throws(()=>withPrivateZoneScope([],read,()=>Promise.resolve()),/SYNCHRONOUS/);
 assert.throws(()=>withPrivateZoneScope([],read,(_paths,historical)=>{escaped=historical;throw Error('callback failure');}),/callback failure/);
 assert.throws(()=>escaped(registryPath),/CONTEXT_CLOSED/);
});

test('historical registry without v2 never exempts its unproved new path through the enclosing admission adapter',()=>{
 for(const scope of [withPrivateZoneScope,withOnlineAdmissionScope])scope(['prior'],privateZoneSource,(paths,historical)=>{
  assert(!paths.includes(privateZonePath),'A historical registry grants no new source scope');
  assert.equal(JSON.parse(historical(registryPath)).planned.some(row=>row.id===privateZoneId),false);
 });
});

test('reviewed tooling detects changed verifier and tests after warmup',()=>{
 validateValidationTooling(read);
 for(const file of ['scripts/identity/branch-time-zone-private-v2.mjs','test/identity/branch-time-zone-private-v2.test.mjs'])
  assert.throws(()=>validateValidationTooling(name=>name===file?Buffer.concat([read(name),Buffer.from('drift')]):read(name)),/VALIDATION_TOOLING_DRIFT/);
});
