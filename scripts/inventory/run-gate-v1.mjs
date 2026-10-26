import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {prepare,root,read,resolveSchema} from './schema-v1.mjs';

export const openapis=[
 'inventory/http/public/v1/inventory-v1.yaml','inventory/http/private/v1/inventory-internal-v1.yaml',
 'identity/http/private/v1/identity-inventory-authority-v1.yaml','catalog/http/private/v1/catalog-inventory-capture-v1.yaml','sales/http/private/v1/sales-inventory-step-authority-v1.yaml',
];
const [mode,...options]=process.argv.slice(2);
assert(['schema','openapi','asyncapi','impact'].includes(mode),'B_GATE_MODE');
assert(options.every(x=>x==='--offline')&&options.length<=1,'B_GATE_OPTIONS');
const directory='.ci-artifacts/inventory-v1-'+randomUUID();
const execute=(file,args,name,shell=false)=>{
 const result=spawnSync(file,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,shell,env:{...process.env,REDOCLY_TELEMETRY:'off',REDOCLY_SUPPRESS_UPDATE_NOTICE:'true'}});
 fs.mkdirSync(path.join(root,directory),{recursive:true});
 fs.writeFileSync(path.join(root,directory,name+'.log'),JSON.stringify({exit:result.status,error:result.error?.message??null,stdout:result.stdout??'',stderr:result.stderr??''})+'\n');
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.error)throw result.error;
 if(result.status!==0){if(result.stdout)process.stdout.write(result.stdout);throw Error('B_GATE_FAILED:'+name+':'+result.status);}
 return result.stdout;
};
if(mode==='schema') {
 const prepared=prepare(directory);
 const pack=path.join(root,directory);assert.equal(fs.realpathSync(pack),pack,'B_PACK_REALPATH');
 const output=execute('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',`type=bind,source=${pack},target=/work`,'--workdir','/work','--entrypoint','sh','ghcr.io/sourcemeta/jsonschema:v16.10.0','gate.sh','.'],'sourcemeta');
 const match=/schemas=(\d+) accepted=(\d+) invalid_rejected=(\d+)/u.exec(output);assert(match,'B_SCHEMA_SUMMARY');
 assert.deepEqual(match.slice(1).map(Number),[prepared.schemas,prepared.positive,prepared.negative],'B_SCHEMA_COUNTS');
 console.log(JSON.stringify({...prepared,validator:'Sourcemeta 16.10.0',result:'passed'}));
}else if(mode==='openapi') {
 const npx=process.platform==='win32'?'npx.cmd':'npx';
 const command=[...(options.includes('--offline')?['--offline']:[]),'--yes','@redocly/cli@2.53.3'];
 const knownWarnings=[];
 for(const [i,file] of openapis.entries()) {
   const out=execute(npx,[...command,'lint',file,'--format','json'],'openapi-'+i+'-lint',process.platform==='win32');
   const start=out.indexOf('{\n  "totals"'),end=out.indexOf('\n}',start);assert(start>=0&&end>start,'B_REDOC_JSON');
   const report=JSON.parse(out.slice(start,end+2));assert.equal(report.version,'2.53.3','B_REDOC_VERSION');
   assert.equal(report.totals.errors,0,'B_REDOC_ERRORS');
   if(report.totals.warnings) {
     // Redocly reports two required-property false positives inside the strict
     // published result envelope. Preserve source bytes and every diagnostic;
     // no warning in a new contract or any other historical location is allowed.
     const expected=['#/allOf/0/then/not/required/0','#/allOf/1/then/required/0'];
     assert.equal(file,'inventory/http/private/v1/inventory-internal-v1.yaml','B_NEW_REDOC_WARNINGS');
     assert.equal(report.totals.warnings,2,'B_NEW_REDOC_WARNINGS');
     assert.deepEqual(report.problems.map(x=>x.location[0].pointer).sort(),expected,'B_REDOC_WARNING_POINTERS');
     const descriptor=read('registry/contracts.json').contracts.find(x=>x.id==='common.command-result-envelope.v1');
     assert(descriptor,'B_ENVELOPE_PROVENANCE');
     const bytes=fs.readFileSync(path.join(root,descriptor.path));
     const hash=createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n','\n')).digest('hex');
     assert.equal(hash,descriptor.sha256,'B_ENVELOPE_BYTES');
     for(const warning of report.problems) {
       assert.equal(warning.ruleId,'no-required-schema-properties-undefined','B_NEW_REDOC_WARNINGS');
       assert.equal(warning.severity,'warn','B_NEW_REDOC_WARNINGS');
       assert.equal(warning.location[0].source.ref.replaceAll('\\','/').replace(/\/+/gu,'/'),descriptor.path,'B_NEW_REDOC_WARNINGS');
       assert.equal(warning.message,"Required property 'error_code' is not defined.",'B_NEW_REDOC_WARNINGS');
     }
     knownWarnings.push(...report.problems.map(x=>({file,rule:x.ruleId,source:descriptor.path,sha256:descriptor.sha256,pointer:x.location[0].pointer})));
   }
   execute(npx,[...command,'bundle',file,'--dereferenced','--ext','json','--output',directory+'/openapi-'+i+'.bundle.json'],'openapi-'+i+'-bundle',process.platform==='win32');
 }
 console.log(JSON.stringify({result:knownWarnings.length?'passed_with_known_source_warnings':'passed',validator:'Redocly 2.53.3',openapis:openapis.length,errors:0,warnings:knownWarnings.length,known_source_warnings:knownWarnings,output:directory,runtime_demonstrated:false}));
}else if(mode==='asyncapi') {
 const {Parser}=await import('@asyncapi/parser');
 const file='inventory/events/v1/inventory-flow-v1.asyncapi.yaml';const document=read(file);
 assert.equal(document.asyncapi,'3.0.0','B_ASYNC_VERSION');assert.equal(document['x-status'],'candidate','B_ASYNC_ADMISSION');
 assert.deepEqual(Object.keys(document.channels),['commands','results','events'],'B_ASYNC_CHANNELS');
 assert.equal(Object.keys(document.components.messages).length,8,'B_ASYNC_MESSAGE_COUNT');
 for(const message of Object.values(document.components.messages)) {
   const relative=message.payload.schema.$ref;
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),relative));
   message.payload.schema={$schema:'https://json-schema.org/draft/2020-12/schema',...resolveSchema(target)};
 }
 const {document:parsed,diagnostics}=await new Parser().parse(document,{source:path.join(root,file)});
 assert(parsed&&diagnostics.every(x=>x.severity>1),'B_ASYNC_INVALID:'+JSON.stringify(diagnostics.map(({code,severity,path})=>({code,severity,path}))));
 fs.mkdirSync(path.join(root,directory));fs.writeFileSync(path.join(root,directory,'diagnostics.json'),JSON.stringify(diagnostics)+'\n');
 console.log(JSON.stringify({result:'passed',parser:'3.6.4',asyncapi:'3.0.0',messages:8,diagnostics:diagnostics.map(({code,severity,path})=>({code,severity,path})),output:directory,runtime_demonstrated:false}));
}else {
 const out=execute(process.execPath,['tools/architecture/cli.mjs','impact','--output',directory+'/impact.json'],'impact');
 const data=JSON.parse(out);const stored=fs.readFileSync(path.join(root,directory,'impact.json'));
 assert.deepEqual(JSON.parse(stored),data,'B_IMPACT_JSON');
 console.log(JSON.stringify({result:'passed',complete_json:true,sha256:createHash('sha256').update(stored).digest('hex'),output:directory+'/impact.json',keys:Object.keys(data)}));
}
