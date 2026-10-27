import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readLocal, pointer} from '../../tools/architecture/consumer-gate.mjs';
import {root, integrationPath} from './release-v1.mjs';

export const read = file => JSON.parse(readLocal(root, file));
export function resolveSchema(file, fragment = '', trail = []) {
  const identity = file + '#' + fragment;
  assert(!trail.includes(identity), 'E_SCHEMA_CYCLE');
  const visit = value => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const out = Object.fromEntries(Object.entries(value).filter(([key]) => !['$schema','$id','$defs','$ref'].includes(key)).map(([key, child]) => [key,visit(child)]));
    if (!Object.hasOwn(value,'$ref')) return out;
    assert(typeof value.$ref === 'string' && !/^[a-z]+:|^[/\\]|\\|%/iu.test(value.$ref), 'E_SCHEMA_REFERENCE');
    const [relative, next = '', ...extra] = value.$ref.split('#'); assert.equal(extra.length,0,'E_SCHEMA_FRAGMENT');
    const target = relative ? path.posix.normalize(path.posix.join(path.posix.dirname(file),relative)) : file;
    const resolved = resolveSchema(target,next,[...trail,identity]);
    return Object.keys(out).length ? {allOf:[resolved,out]} : resolved;
  };
  return visit(pointer(read(file),fragment));
}

export function messages(s) {
  const list = [
    ['request','sales/http/shared/v2/sales-types-v2.schema.json','/$defs/Finalize',s.request],
    ['accepted','sales/http/shared/v2/sales-types-v2.schema.json','/$defs/Accepted',s.accepted],
    ['catalog','catalog/http/shared/v1/catalog-sale-capture-v1.schema.json','/$defs/Capture',s.catalog],
  ];
  for (const [label, scenario] of [['stock',s.stock],['finance',s.finance],['compensation',s.compensation]]) {
    if (!scenario) continue;
    for (const [key, value] of [['command',scenario.command],['result',scenario.result]]) {
      const type = value.command_type ?? value.result_type, domain = type.split('.')[0];
      list.push([label + '-' + key,domain + '/commands/v1/' + type + '.schema.json','',value]);
    }
    const prefix = label === 'finance' ? 'sales-finance' : 'sales-inventory';
    for (const [key, definition] of [['authority_query','Request'],['authority','Decision']])
      list.push([label + '-' + key,'sales/http/shared/v1/' + prefix + '-step-authority-v1.schema.json','/$defs/' + definition,scenario[key]]);
    for (const [i,e] of scenario.events.entries()) list.push([label + '-event-' + i,eventSchema(e),'',e]);
  }
  if (s.completed) list.push(['completed',eventSchema(s.completed),'',s.completed]);
  return list;
}
export const eventSchema = event => event.event_type.split('.')[0] + '/events/v' + /\.v(\d+)$/u.exec(event.event_type)[1] + '/' + event.event_type + '.schema.json';

// The package records every pair explicitly; no inferred acceptance of a new
// major/revision or enum, and no consumer admission is written by this gate.
export function compatibilityMessages() {
  const all = new Map();
  for (const id of read(integrationPath + 'scenarios.json').scenarios) {
    const s = read(integrationPath + id + '.json');
    for (const [,schema,,value] of messages(s)) {
      const type = value.event_type ?? value.command_type ?? value.result_type;
      if (type && !all.has(type)) all.set(type,{type,schema,value});
    }
  }
  for (const [fixture,key] of [['inventory/fixtures/adjustment/v1/opening.json','event'],['finance/fixtures/opening/v1/positive.json','events']]) {
    const sample=read(fixture), value=key==='event'?sample.event:sample.events[0];
    assert(value?.event_type,'E_COMPATIBILITY_SAMPLE');all.set(value.event_type,{type:value.event_type,schema:eventSchema(value),value});
  }
  return [...all.values()];
}

export function prepare(output = '.ci-artifacts/sales-integration-v1-' + randomUUID()) {
  assert(/^\.ci-artifacts\/sales-integration-v1-[a-zA-Z0-9-]+$/u.test(output),'E_OUTPUT');
  const directory=path.join(root,output);fs.mkdirSync(path.dirname(directory),{recursive:true});fs.mkdirSync(directory);
  const save=(file,value)=>fs.writeFileSync(path.join(directory,file),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const cases=[], schemas=new Set();
  function add(id,schema,fragment,value,expected='accept') {
    assert(!cases.some(row=>row.id===id),'E_DUPLICATE_CASE');schemas.add(schema);
    save(id+'.schema.json',{$schema:'https://json-schema.org/draft/2020-12/schema',...resolveSchema(schema,fragment)});
    save(id+'.json',value);cases.push({id,expected,schema:id+'.schema.json',fixture:id+'.json',source:schema,fragment});
  }
  for(const id of read(integrationPath+'scenarios.json').scenarios)
    for(const [label,schema,fragment,value] of messages(read(integrationPath+id+'.json')))add(id+'-'+label.replaceAll('_','-'),schema,fragment,value);
  const matrix=read(integrationPath+'compatibility.json');
  const samples=compatibilityMessages();
  assert.deepEqual(matrix.pairs,samples.map(({type,schema})=>({type,revision:1,producer:schema,reader:schema.replace('.schema.json','.consumer.schema.json'),snapshot:type==='sales.sale.completed.v2'?1:null,calculation_policy:type==='sales.sale.completed.v2'?'sales-f1-ars-1':null})), 'E_PAIR_MATRIX');
  for(const [i,{type,schema,value}] of samples.entries()) {
    const reader=schema.replace('.schema.json','.consumer.schema.json'),base='pair-'+i;
    add(base+'-producer',schema,'',value);add(base+'-reader',reader,'',value);
    const extension=structuredClone(value);extension.payload.extensions={source_note:'SYNTHETIC-NON-AUTHORITATIVE'};
    add(base+'-extension-reader',reader,'',extension);add(base+'-extension-producer',schema,'',extension,'reject');
    for(const profile of [schema,reader]) {
      const suffix=profile===schema?'producer':'reader';
      const revision=structuredClone(value);revision.schema_version=2;add(base+'-revision-'+suffix,profile,'',revision,'reject');
      const major=structuredClone(value),field=value.event_type?'event_type':value.command_type?'command_type':'result_type';major[field]=type.replace(/\.v\d+$/u,'.v999');add(base+'-major-'+suffix,profile,'',major,'reject');
      const critical=structuredClone(value);
      if(critical.status)critical.status='UNKNOWN';
      else if(critical.payload.status)critical.payload.status='UNKNOWN';
      else if(critical.payload.amounts)critical.payload.amounts.method='UNKNOWN';
      else if(critical.payload.stock_status)critical.payload.stock_status='UNKNOWN';
      else if(critical.payload.lines?.[0]?.snapshot)critical.payload.lines[0].snapshot.product_type='UNKNOWN';
      else if(critical.payload.reason_code)critical.payload.reason_code='UNKNOWN';
      else if(critical.payload.kind)critical.payload.kind='UNKNOWN';
      else if(critical.payload.difference)critical.payload.difference.policy='UNKNOWN';
      else if(critical.payload.fiscal_context)critical.payload.fiscal_context.context_status='UNKNOWN';
      else if(critical.payload.currency)critical.payload.currency='USD';
      else throw Error('E_MISSING_CRITICAL_ENUM:'+type);
      add(base+'-enum-'+suffix,profile,'',critical,'reject');
    }
    if(type==='sales.sale.completed.v2')for(const [field,bad] of [['tax_snapshot_schema_version',99],['context_status','future']]) {
      const v=structuredClone(value);v.payload.fiscal_context[field]=bad;add(base+'-'+field,reader,'',v,'reject');
    }
  }
  save('cases.tsv',cases.map(row=>[row.id,row.expected,row.schema,row.fixture].join('\t')).join('\n')+'\n');
  fs.mkdirSync(path.join(directory,'raw'));
  save('schemas.txt',[...schemas].map((file,i)=>{const name='raw/'+i+'.schema.json';save(name,read(file));return name;}).join('\n')+'\n');
  save('gate.sh',fs.readFileSync(path.join(root,'scripts/sales/validate-v2.sh'),'utf8').replaceAll('\r\n','\n'));
  const result={output,schemas:schemas.size,positive:cases.filter(row=>row.expected==='accept').length,negative:cases.filter(row=>row.expected==='reject').length,pairs:samples.length,runtime_demonstrated:false};
  save('manifest.json',{...result,cases});return result;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(prepare(process.argv[2])));
