import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {prepare,root,read,resolveSchema} from './schema-v2.mjs';

export const openapis=['sales/http/public/v2/pos-sales-v2.yaml','sales/http/private/v2/pos-sales-internal-v2.yaml','identity/http/private/v1/identity-sales-authority-v1.yaml','catalog/http/private/v1/catalog-sale-capture-v1.yaml','sales/http/private/v2/sales-catalog-capture-authority-v2.yaml'];
const [mode,...options]=process.argv.slice(2);assert(['schema','openapi','asyncapi','impact'].includes(mode),'D_GATE_MODE');assert(options.every(x=>x==='--offline')&&options.length<=1,'D_GATE_OPTIONS');
const output='.ci-artifacts/sales-v2-'+randomUUID();
function execute(file,args,name,shell=false){const r=spawnSync(file,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,shell,env:{...process.env,REDOCLY_TELEMETRY:'off',REDOCLY_SUPPRESS_UPDATE_NOTICE:'true'}});fs.mkdirSync(path.join(root,output),{recursive:true});fs.writeFileSync(path.join(root,output,name+'.log'),JSON.stringify({exit:r.status,error:r.error?.message??null,stdout:r.stdout??'',stderr:r.stderr??''})+'\n');if(r.stderr)process.stderr.write(r.stderr);if(r.error)throw r.error;if(r.status!==0){if(r.stdout)process.stdout.write(r.stdout);throw Error('D_GATE_FAILED:'+name+':'+r.status);}return r.stdout;}
if(mode==='schema'){
 const p=prepare(output),pack=path.join(root,output);assert.equal(fs.realpathSync(pack),pack,'D_PACK_REALPATH');
 const out=execute('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',`type=bind,source=${pack},target=/work`,'--workdir','/work','--entrypoint','sh','ghcr.io/sourcemeta/jsonschema:v16.10.0','gate.sh','.'],'sourcemeta');const match=/schemas=(\d+) accepted=(\d+) invalid_rejected=(\d+)/u.exec(out);assert(match,'D_SCHEMA_SUMMARY');assert.deepEqual(match.slice(1).map(Number),[p.schemas,p.positive,p.negative],'D_SCHEMA_COUNTS');console.log(JSON.stringify({...p,validator:'Sourcemeta 16.10.0',result:'passed'}));
}else if(mode==='openapi'){
 const npx=process.platform==='win32'?'npx.cmd':'npx',args=[...(options.includes('--offline')?['--offline']:[]),'--yes','@redocly/cli@2.53.3'];const warnings=[];
 for(const [i,file] of openapis.entries()){
  const out=execute(npx,[...args,'lint',file,'--format','json'],'openapi-'+i+'-lint',process.platform==='win32');const a=out.indexOf('{\n  "totals"'),b=out.indexOf('\n}',a);assert(a>=0&&b>a,'D_REDOD_JSON');const report=JSON.parse(out.slice(a,b+2));assert.equal(report.version,'2.53.3','D_REDOD_VERSION');assert.equal(report.totals.errors,0,'D_REDOD_ERRORS');
  assert.equal(report.totals.warnings,0,'D_NEW_WARNING');
  execute(npx,[...args,'bundle',file,'--dereferenced','--ext','json','--output',output+'/openapi-'+i+'.bundle.json'],'openapi-'+i+'-bundle',process.platform==='win32');
 }
 console.log(JSON.stringify({result:warnings.length?'passed_with_known_source_warnings':'passed',validator:'Redocly 2.53.3',openapis:openapis.length,errors:0,warnings:warnings.length,known_source_warnings:warnings,output,runtime_demonstrated:false}));
}else if(mode==='asyncapi'){
 const {Parser}=await import('@asyncapi/parser');const file='sales/events/v2/sales-flow-v2.asyncapi.yaml',doc=read(file);assert.equal(doc.asyncapi,'3.0.0','D_ASYND_VERSION');assert.equal(doc['x-status'],'candidate','D_ASYND_ADMISSION');assert.deepEqual(Object.keys(doc.channels),['events'],'D_ASYND_CHANNELS');assert.equal(Object.keys(doc.components.messages).length,1,'D_ASYND_MESSAGES');for(const m of Object.values(doc.components.messages)){const f=path.posix.normalize(path.posix.join(path.posix.dirname(file),m.payload.schema.$ref));m.payload.schema={$schema:'https://json-schema.org/draft/2020-12/schema',...resolveSchema(f)};}const {document,diagnostics}=await new Parser().parse(doc,{source:path.join(root,file)});assert(document&&diagnostics.every(x=>x.severity>1),'D_ASYND_INVALID:'+JSON.stringify(diagnostics.map(({code,severity,path})=>({code,severity,path}))));fs.mkdirSync(path.join(root,output));fs.writeFileSync(path.join(root,output,'diagnostics.json'),JSON.stringify(diagnostics)+'\n');console.log(JSON.stringify({result:'passed',parser:'3.6.4',messages:1,diagnostics:diagnostics.map(({code,severity,path})=>({code,severity,path})),output,runtime_demonstrated:false}));
}else{
 const out=execute(process.execPath,['tools/architecture/cli.mjs','impact','--output',output+'/impact.json'],'impact'),stored=fs.readFileSync(path.join(root,output,'impact.json'));assert.deepEqual(JSON.parse(out),JSON.parse(stored),'D_IMPACT_JSON');console.log(JSON.stringify({result:'passed',complete_json:true,sha256:createHash('sha256').update(stored).digest('hex'),output:output+'/impact.json'}));
}
