import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root,ianaSuccessors,ianaFixtures,validateIanaSource} from './iana-source-v1.mjs';
import {resolveSchema} from './schema-v2.mjs';

export function nativeIanaCases(){
 const vectors=JSON.parse(fs.readFileSync(path.join(root,ianaFixtures)));
 const canonical=JSON.parse(fs.readFileSync(path.join(root,'identity/fixtures/sales-authority/v1/human.json')))[0].request;
 const definitions={
  finalize:resolveSchema('sales/http/shared/v3/sales-types-v3.schema.json','/$defs/Finalize'),
  canonical:resolveSchema('identity/http/shared/v2/identity-sales-authority-v2.schema.json','/$defs/CanonicalRequest'),
  previous:resolveSchema('identity/http/shared/v1/identity-sales-authority-v1.schema.json','/$defs/CanonicalRequest'),
  completed:resolveSchema('sales/events/v3/sales.sale.completed.v3.schema.json'),
  previousCompleted:resolveSchema('sales/events/v2/sales.sale.completed.v2.schema.json'),
  history:resolveSchema('sales/http/shared/v3/sales-types-v3.schema.json','/$defs/HistoryRequest'),
 };
 const instances=[],prefixItems=[];
 const add=(name,value,accept)=>{instances.push(structuredClone(value));prefixItems.push(accept?{$ref:'#/$defs/'+name}:{not:{$ref:'#/$defs/'+name}});};
 for(const zone of vectors.positive){
  const request=structuredClone(canonical);request.body.operating_date.time_zone=zone;
  add('finalize',request.body,true);add('canonical',request,true);
  // The old source must retain its original language, including digit rejection.
  add('previous',request,!/\d/.test(zone));
  const completed=JSON.parse(fs.readFileSync(path.join(root,'sales/fixtures/completion/v2/pending.json')));
  completed.payload.operating_date.time_zone=zone;
  add('previousCompleted',completed,!/\d/.test(zone));
  completed.event_type='sales.sale.completed.v3';add('completed',completed,true);
 }
 for(const zone of vectors.negative_shape){const request=structuredClone(canonical);request.body.operating_date.time_zone=zone;add('canonical',request,false);}
 const human=JSON.parse(fs.readFileSync(path.join(root,'identity/fixtures/sales-authority/v1/human.json')));
 const history=human.find(row=>row.request.operation_id==='createSalesHistoryReadSession').request.body;
 for(const families of [['sales.sale.completed.v2'],['sales.sale.completed.v3'],['sales.sale.completed.v2','sales.sale.completed.v3']])add('history',{...history,families},true);
 for(const families of [['sales.sale.completed.v3','sales.sale.completed.v3'],['sales.sale.completed.v4']])add('history',{...history,families},false);
 return {schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'array',items:false,minItems:instances.length,maxItems:instances.length,prefixItems,$defs:definitions},instances,positive:vectors.positive.length,negative:vectors.negative_shape.length};
}
async function run(){
 const offline=process.argv.slice(2);assert(offline.length===0||(offline.length===1&&offline[0]==='--offline'),'IANA_NATIVE_OPTIONS');
 validateIanaSource();
 const directory=path.join(root,'.ci-artifacts/sales-v2-iana-source',randomUUID());fs.mkdirSync(directory,{recursive:true});
 const execute=(command,args,name,expected=0)=>{
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,REDOCLY_TELEMETRY:'off',REDOCLY_SUPPRESS_UPDATE_NOTICE:'true'}});
  fs.writeFileSync(path.join(directory,name+'.log'),JSON.stringify({status:result.status,error:result.error?.message,stdout:result.stdout,stderr:result.stderr})+'\n');
  if(result.error||result.status!==expected){process.stderr.write(result.stderr??'');throw Error('IANA_NATIVE_FAILED:'+name+':'+result.status);}
  return (result.stdout??'')+(result.stderr??'');
 };
 const openapis=ianaSuccessors.filter(([,file])=>file.endsWith('.yaml')&&JSON.parse(fs.readFileSync(path.join(root,file))).openapi);
 for(const [i,[,file]]of openapis.entries()){
  const command=process.platform==='win32'?process.execPath:'npx',args=[...(process.platform==='win32'?[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npx-cli.js')]:[]),...offline,'--yes','@redocly/cli@2.53.3'];
  const output=execute(command,[...args,'lint',file,'--format','json'],'lint-'+i);
  const match=output.match(/\{\s*"totals"[\s\S]*?\n\}/);assert(match,'IANA_REDOD_REPORT');const report=JSON.parse(match[0]);
  assert.equal(report.version,'2.53.3');assert.equal(report.totals.errors,0);assert.equal(report.totals.warnings,0);
  execute(command,[...args,'bundle',file,'--dereferenced','--ext','json','--output',path.join(directory,'openapi-'+i+'.json')],'bundle-'+i);
 }
 const asyncapiFile='sales/events/v3/sales-flow-v3.asyncapi.yaml',asyncapi=JSON.parse(fs.readFileSync(path.join(root,asyncapiFile)));
 for(const message of Object.values(asyncapi.components.messages)){
  const file=path.posix.normalize(path.posix.join(path.posix.dirname(asyncapiFile),message.payload.schema.$ref));
  message.payload.schema={$schema:'https://json-schema.org/draft/2020-12/schema',...resolveSchema(file)};
 }
 const {Parser}=await import('@asyncapi/parser'),parsed=await new Parser().parse(asyncapi,{source:path.join(root,asyncapiFile)});
 fs.writeFileSync(path.join(directory,'asyncapi-diagnostics.json'),JSON.stringify(parsed.diagnostics));
 assert(parsed.document&&parsed.diagnostics.every(item=>item.severity>1),'IANA_ASYNCAPI_INVALID');
 const {schema,instances,positive,negative}=nativeIanaCases();
 for(const [file,value]of Object.entries({'schema.json':schema,'instances.json':instances,'invalid.json':[]}))fs.writeFileSync(path.join(directory,file),JSON.stringify(value));
 const docker=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',`type=bind,source=${directory},target=/data,readonly`,'ghcr.io/sourcemeta/jsonschema:v16.10.0'];
 assert.equal(execute('docker',[...docker,'--version'],'version').trim(),'16.10.0');
 execute('docker',[...docker,'metaschema','/data/schema.json'],'metaschema');
 execute('docker',[...docker,'validate','/data/schema.json','/data/instances.json','--format-assertion'],'batch');
 const rejected=execute('docker',[...docker,'validate','/data/schema.json','/data/invalid.json','--format-assertion'],'invalid-control',2);
 assert(rejected.includes('Schema validation failure'),'IANA_NEGATIVE_CONTROL');
 console.log(JSON.stringify({openapis:openapis.length,asyncapis:1,asyncapiDiagnostics:parsed.diagnostics.map(({code,severity})=>({code,severity})),positiveZones:positive,negativeShapes:negative,batchInstances:instances.length,invalidControlsRejected:1,redocly:'2.53.3',sourcemeta:'16.10.0',runtimeDemonstrated:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
