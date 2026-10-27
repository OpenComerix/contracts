import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const root=path.resolve(import.meta.dirname,'../..');
export const read=f=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(path.join(root,f))));
export function pointer(value,p=''){assert(p===''||p.startsWith('/'),'D_POINTER');return p===''?value:p.slice(1).split('/').reduce((v,k)=>{assert(!/~(?![01])/u.test(k),'D_POINTER');k=k.replaceAll('~1','/').replaceAll('~0','~');assert(v&&Object.hasOwn(v,k),'D_POINTER_MISSING');return v[k];},value);}
export function source(f){assert(typeof f==='string'&&!f.includes('\\')&&!f.split('/').includes('..')&&!path.posix.isAbsolute(f),'D_SOURCE_PATH');assert(/^(?:catalog|finance|identity|sales|common|commands|events)\//u.test(f),'D_SOURCE_OWNER');let current=root;for(const part of f.split('/')){current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink(),'D_SOURCE_LINK');}assert.equal(fs.realpathSync(current),current,'D_SOURCE_REALPATH');return read(f);}
export function resolveSchema(f,fragment='',trail=[]){const key=f+'#'+fragment;assert(!trail.includes(key),'D_REFERENCE_CYCLE');const visit=v=>{if(Array.isArray(v))return v.map(visit);if(!v||typeof v!=='object')return v;const out=Object.fromEntries(Object.entries(v).filter(([k])=>!['$schema','$id','$defs','$ref'].includes(k)).map(([k,x])=>[k,visit(x)]));if(!Object.hasOwn(v,'$ref'))return out;assert(typeof v.$ref==='string'&&!/^[a-z]+:|^[/\\]|\\|%/iu.test(v.$ref),'D_REFERENCE_LOCAL');const [relative,p='',...excess]=v.$ref.split('#');assert.equal(excess.length,0,'D_REFERENCE_FRAGMENT');const target=relative?path.posix.normalize(path.posix.join(path.posix.dirname(f),relative)):f;const resolved=resolveSchema(target,p,[...trail,key]);return Object.keys(out).length?{allOf:[resolved,out]}:resolved;};return visit(pointer(source(f),fragment));}
export function cases(){return read('sales/fixtures/validation/v2/cases.json').cases;}
export function valueOf(c){return pointer(read(c.fixture),c.pointer??'');}
export function prepare(output='.ci-artifacts/sales-v2-'+randomUUID()){
 assert(output.startsWith('.ci-artifacts/sales-v2-')&&!output.includes('..'),'D_OUTPUT_PATH');const dir=path.join(root,output);fs.mkdirSync(path.dirname(dir),{recursive:true});fs.mkdirSync(dir);
 const save=(f,v)=>fs.writeFileSync(path.join(dir,f),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 const all=cases();assert.equal(new Set(all.map(x=>x.id)).size,all.length,'D_CASE_DUPLICATE');
 for(const c of all){assert(/^[a-z0-9-]+$/u.test(c.id),'D_CASE_ID');save(c.id+'.schema.json',{$schema:'https://json-schema.org/draft/2020-12/schema',...resolveSchema(c.schema,c.fragment??'')});save(c.id+'.json',valueOf(c));}
 save('cases.tsv',all.map(c=>[c.id,c.expected,c.id+'.schema.json',c.id+'.json'].join('\t')).join('\n')+'\n');
 const schemas=[];for(const d of ['sales/http/shared/v2','sales/events/v2']){const collect=rel=>{for(const e of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){const f=rel+'/'+e.name;if(e.isDirectory())collect(f);else if(f.endsWith('.schema.json'))schemas.push(f);}};collect(d);}
 schemas.push('identity/http/shared/v1/identity-sales-authority-v1.schema.json','catalog/http/shared/v1/catalog-sale-capture-v1.schema.json','common/errors/v11/error-catalog-v11.schema.json');fs.mkdirSync(path.join(dir,'raw'));
 save('schemas.txt',schemas.map((f,i)=>{const name='raw/source-'+i+'.schema.json';save(name,source(f));return name;}).join('\n')+'\n');save('gate.sh',fs.readFileSync(path.join(root,'scripts/sales/validate-v2.sh'),'utf8').replaceAll('\r\n','\n'));
 const result={output,schemas:schemas.length,positive:all.filter(x=>x.expected==='accept').length,negative:all.filter(x=>x.expected==='reject').length,runtime_demonstrated:false};save('manifest.json',{...result,cases:all});return result;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(prepare(process.argv[2])));
