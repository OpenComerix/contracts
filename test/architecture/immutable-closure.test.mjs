import test from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createGitReader,gitSourceIdentity} from '../../tools/architecture/git-source.mjs';
import {resolveSelection,makeLock,worktreeReader} from '../../tools/architecture/graph.mjs';

function fixture(t) {
  const parent=fs.realpathSync(os.tmpdir()), root=fs.mkdtempSync(path.join(parent,'oc-immutable-closure-'));
  t.after(()=>{assert.equal(path.dirname(root),parent);fs.rmSync(root,{recursive:true});});
  const git=args=>cp.execFileSync('git',['-C',root,'-c','core.autocrlf=false','-c','commit.gpgsign=false',
    '-c','user.name=Contract fixture','-c','user.email=fixture@example.invalid',
    '-c','core.hooksPath='+path.join(root,'no-hooks'),...args],{windowsHide:true,stdio:['pipe','pipe','pipe']}).toString().trim();
  git(['init','-q','-b','fixture']);fs.mkdirSync(path.join(root,'events'));
  const write=type=>fs.writeFileSync(path.join(root,'events/example.json'),JSON.stringify({$defs:{a:{type},b:{type:'integer'}}}));
  const commit=()=>{git(['add','--all']);git(['commit','-q','-m','Synthetic immutable source']);return git(['rev-parse','HEAD']);};
  write('string');const revision=commit();
  const descriptor={id:'example',path:'events/example.json',version:'1',commit:revision,tag:null,tagObject:null};
  const dependency={id:'example',version:'1',role:'validation',operations:[],pointers:['/$defs/a']};
  return {root,git,write,commit,revision,descriptor,dependency};
}
test('equivalent native Git readers reuse the closure without another tree or blob read',t=>{
  const {root,revision,descriptor,dependency}=fixture(t);
  const expected=resolveSelection(createGitReader()(root,revision),descriptor,dependency);
  const execute=cp.execFileSync,calls=[];
  t.mock.method(cp,'execFileSync',(program,args,options)=>{calls.push(args);return execute(program,args,options);});
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  const reader=createGitReader()(root,revision);calls.length=0;
  assert.deepEqual(resolveSelection(reader,descriptor,dependency),expected);
  assert.deepEqual(calls,[],'warm immutable closure does not resolve or parse its files again');
  assert(Object.isFrozen(gitSourceIdentity(reader)));
});
test('mutating any returned closure cannot poison the next immutable result',t=>{
  const {root,revision,descriptor,dependency}=fixture(t), read=createGitReader()(root,revision);
  const expected=resolveSelection(read,descriptor,dependency), changed=resolveSelection(read,descriptor,dependency);
  changed.values[0].value.type='number';changed.files[0].sha256='bad';changed.units.length=0;
  assert.deepEqual(resolveSelection(read,descriptor,dependency),expected);
});
test('selection, version and revision changes cannot inherit another closure',t=>{
  const {root,revision,descriptor,dependency,write,commit}=fixture(t), read=createGitReader()(root,revision);
  const first=resolveSelection(read,descriptor,dependency);
  assert.notEqual(resolveSelection(read,descriptor,{...dependency,pointers:['/$defs/b']}).selectionSha256,first.selectionSha256);
  assert.throws(()=>resolveSelection(read,descriptor,{...dependency,version:'2'}),/version/);
  assert.throws(()=>resolveSelection(read,descriptor,{...dependency,pointers:['/missing']}));
  write('number');const next=commit();
  assert.notEqual(resolveSelection(createGitReader()(root,next),descriptor,dependency).selectionSha256,first.selectionSha256);
  assert.deepEqual(resolveSelection(read,descriptor,dependency),first);
});
test('live and injected readers remain fresh, including drift and omission after warmup',t=>{
  const {root,revision,descriptor,dependency,write}=fixture(t);
  resolveSelection(createGitReader()(root,revision),descriptor,dependency);
  const current=worktreeReader(root), first=resolveSelection(current,descriptor,dependency);
  write('number');assert.notEqual(resolveSelection(current,descriptor,dependency).selectionSha256,first.selectionSha256);
  fs.rmSync(path.join(root,descriptor.path));assert.throws(()=>resolveSelection(current,descriptor,dependency));
  let content=Buffer.from('{"type":"string"}');const injected=()=>content;
  Object.assign(injected,{root,revision});assert.equal(gitSourceIdentity(injected),undefined);
  const whole={...dependency,pointers:['']}, before=resolveSelection(injected,descriptor,whole);
  content=Buffer.from('{"type":"number"}');assert.notEqual(resolveSelection(injected,descriptor,whole).selectionSha256,before.selectionSha256);
  content=Buffer.from('{invalid');assert.throws(()=>resolveSelection(injected,descriptor,whole));
});
test('cached immutable closures never bypass live tag commit and tag-object checks',t=>{
  const {root,revision,descriptor,dependency,git,write,commit}=fixture(t);
  git(['tag','-a','admitted','-m','Synthetic admitted tag']);
  const pin={...descriptor,id:'example',role:'validation',root:descriptor.path,tag:'admitted',tagObject:git(['rev-parse','admitted'])};
  const registry={contracts:[{...descriptor,domain:'fixture',status:'active'}]}, manifest={service:'fixture',contracts:[dependency],assets:[]};
  const bytes=Buffer.from(JSON.stringify(manifest));
  makeLock(root,manifest,bytes,registry,[pin]);
  write('number');commit();git(['tag','-f','-a','admitted','-m','Synthetic changed tag']);
  assert.throws(()=>makeLock(root,manifest,bytes,registry,[pin]),/Pinned tag commit drift/);
  git(['tag','-f','-a','admitted',revision,'-m','Different synthetic tag object']);
  assert.throws(()=>makeLock(root,manifest,bytes,registry,[pin]),/Pinned tag object drift/);
});
test('URI mappings and admitted domains remain part of an immutable closure identity',t=>{
  const {root,git,commit,descriptor,dependency}=fixture(t);
  const prefix='catalog/http/shared/v1/';fs.mkdirSync(path.join(root,prefix),{recursive:true});
  fs.writeFileSync(path.join(root,'events/example.json'),JSON.stringify({$ref:'https://example.invalid/shared'}));
  for(const [name,type]of [['left','string'],['right','number']])fs.writeFileSync(path.join(root,prefix+name+'.json'),JSON.stringify({type}));
  const revision=commit(),read=createGitReader()(root,revision),selection={...dependency,pointers:['']};
  const mapped={...descriptor,uriMappings:[{uri:'https://example.invalid/shared',path:prefix+'left.json'}]};
  const registry={contracts:[{domain:'catalog'}]},first=resolveSelection(read,mapped,selection,registry);
  assert.notEqual(resolveSelection(read,{...mapped,uriMappings:[{uri:'https://example.invalid/shared',path:prefix+'right.json'}]},selection,registry).selectionSha256,first.selectionSha256);
  assert.throws(()=>resolveSelection(read,{...mapped,uriMappings:[]},selection,registry),/Unmapped external/);
  assert.throws(()=>resolveSelection(read,mapped,selection,{contracts:[{domain:'sales'}]}));
});
test('the bounded closure store evicts old entries and reconstructs them correctly',t=>{
  const {root,commit,descriptor,dependency}=fixture(t);
  fs.writeFileSync(path.join(root,descriptor.path),JSON.stringify({$defs:Object.fromEntries(Array.from({length:264},(_,i)=>['k'+i,{const:i}]))}));
  const revision=commit(),read=createGitReader()(root,revision);
  const first=resolveSelection(read,descriptor,{...dependency,pointers:['/$defs/k0']});
  for(let i=1;i<264;i++)resolveSelection(read,descriptor,{...dependency,pointers:['/$defs/k'+i]});
  const execute=cp.execFileSync,calls=[];
  t.mock.method(cp,'execFileSync',(program,args,options)=>{calls.push(args);return execute(program,args,options);});
  syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
  const fresh=createGitReader()(root,revision);calls.length=0;
  assert.deepEqual(resolveSelection(fresh,descriptor,{...dependency,pointers:['/$defs/k0']}),first);
  assert(calls.some(args=>args.includes('cat-file')),'evicted closure is recomputed from immutable Git');
});
