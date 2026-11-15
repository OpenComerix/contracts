import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parse} from 'yaml';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {resolveSelection} from '../../tools/architecture/graph.mjs';
import {validateAdmissionRegistry} from './operational-context-admission-v1.mjs';

export const root=path.resolve(import.meta.dirname,'../..');
export const base='73dfe6f1011b472e1520cf5328c1f1d7e1a37fc4';
const gitRead=createGitReader();
const original=gitRead(root,base);
export const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
export const files={options:'identity/http/shared/v1/identity-operational-options-v1.schema.json',shift:'finance/http/shared/v1/finance-open-shift-v1.schema.json',authority:'identity/http/shared/v1/identity-finance-operational-authority-v1.schema.json',policy:'identity/http/shared/v1/identity-operational-context-policy-v1.json',matrix:'identity/fixtures/operational-options/v1/consumption-map.json'};
export const openapis=['identity/http/public/v1/identity-operational-options-v1.yaml','identity/http/private/v1/identity-operational-options-v1.yaml','finance/http/public/v1/finance-open-shift-v1.yaml','finance/http/private/v1/finance-open-shift-v1.yaml','identity/http/private/v1/identity-finance-operational-authority-v1.yaml'];
export const authorityExamples='identity/fixtures/finance-operational-authority/v1/requests-and-results.json';
const encode=value=>JSON.stringify(value,null,2)+'\n';
const write=(dir,name,value)=>{fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),typeof value==='string'?value:encode(value));};
const text=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
export function operations(document) {return Object.entries(document.paths).flatMap(([route,item])=>Object.entries(item).filter(([method])=>['get','post','put','patch','delete'].includes(method)).map(([method,operation])=>({route,method:method.toUpperCase(),...operation})));}
// A fixture oracle, never JWT verification or a runtime authorization grant.
export function verifyAuthorityBinding(examples){
 const request=examples.DelegationRequest.request;
 assert.deepEqual(Object.keys(request).sort(),['body','canonicalization_version','idempotency_key','method','operation_id','path','query']);
 const canonical=JSON.stringify(Object.fromEntries(Object.keys(request).sort().map(key=>[key,request[key]])));
 const digest=createHash('sha256').update(canonical).digest('hex');
 assert.deepEqual(examples.AuthorizationRequest.request,request);
 assert.equal(examples.AuthorizationRequest.client_signal,examples.DelegationRequest.client_signal);
 assert.equal(examples.AuthorizationRequest.delegation_jwt,examples.Delegation.delegation_jwt);
 for(const result of [examples.Delegation,examples.Authorization]){assert.equal(result.operation_id,request.operation_id);assert.equal(result.request_hash,digest);assert.equal(result.canonicalization_version,request.canonicalization_version);}
 assert.equal(examples.Delegation.organization_id,examples.Authorization.organization_id);assert.equal(examples.Authorization.scope.organization_id,examples.Authorization.organization_id);
 const lifetime=Date.parse(examples.Delegation.expires_at)-Date.parse(examples.Delegation.issued_at);assert(lifetime>0&&lifetime<=60000);
 assert(examples.Authorization.valid_for_ms>0&&examples.Authorization.valid_for_ms<=2000);
}

export function consumptionMap() {
 const registry=JSON.parse(original('registry/contracts.json'));
 const rows=[];
 const selected={inventory:['createInitialWarehouse','listInventoryWarehouses','getInventoryWarehouse','adjustInventoryStock','getInventoryAdjustment','getInventoryPosition','listInventoryPositions','listInventoryReconciliations','getInventoryReconciliation'],finance:['createPosCashRegister','listCashRegisters','openCashShift','getCashShift','getCashShiftExpected'],sales:['finalizeOnlineSale','getSaleFinalization','getCompletedSale','resumeSaleFinalization']};
 for(const [domain,selection] of Object.entries(selected)) {
  const publicPath=domain==='sales'?'sales/http/public/v2/pos-sales-v2.yaml':`${domain}/http/public/v1/${domain}-v1.yaml`;
  const privatePath=domain==='sales'?'sales/http/private/v2/pos-sales-internal-v2.yaml':`${domain}/http/private/v1/${domain}-internal-v1.yaml`;
  const descriptor=registry.contracts.find(row=>row.path===publicPath&&row.status==='active');assert(descriptor,'MAP_PUBLIC_ADMISSION:'+domain);
  const privateDescriptor=registry.contracts.find(row=>row.path===privatePath&&row.status==='active');assert(privateDescriptor,'MAP_PRIVATE_ADMISSION:'+domain);
  const source=gitRead(root,descriptor.commit),privateSource=gitRead(root,privateDescriptor.commit);
  const publicOps=operations(parse(source(publicPath).toString())),privateOps=operations(parse(privateSource(privatePath).toString()));
  for(const id of selection){const pub=publicOps.find(op=>op.operationId===id),priv=privateOps.find(op=>op.operationId===id);assert(pub&&priv,'MAP_OPERATION:'+id);
   const closures=[[descriptor,source],[privateDescriptor,privateSource]].map(([entry,reader])=>{const closure=resolveSelection(reader,entry,{version:entry.version,operations:[id],pointers:[]},registry);return {contract:entry.id,files:closure.files.map(file=>file.path),units:closure.units.map(unit=>({path:unit.path,pointer:unit.pointer}))};});
   const authorityPath=`identity/http/private/v1/identity-${domain}-authority-v1${domain==='inventory'?'-1':''}.yaml`;
   const dependencies=registry.contracts.filter(row=>row.path===authorityPath||row.path===`identity/http/shared/v1/identity-${domain}-authority-policy-v1.json`||row.path===`${domain}/http/shared/v${domain==='sales'?2:1}/${domain}-protocol-policy-v${domain==='sales'?2:1}.json`).map(row=>({contract:row.id,pointers:['']}));
   rows.push({domain,operation_id:id,public_contract:descriptor.id,private_contract:privateDescriptor.id,method:pub.method,public_path:'/api/v1'+pub.route,private_path:'/api/v1'+priv.route,permission:pub['x-permission'],delegation:{create:'create'+domain[0].toUpperCase()+domain.slice(1)+'Delegation',check:'check'+domain[0].toUpperCase()+domain.slice(1)+'Authorization',header:domain==='inventory'?'X-OC-Delegation':'X-OpenComerix-Delegation',workload:'gateway-bff.'+domain,audience:(domain==='sales'?'sales-pos':domain)+'.user-api'},public_parameters:pub.parameters??[],private_parameters:priv.parameters??[],success:Object.keys(pub.responses).filter(code=>/^2/.test(code)),errors:Object.entries(pub.responses).filter(([code])=>!/^2/.test(code)).map(([status,response])=>({status,headers:response.headers??{},schema:response.content?.['application/problem+json']?.schema})),closures,semantic_dependencies:dependencies,consumers:['gateway-bff','web-pos'],selection_cut:'C/D/E',semantic_policy:`${domain}/http/shared/v${domain==='sales'?2:1}/${domain}-protocol-policy-v${domain==='sales'?2:1}.json`});
  }
 }
 rows.push({domain:'identity',operation_id:'listOperationalOptions',public_source:openapis[0],private_source:openapis[1],method:'GET',public_path:'/api/v1/tenancy/operational-options',private_path:'/api/v1/tenancy/operational-options',permission:null,authority:'Current active session and scopes; no sales permission',delegation:{create:'createGatewayUserDelegation',header:'Authorization',cookie_to:'identity-tenancy only',caller:'gateway-bff',audience:'identity-tenancy.user-api',workload:'gateway-bff',workload_audience:'identity-tenancy.gateway'},consumers:['gateway-bff','web-pos'],selection_cut:'B/C/D',semantic_policy:files.policy});
 rows.push({domain:'finance',operation_id:'getOpenCashShift',public_source:openapis[2],private_source:openapis[3],method:'GET',public_path:'/api/v1/finance/cash-registers/{cash_register_id}/open-shift',private_path:'/api/v1/finance/cash-registers/{cash_register_id}/open-shift',permission:'finance.cash.read',delegation:{source:openapis[4],create:'createFinanceOperationalDelegation',check:'checkFinanceOperationalAuthorization',header:'X-OpenComerix-Delegation',workload:'gateway-bff.finance',audience:'finance.user-api'},consumers:['gateway-bff','web-pos'],selection_cut:'B/C/D',semantic_policy:files.policy});
 const mappings=[...new Map([...registry.contracts.flatMap(row=>row.uriMappings??[]),...[files.options,files.shift,files.authority].map(file=>({uri:read(file).$id,path:file}))].map(row=>[row.uri,row])).values()];
 for(const row of rows.filter(row=>row.public_source)){
  const pub=operations(read(row.public_source))[0],priv=operations(read(row.private_source))[0];
  row.public_parameters=pub.parameters??[];row.private_parameters=priv.parameters??[];
  row.success=Object.keys(pub.responses).filter(status=>/^2/.test(status));
  row.errors=Object.entries(pub.responses).filter(([status])=>!/^2/.test(status)).map(([status,response])=>({status,headers:response.headers??{},schema:response.content?.['application/problem+json']?.schema}));
  row.closures=[row.public_source,row.private_source].map(file=>{const closure=resolveSelection(name=>fs.readFileSync(path.join(root,name)),{path:file,version:'1.0.0',uriMappings:mappings},{version:'1.0.0',operations:[row.operation_id],pointers:[]},registry);return {source:file,files:closure.files.map(value=>value.path),units:closure.units.map(value=>({path:value.path,pointer:value.pointer}))};});
  row.semantic_sources=[{source:files.policy,pointers:['']}];
  if(row.domain==='finance')row.semantic_sources.push({source:openapis[4],operations:['createFinanceOperationalDelegation','checkFinanceOperationalAuthorization']},{source:files.authority,pointers:['']});
  else row.semantic_dependencies=[{contract:registry.contracts.find(value=>value.path==='openapi/identity-gateway-delegation-v2.yaml').id,operations:['createGatewayUserDelegation']}];
 }
 return {format_version:1,status:'candidate',functional_admission:false,runtime_demonstrated:false,rows,exclusions:['createInventoryHistoryReadSession','readInventoryHistoryFacts','createFinanceHistoryReadSession','readFinanceHistoryFacts','createSalesHistoryReadSession','readSalesHistoryFacts'],closure:'Existing rows resolve through registry descriptor revisions and their exact operation selections plus authority/schema/protocol/workload/error dependencies. No parallel revision pins or consumer lock changes. New source candidates require full CI and selected admission before B–E.',recovery:read(files.policy).recovery};
}

export function verify(readFile=file=>fs.readFileSync(path.join(root,file))) {
 const json=file=>JSON.parse(readFile(file));
 const p=json(files.policy),a=json(files.authority),o=json(files.options),s=json(files.shift);
 verifyAuthorityBinding(json(authorityExamples));
 assert.equal(p.discovery.operation_id,'listOperationalOptions');assert.equal(p.finance.permission,'finance.cash.read');
 assert.equal(p.limits.decision_ms,2000);assert.equal(p.profiles.gateway_finance.audience,'finance.user-api');
 assert.equal(p.profiles.finance_identity.audience,'identity-tenancy.finance-authority');
 const old=JSON.parse(original('identity/http/shared/v1/identity-finance-authority-v1.schema.json'));
 assert.equal(a.$defs.CanonicalRequest.properties.operation_id.const,'getOpenCashShift');
 const request=a.$defs.CanonicalRequest;assert.equal(request.properties.method.const,'GET');assert.equal(request.properties.body.const,null);assert.equal(request.properties.idempotency_key.const,null);assert.equal(request.additionalProperties,false);assert.equal(request.properties.query.additionalProperties,false);assert.deepEqual(request.properties.query.properties,{});
 assert.equal(a.$defs.Delegation.properties.operation_id.const,'getOpenCashShift');assert.equal(a.$defs.Authorization.properties.operation_id.const,'getOpenCashShift');assert.equal(a.$defs.Authorization.properties.permission.const,'finance.cash.read');
 for(const field of ['scope','versions','valid_for_ms','account_ref','membership_ref','device_ref','request_hash'])assert.deepEqual(a.$defs.Authorization.properties[field],old.$defs.Authorization.properties[field],'AUTHORITY_PRESERVE:'+field);
 for(const [document,producer,consumer] of [[o,'OperationalOptions','HttpOperationalOptions'],[s,'OpenShift','HttpOpenShift'],[a,'Delegation','HttpDelegation'],[a,'Authorization','HttpAuthorization']]){assert.equal(document.$defs[producer].additionalProperties,false);assert(!Object.hasOwn(document.$defs[consumer],'additionalProperties'));assert.deepEqual(document.$defs[producer].required,document.$defs[consumer].required);}
 for(const name of ['Delegation','Authorization'])assert.deepEqual(a.$defs['Http'+name].properties,a.$defs[name].properties,'AUTHORITY_READER_CONSTRAINTS:'+name);
 assert.deepEqual(s.$defs.PrivateClientSignal,a.$defs.ClientSignal,'PRIVATE_SIGNAL_FORM');
 const privateCash=operations(json(openapis[3]))[0];const signals=privateCash.parameters.filter(value=>value.name.toLowerCase()==='x-oc-client-signal');assert.equal(signals.length,1);assert.equal(signals[0].in,'header');assert.equal(signals[0].required,true);assert.equal(signals[0].schema.$ref,'../../shared/v1/finance-open-shift-v1.schema.json#/$defs/PrivateClientSignal');
 for(const operation of operations(json(openapis[4]))){const media=operation.responses['200'].content['application/json'];assert(media.schema.$ref.includes('#/$defs/Http'));assert(!media['x-producer-schema'].$ref.includes('#/$defs/Http'));}
 assert.deepEqual(json(files.matrix),consumptionMap(),'EXACT_CONSUMPTION_MAP');assert.equal(json(files.matrix).rows.length,20);
 assert.equal(new Set(json(files.matrix).rows.map(row=>row.operation_id)).size,20);
 const registered=JSON.parse(original('registry/contracts.json'));
 const current=json('registry/contracts.json');validateAdmissionRegistry(current);
 const preserved=new Set([...registered.contracts,...registered.preservedFiles].map(row=>row.path));
 for(const f of preserved)assert.equal(text(readFile(f)),text(original(f)),'PUBLISHED_BYTES:'+f);
 for(const f of ['package.json','pnpm-lock.yaml','registry/consumers/index.json',...registered.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json')])assert.equal(text(readFile(f)),text(original(f)),'CONSUMER_OR_DEPENDENCY:'+f);
 return {operations:20,new_roots:9,preserved:preserved.size,admission:true,runtime:false};
}

function execute(command,args,output,name,shell=false){const result=spawnSync(command,args,{cwd:root,encoding:'utf8',shell,windowsHide:true,maxBuffer:32*1024*1024,env:{...process.env,REDOCLY_TELEMETRY:'off',REDOCLY_SUPPRESS_UPDATE_NOTICE:'true'}});write(output,name+'.json',{command,args,status:result.status,error:result.error?.message??null,stdout:result.stdout??'',stderr:result.stderr??''});if(result.status!==0||result.error){process.stderr.write(result.stderr??'');process.stdout.write(result.stdout??'');throw Error('NATIVE_GATE_FAILED:'+name+':'+result.status);}return result.stdout;}
export function prepare(output) {
 const dir=path.resolve(root,output);assert(dir.startsWith(root+path.sep+'.ci-artifacts'+path.sep),'ARTIFACT_PATH');
 const optionExamples=read('identity/fixtures/operational-options/v1/responses.json'),shiftExamples=read('finance/fixtures/open-shift/v1/responses.json');
 const cases=[],schemas=new Map();
 const add=(name,file,definition,value,valid)=>{const key=file+'#'+definition;if(!schemas.has(key)){const schemaName='schema-'+schemas.size+'.json';write(dir,schemaName,{...read(file),$ref:'#/$defs/'+definition});schemas.set(key,schemaName);}write(dir,name+'.json',value);cases.push({name,valid,schema:schemas.get(key)});};
 for(const [prefix,file,producer,consumer,examples]of [['options',files.options,'OperationalOptions','HttpOperationalOptions',optionExamples],['shift',files.shift,'OpenShift','HttpOpenShift',shiftExamples]]){for(const [name,value]of Object.entries(examples)){add(prefix+'-'+name,file,producer,value,true);add(prefix+'-'+name+'-reader',file,consumer,{...value,compatible_extra:'ignored'},true);}const valid=Object.values(examples).at(-1);add(prefix+'-producer-extra',file,producer,{...valid,unpublished:true},false);const missing=structuredClone(valid);delete missing.organization_id;add(prefix+'-missing-org',file,consumer,missing,false);}
 const authorityData=read(authorityExamples),value=authorityData.DelegationRequest;
 const authorityCases=[['canonical',value,true],['wrong-operation',{...value,request:{...value.request,operation_id:'getCashShift'}},false],['free-query',{...value,request:{...value.request,query:{organization_id:'other'}}},false],['body',{...value,request:{...value.request,body:{}}},false],['key',{...value,request:{...value.request,idempotency_key:'01991a22-0000-7000-8000-000000000001'}},false],['wrong-method',{...value,request:{...value.request,method:'POST'}},false]];
 for(const [name,data,valid]of authorityCases)add('authority-'+name,files.authority,'DelegationRequest',data,valid);
 for(const definition of ['Delegation','AuthorizationRequest','Authorization']){
  add('authority-'+definition,files.authority,definition,authorityData[definition],true);
  const missing=structuredClone(authorityData[definition]);delete missing[definition==='AuthorizationRequest'?'delegation_jwt':'operation_id'];add('authority-'+definition+'-missing',files.authority,definition,missing,false);
  add('authority-'+definition+'-extra',files.authority,definition,{...authorityData[definition],unpublished:true},false);
 }
 for(const definition of ['Delegation','Authorization']){
  const reader='Http'+definition;add('authority-'+reader+'-extra',files.authority,reader,{...authorityData[definition],compatible_metadata:'ignored'},true);
  const missing=structuredClone(authorityData[definition]);delete missing.operation_id;add('authority-'+reader+'-missing',files.authority,reader,missing,false);
  const invalid=structuredClone(authorityData[definition]);invalid[definition==='Delegation'?'audience':'permission']=definition==='Delegation'?'other.user-api':'finance.cash.open';add('authority-'+reader+'-critical',files.authority,reader,invalid,false);
 }
 add('authority-HttpAuthorization-unknown-version',files.authority,'HttpAuthorization',{...authorityData.Authorization,versions:{...authorityData.Authorization.versions,unknown_authority:'1'}},false);
 for(const fixture of read('finance/fixtures/open-shift/v1/private-read-headers.json'))add('private-signal-'+fixture.name,files.shift,'PrivateReadHeaders',fixture.headers,fixture.valid);
 for(const [name,data,valid]of [['empty',{},true],['limit',{limit:'100'},true],['limit-over',{limit:'101'},false],['unknown',{organization_id:'other'},false],['empty-cursor',{cursor:''},false]])add('options-query-'+name,files.options,'Query',data,valid);
 const problem=read('common/http/shared/v3/problem-details-v3.schema.json'),problems=read('identity/fixtures/operational-options/v1/problems.json');
 const errorOperations=openapis.slice(0,4).map(file=>operations(read(file))[0]),seenErrors=new Set();
 for(const [name,entry]of Object.entries(problems)){
  for(const operation of errorOperations.filter(value=>value.operationId===entry.operation_id)){
   const condition=operation.responses[String(entry.status)].content['application/problem+json'].schema.allOf[1],key='error:'+JSON.stringify(condition);
   if(seenErrors.has(key+':'+name))continue;seenErrors.add(key+':'+name);
   if(!schemas.has(key)){const schemaName='schema-'+schemas.size+'.json';write(dir,schemaName,{$schema:'https://json-schema.org/draft/2020-12/schema',allOf:[problem,condition]});schemas.set(key,schemaName);}
   for(const [suffix,data,valid]of [['',entry.problem,true],['-wrong-code',{...entry.problem,code:'finance_cash_shift_required',type:'urn:opencomerix:problem:finance_cash_shift_required'},false],['-leak',{...entry.problem,cash_shift_id:'01991a22-0000-7000-8000-000000000002'},false]]){const fixture='problem-'+name+'-'+schemas.get(key).replace('.json','')+suffix;write(dir,fixture+'.json',data);cases.push({name:fixture,valid,schema:schemas.get(key)});}
  }
 }
 write(dir,'cases.json',cases);
 const lines=['set -eu','jsonschema version | grep 16.10.0',...[...schemas.values()].map(name=>'jsonschema metaschema '+name)];
 for(const {name,valid,schema}of cases){if(valid)lines.push('jsonschema validate '+schema+' '+name+'.json --format-assertion');else lines.push('set +e','jsonschema validate '+schema+' '+name+'.json --format-assertion > '+name+'.log 2>&1','result=$?','set -e','test "$result" -eq 2');}
 lines.push('printf "schemas='+schemas.size+' accepted='+cases.filter(row=>row.valid).length+' rejected='+cases.filter(row=>!row.valid).length+'\\n"');write(dir,'gate.sh',lines.join('\n')+'\n');
 return {schemas:schemas.size,accepted:cases.filter(row=>row.valid).length,rejected:cases.filter(row=>!row.valid).length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,output='.ci-artifacts/f1-14a',flag]=process.argv.slice(2);assert(['verify','openapi','prepare','schema','matrix'].includes(mode),'MODE');
 assert(/^\.ci-artifacts\/[A-Za-z0-9_-]+$/.test(output),'ARTIFACT_OUTPUT');
 assert(process.argv.length<=5&&(flag===undefined||(mode==='openapi'&&flag==='--offline')),'OPTIONS');
 if(['verify','matrix'].includes(mode))assert.equal(process.argv.length,3,'OPTIONS');
 if(mode==='matrix'){write(root,files.matrix,consumptionMap());console.log('matrix written');}
 if(mode==='verify')console.log(JSON.stringify(verify()));
 if(mode==='openapi'){for(const [index,file]of openapis.entries()){const command=process.platform==='win32'?'npx.cmd':'npx';const args=[...(flag==='--offline'?['--offline']:[]),'--yes','@redocly/cli@2.53.3'];const report=execute(command,[...args,'lint',file,'--format','json'],path.join(root,output),'lint-'+index,process.platform==='win32');const start=report.indexOf('{\n  "totals"'),end=report.indexOf('\n}',start);assert(start>=0&&end>start,'REDOCLY_REPORT');const totals=JSON.parse(report.slice(start,end+2));assert.equal(totals.version,'2.53.3');assert.equal(totals.totals.errors,0);assert.equal(totals.totals.warnings,0);execute(command,[...args,'bundle',file,'--dereferenced','--ext','json','--output',output+'/openapi-'+index+'.bundle.json'],path.join(root,output),'bundle-'+index,process.platform==='win32');}console.log(JSON.stringify({openapis:5,warnings:0}));}
 if(mode==='prepare')console.log(JSON.stringify(prepare(output)));
 if(mode==='schema'){const expected=prepare(output);const result=execute('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount','type=bind,source='+path.resolve(root,output)+',target=/work','--workdir','/work','--entrypoint','sh','ghcr.io/sourcemeta/jsonschema:v16.10.0','gate.sh'],path.join(root,output),'sourcemeta');assert(result.includes('schemas='+expected.schemas+' accepted='+expected.accepted+' rejected='+expected.rejected),'NATIVE_TOTALS');console.log(JSON.stringify(expected));}
}
