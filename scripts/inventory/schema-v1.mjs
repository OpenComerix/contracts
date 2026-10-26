import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const root=path.resolve(import.meta.dirname,'../..');
export const read=file=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(path.join(root,file))));
export function pointer(value,fragment='') {
  assert(fragment===''||fragment.startsWith('/'),'B_POINTER');
  return fragment===''?value:fragment.slice(1).split('/').reduce((v,k)=>{assert(!/~(?![01])/u.test(k),'B_POINTER');k=k.replaceAll('~1','/').replaceAll('~0','~');assert(v&&Object.hasOwn(v,k),'B_POINTER_MISSING');return v[k];},value);
}
export function source(file) {
  assert(typeof file==='string'&&!file.includes('\\')&&!path.posix.isAbsolute(file)&&!file.split('/').includes('..'),'B_SOURCE_PATH');
  assert(/^(inventory|identity|catalog|sales|common|commands|events)\//u.test(file),'B_SOURCE_OWNER');
  let current=root;
  for(const part of file.split('/')){current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink(),'B_SOURCE_LINK');}
  assert.equal(fs.realpathSync(current),current,'B_SOURCE_REALPATH');
  return read(file);
}
export function resolveSchema(file,fragment='',trail=[]) {
  const key=file+'#'+fragment;assert(!trail.includes(key),'B_REFERENCE_CYCLE');
  const visit=value=>{
    if(Array.isArray(value))return value.map(visit);
    if(!value||typeof value!=='object')return value;
    const out=Object.fromEntries(Object.entries(value).filter(([k])=>!['$schema','$id','$defs','$ref'].includes(k)).map(([k,v])=>[k,visit(v)]));
    if(!Object.hasOwn(value,'$ref'))return out;
    assert(typeof value.$ref==='string'&&!/^[a-z]+:|^[/\\]|\\|%/iu.test(value.$ref),'B_REFERENCE_LOCAL');
    const parts=value.$ref.split('#');assert(parts.length<=2,'B_REFERENCE_FRAGMENT');
    const target=parts[0]?path.posix.normalize(path.posix.join(path.posix.dirname(file),parts[0])):file;
    const resolved=resolveSchema(target,parts[1]??'',[...trail,key]);
    return Object.keys(out).length?{allOf:[resolved,out]}:resolved;
  };
  return visit(pointer(source(file),fragment));
}
export function prepare(output='.ci-artifacts/inventory-v1-'+randomUUID()) {
  assert(output.startsWith('.ci-artifacts/inventory-v1-')&&!output.includes('..'),'B_OUTPUT_PATH');
  const directory=path.join(root,output);fs.mkdirSync(path.dirname(directory),{recursive:true});fs.mkdirSync(directory);
  const save=(f,v)=>fs.writeFileSync(path.join(directory,f),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx'});
  const cases=[];
  const add=(id,file,fragment,value,expected='accept')=>{
    assert(!cases.some(x=>x.id===id),'B_CASE_DUPLICATE');
    const s=id+'.schema.json',f=id+'.json';save(s,{$schema:'https://json-schema.org/draft/2020-12/schema',...resolveSchema(file,fragment)});save(f,value);
    cases.push({id,file,fragment,value,expected,schema:s,fixture:f});
  };
  const type='inventory/http/shared/v1/inventory-types-v1.schema.json';
  for(const name of ['normal','zero_with_difference','negative_with_difference','first_movement','block_rejection','missing_permission_rejection','missing_presence_rejection','same_position_presentations','non_stock','service']) {
    const sample=read('inventory/fixtures/effects/v1/'+name+'.json');
    add(name+'-command','inventory/commands/v1/inventory.post-sale-stock.v1.schema.json','',sample.command);
    add(name+'-result','inventory/commands/v1/inventory.post-sale-stock.result.v1.schema.json','',sample.result);
    for(const [i,e] of sample.events.entries())add(name+'-event-'+i,'inventory/events/'+(e.event_type.endsWith('.v2')?'v2':'v1')+'/'+e.event_type+'.schema.json','',e);
    add(name+'-step-query','sales/http/shared/v1/sales-inventory-step-authority-v1.schema.json','/$defs/Request',sample.authority_query);
    add(name+'-step-decision','sales/http/shared/v1/sales-inventory-step-authority-v1.schema.json','/$defs/Decision',sample.authority);
    for(const [i,audit] of sample.observations.restricted_origin_audit.entries())add(name+'-restricted-audit-'+i,type,'/$defs/RestrictedOriginAudit',audit);
  }
  for(const name of ['before_output','after_difference','terminal_failure']) {
    const sample=read('inventory/fixtures/compensation/v1/'+name+'.json');
    add(name+'-command','inventory/commands/v1/inventory.compensate-sale-stock.v1.schema.json','',sample.command);
    add(name+'-result','inventory/commands/v1/inventory.compensate-sale-stock.result.v1.schema.json','',sample.result);
    for(const [i,e] of sample.events.entries())add(name+'-event-'+i,'inventory/events/v1/'+e.event_type+'.schema.json','',e);
    add(name+'-step','sales/http/shared/v1/sales-inventory-step-authority-v1.schema.json','/$defs/Decision',sample.authority);
  }
  const human=read('identity/fixtures/inventory-authority/v1/human.json');
  add('canonical-request','identity/http/shared/v1/identity-inventory-authority-v1.schema.json','/$defs/CanonicalRequest',human.request);
  add('human-decision','identity/http/shared/v1/identity-inventory-authority-v1.schema.json','/$defs/Authorization',human.decision);
  const capture=read('catalog/fixtures/inventory-capture/v1/capture.json');
  for(const [key,def] of [['request','CaptureRequest'],['response','Capture']])add('capture-'+key,'catalog/http/shared/v1/catalog-inventory-capture-v1.schema.json','/$defs/'+def,capture[key]);
  for(const name of ['complete','partial']) {
    const sample=read('inventory/fixtures/history/v1/'+name+'.json');
    add('history-'+name+'-session',type,'/$defs/HistorySession',sample.session);add('history-'+name+'-page',type,'/$defs/HistoryPage',sample.page);
    for(const [i,item] of sample.page.items.entries())add('history-'+name+'-original-'+i,'inventory/events/v2/'+item.event_type+'.schema.json','',JSON.parse(item.original_json));
  }
  const adjustment=read('inventory/fixtures/adjustment/v1/opening.json');
  add('adjust-request',type,'/$defs/AdjustmentRequest',adjustment.request);add('adjust-result',type,'/$defs/Adjustment',adjustment.result);add('adjust-event','inventory/events/v1/inventory.stock-adjustment.recorded.v1.schema.json','',adjustment.event);
  const resources=read('inventory/fixtures/http/v1/resources.json');
  for(const [def,value] of Object.entries(resources))add('resource-'+def,type,'/$defs/'+def,value);
  const futureWarehouse={...resources.Warehouse,optional_label:'synthetic compatible response field'};
  const reconciliation=structuredClone(resources.Reconciliation);
  reconciliation.occurrences=[read('inventory/fixtures/effects/v1/zero_with_difference.json').events[1].payload];
  add('http-reconciliation',type,'/$defs/HttpReconciliation',reconciliation);
  const leaked=structuredClone(reconciliation);leaked.occurrences[0].difference.grant_decision_ref='synthetic-restricted-decision';
  add('http-reconciliation-restricted-leak',type,'/$defs/HttpReconciliation',leaked,'reject');
  for(const [name,file,index] of [['posted','inventory/events/v2/inventory.sale-stock.posted.v2.consumer.schema.json',0],['reconciliation','inventory/events/v2/inventory.reconciliation-required.v2.consumer.schema.json',1]]) {
    const event=read('inventory/fixtures/effects/v1/zero_with_difference.json').events[index];
    add('consumer-'+name+'-physical',file,'',structuredClone(event));
    (index===0?event.payload.differences[0]:event.payload.difference).grant_decision_ref='synthetic-restricted-decision';
    add('consumer-'+name+'-restricted-leak',file,'',event,'reject');
  }
  for(const [name,directory,type] of [['normal','effects','post'],['after_difference','compensation','compensate']]) {
    const command=read('inventory/fixtures/'+directory+'/v1/'+name+'.json').command;
    const file='inventory/commands/v1/inventory.'+type+'-sale-stock.v1.consumer.schema.json';
    add('consumer-'+type+'-step-command',file,'',structuredClone(command));
    delete command.payload.step_id;add('consumer-'+type+'-missing-step',file,'',command,'reject');
  }
  add('http-compatible-response',type,'/$defs/HttpWarehouse',futureWarehouse);
  add('producer-unexpected-response-field',type,'/$defs/Warehouse',futureWarehouse,'reject');
  const negatives=read('inventory/fixtures/validation/v1/negative-cases.json');
  for(const n of negatives.cases) {
    const base=cases.find(x=>x.id===n.source_case);assert(base,'B_NEGATIVE_SOURCE');
    const value=structuredClone(base.value);const parts=n.path.split('/');const key=parts.pop();const parent=pointer(value,parts.join('/'));
    if(n.remove)delete parent[key];else parent[key]=n.value;
    add(n.id,base.file,base.fragment,value,'reject');
  }
  const sample=read('inventory/fixtures/effects/v1/normal.json').events[0];sample.payload.extensions={source_note:'synthetic-compatible-metadata'};
  add('producer-extra-metadata','inventory/events/v2/inventory.sale-stock.posted.v2.schema.json','',sample,'reject');
  add('consumer-declared-metadata','inventory/events/v2/inventory.sale-stock.posted.v2.consumer.schema.json','',sample,'accept');
  const unknown=structuredClone(sample);unknown.payload.extensions.permission='inventory.adjust';
  add('consumer-unknown-metadata','inventory/events/v2/inventory.sale-stock.posted.v2.consumer.schema.json','',unknown,'reject');
  const errors=read('common/errors/v9/error-catalog-v9.json');add('errors-v9','common/errors/v9/error-catalog-v9.schema.json','',errors);
  if(fs.existsSync(path.join(root,'inventory/http/shared/v1/inventory-lifecycle-policy-v1.json')))add('lifecycle','inventory/http/shared/v1/inventory-lifecycle-policy-v1.schema.json','',read('inventory/http/shared/v1/inventory-lifecycle-policy-v1.json'));
  save('cases.tsv',cases.map(x=>[x.id,x.expected,x.schema,x.fixture].join('\t')).join('\n')+'\n');
  const schemas=[];
  function collect(directory,relative){for(const f of fs.readdirSync(directory,{withFileTypes:true})){const name=relative+'/'+f.name;if(f.isDirectory())collect(path.join(directory,f.name),name);else if(f.name.endsWith('.schema.json'))schemas.push(name);}}
  for(const d of ['inventory/http','inventory/events','inventory/commands'])collect(path.join(root,d),d);
  for(const file of ['identity/http/shared/v1/identity-inventory-authority-v1.schema.json','catalog/http/shared/v1/catalog-inventory-capture-v1.schema.json','sales/http/shared/v1/sales-inventory-step-authority-v1.schema.json','common/errors/v9/error-catalog-v9.schema.json'])schemas.push(file);
  fs.mkdirSync(path.join(directory,'raw'));
  const packedSchemas=schemas.map((file,index)=>{const name='raw/source-'+index+'.schema.json';save(name,source(file));return name;});
  save('schemas.txt',packedSchemas.join('\n')+'\n');
  save('gate.sh',fs.readFileSync(path.join(root,'scripts/inventory/validate-v1.sh'),'utf8').replaceAll('\r\n','\n'));
  save('manifest.json',{runtime_demonstrated:false,cases:cases.map(({value,...x})=>x),schema_count:schemas.length});
  return {output,positive:cases.filter(x=>x.expected==='accept').length,negative:cases.filter(x=>x.expected==='reject').length,schemas:schemas.length,runtime_demonstrated:false};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(prepare(process.argv[2])));
