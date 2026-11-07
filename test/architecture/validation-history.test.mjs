import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {projectReviewedFile,projectReviewedSnapshot,projectReviewedRegistry,projectReviewedDocument,projectValidationTooling,validateValidationTooling,
  reviewedValidationRevision,reviewedCandidateRevision} from '../../tools/architecture/validation-history.mjs';
import {candidateReadView} from '../../scripts/inventory/candidate-v1.mjs';
import {withCandidateScope} from '../../scripts/inventory/candidate-v1.mjs';
import {readRepositoryFile} from '../../scripts/ci/retired-gitlab-v1.mjs';
import {withReviewedValidationScope} from '../../tools/architecture/validation-history.mjs';
import {reviewedFinanceHistoricalFile} from '../../scripts/finance/reviewed-package-v1.mjs';
import {reviewedSalesHistoricalFile} from '../../scripts/sales/reviewed-package-v2.mjs';
import {releaseHistoricalFile} from '../../scripts/sales/release-v1.mjs';
import {successorHistoricalFile} from '../../scripts/identity/inventory-authority-v1-1.mjs';
import {validateSourceScope} from '../../scripts/inventory/capture-authority-v2.mjs';

const root=path.resolve(import.meta.dirname,'../..'), git=createGitReader();
const admitted=git(root,reviewedValidationRevision), previous=git(root,reviewedCandidateRevision);
const file='registry/consumers/identity-tenancy.json';
test('one historical read checks only the requested caller bytes, without reading another live file',t=>{
  const bytes=admitted(file),expected=previous(file),reads=[];
  // Warm immutable inputs only, never approvals or live bytes.
  projectReviewedFile(reviewedCandidateRevision,file,bytes);
  const read=file=>{reads.push(file);return Buffer.from(bytes);};
  t.mock.method(fs,'readFileSync',()=>{throw Error('unrelated live read');});
  const view=candidateReadView(read), output=view(file);
  assert(output.equals(expected));assert.deepEqual(reads,[file]);
  output.fill(0);assert(view(file).equals(expected));assert.deepEqual(reads,[file,file]);
  assert(candidateReadView(view)(file).equals(expected),'composed views recognize already historical bytes');
});
test('a projection never repairs mutated bytes, new paths or unrelated changed tooling',()=>{
  const bytes=admitted(file), wrong=Buffer.concat([bytes,Buffer.from('\nUnapproved')]);
  assert.equal(projectReviewedFile(reviewedCandidateRevision,file,wrong),undefined);
  assert.equal(projectReviewedFile(reviewedCandidateRevision,'registry/consumers/unapproved.json',bytes),undefined);
  const tooling='scripts/inventory/candidate-v1.mjs';
  assert.equal(projectReviewedFile(reviewedCandidateRevision,tooling,admitted(tooling)),undefined);
});
test('snapshot projection requires exact structure and cannot share mutable results',()=>{
  const input=JSON.parse(admitted(file)), expected=JSON.parse(previous(file));
  const output=projectReviewedSnapshot(reviewedCandidateRevision,input);
  assert.deepEqual(output,expected);output.manifest.contracts.pop();
  assert.deepEqual(projectReviewedSnapshot(reviewedCandidateRevision,input),expected);
  for(const mutate of [value=>value.extra=undefined,value=>value.manifest.contracts.pop(),value=>value.sourceCommit='a'.repeat(40)]) {
    const wrong=structuredClone(input);mutate(wrong);
    assert.equal(projectReviewedSnapshot(reviewedCandidateRevision,wrong),wrong);
  }
});
test('registry and index views preserve unknown input and isolate approved historical results',()=>{
  for(const name of ['registry/contracts.json','registry/consumers/index.json']) {
    const input=JSON.parse(admitted(name)),expected=JSON.parse(previous(name));
    const project=value=>name==='registry/contracts.json'?projectReviewedRegistry(reviewedCandidateRevision,value)
      :projectReviewedDocument(reviewedCandidateRevision,name,value);
    const actual=project(input);assert.deepEqual(actual,expected);actual.extra='mutated return';
    assert.deepEqual(project(input),expected);assert.deepEqual(project(expected),expected);
    const wrong=structuredClone(input);wrong.extra=undefined;assert.equal(project(wrong),wrong);
  }
});
test('the published intermediate B state projects without revalidating later Finance packages',()=>{
  const intermediate=git(root,'67cb6f9e45904f5a142912c60aafe08cda851c55');
  for(const name of ['registry/contracts.json','inventory/index.json','inventory/README.md']) {
    const input=intermediate(name),expected=previous(name);
    assert(candidateReadView(()=>Buffer.from(input))(name).equals(expected));
    assert.equal(projectReviewedFile(reviewedCandidateRevision,name,Buffer.concat([input,Buffer.from('\nUnapproved')])),undefined);
  }
  assert.deepEqual(projectReviewedRegistry(reviewedCandidateRevision,JSON.parse(intermediate('registry/contracts.json'))),JSON.parse(previous('registry/contracts.json')));
});
test('an older complete fixture can never be promoted to a newer historical state',()=>{
  const newer='fcfbeba3f99c10b292ece4db2452ace71e66d093',name='registry/contracts.json';
  const input=previous(name),value=JSON.parse(input);
  assert.equal(projectReviewedFile(newer,name,input),undefined);
  assert.equal(projectReviewedRegistry(newer,value),value);
  assert.equal(projectReviewedDocument(newer,name,value),value);
});
test('C/D/E and the Identity successor project exact supplied bytes without reading the live tree',t=>{
  const steps=[
    [reviewedFinanceHistoricalFile,'67cb6f9e45904f5a142912c60aafe08cda851c55'],
    [reviewedSalesHistoricalFile,'a4919ed4ed90fe478b88c43a418cb4d6500a6948'],
    [releaseHistoricalFile,'7cd2b548fb909c5eff47d0319c162c498ee68e92'],
    [successorHistoricalFile,'fcfbeba3f99c10b292ece4db2452ace71e66d093'],
  ];
  const file='registry/contracts.json',input=admitted(file);
  const expected=steps.map(([,revision])=>git(root,revision)(file));
  t.mock.method(fs,'readFileSync',()=>{throw Error('unrelated live source read');});
  steps.forEach(([project],index)=>assert(project(file,Buffer.from(input)).equals(expected[index])));
});
test('exact tooling adaptations reject drift and recheck caller bytes after warmup',()=>{
  const target='tools/architecture/graph.mjs', bytes=fs.readFileSync(path.join(root,target));
  assert(projectValidationTooling(target,bytes).equals(admitted(target)));
  const wrong=Buffer.concat([bytes,Buffer.from('\nUnapproved')]);
  assert.equal(projectValidationTooling(target,wrong),wrong);
  validateValidationTooling(name=>fs.readFileSync(path.join(root,name)));
  assert.throws(()=>validateValidationTooling(name=>name===target?wrong:fs.readFileSync(path.join(root,name))),/VALIDATION_TOOLING_DRIFT/);
  assert.throws(()=>validateValidationTooling(name=>{if(name===target)throw Error('synthetic missing tooling');return fs.readFileSync(path.join(root,name));}),/synthetic missing tooling/);
});
test('scope verifies exact current contents on each invocation and grants no folder exemption',()=>{
  const paths=withCandidateScope([]);
  assert(!paths.has('registry/consumers/unapproved.json'));assert(!paths.has('src/main.ts'));
  withReviewedValidationScope([],readRepositoryFile);
  const changed='registry/consumers/identity-tenancy.json';
  assert.throws(()=>withReviewedValidationScope([],file=>file===changed
    ?Buffer.concat([readRepositoryFile(file),Buffer.from('\nUnapproved')]):readRepositoryFile(file)),/VALIDATION_SCOPE_DRIFT/);
  assert.throws(()=>withReviewedValidationScope([],file=>{if(file===changed)throw Error('synthetic missing scope input');return readRepositoryFile(file);}),/synthetic missing scope input/);
});
for (const target of ['tools/architecture/validation-history.mjs', 'tools/architecture/validation-tooling.json'])
test('tooling and public scopes reject changed or missing ' + target + ' after warmup',t=>{
  const gates=[()=>validateValidationTooling(readRepositoryFile),
    ()=>withReviewedValidationScope([],readRepositoryFile),validateSourceScope];
  const original=fs.readFileSync.bind(fs), absolute=path.join(root,target);
  let change, visits=0;
  t.mock.method(fs,'readFileSync',(file,...options)=>{
    if(typeof file==='string'&&path.resolve(file)===absolute) {
      visits++;
      if(change==='missing')throw Error('synthetic missing tooling reference or helper');
      if(change==='changed')return Buffer.from('// unapproved helper or reference bytes');
      if(change==='pin')return Buffer.from(original(file,...options).toString().replace(
        /^const toolingReferenceSha256 = '[0-9a-f]{64}';$/m,
        "const toolingReferenceSha256 = '"+'0'.repeat(64)+"';"));
      if(change==='retargeted') {
        const value=JSON.parse(original(file,...options));
        value['tools/architecture/validation-history.mjs']='0'.repeat(64);
        return Buffer.from(JSON.stringify(value,null,2)+'\n');
      }
    }
    return original(file,...options);
  });
  t.after(()=>t.mock.restoreAll());
  for(const gate of gates) {
    gate();
    for(change of target.endsWith('.json')?['changed','missing','retargeted']:['changed','missing','pin']) {
      visits=0;
      assert.throws(gate,change==='missing'?/synthetic missing tooling/:/VALIDATION_TOOLING_(?:REFERENCE_)?DRIFT/);
      assert.equal(visits,1,'the live input is checked again instead of reusing an approval');
    }
    change=undefined;gate();
  }
});
for(const change of ['extra-path','retargeted-hash','missing-helper'])
test('a fresh process refuses a reference altered before import: '+change,()=>{
  const reference=pathToFileURL(path.join(root,'tools/architecture/validation-tooling.json')).href;
  const capture=pathToFileURL(path.join(root,'scripts/inventory/capture-authority-v2.mjs')).href;
  const script=`import assert from 'node:assert/strict';
    import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';
    import {registerHooks,syncBuiltinESMExports} from 'node:module';
    import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
    const reference=${JSON.stringify(reference)},target=fileURLToPath(reference),root=${JSON.stringify(root)};
    const extra='registry/consumers/unapproved.json',body=Buffer.from('unapproved'),mode=${JSON.stringify(change)};
    const value=JSON.parse(fs.readFileSync(target));
    if(mode==='extra-path')value[extra]=createHash('sha256').update(body).digest('hex');
    if(mode==='retargeted-hash')value['tools/architecture/graph.mjs']='0'.repeat(64);
    if(mode==='missing-helper')delete value['tools/architecture/validation-history.mjs'];
    const changed=JSON.stringify(value,null,2)+'\\n',read=fs.readFileSync.bind(fs),execute=cp.execFileSync;
    fs.readFileSync=(file,...options)=>typeof file==='string'&&path.resolve(file)===target?Buffer.from(changed)
      :typeof file==='string'&&path.resolve(file)===path.join(root,extra)?body:read(file,...options);
    cp.execFileSync=(program,args,options)=>{
      const output=execute(program,args,options);
      const inventory=args[0]==='diff'&&args.includes('--name-only')||args[0]==='ls-files';
      return program==='git'&&options?.cwd===root&&inventory?output+'\\n'+extra+'\\n':output;
    };
    syncBuiltinESMExports();
    registerHooks({load(url,context,next){const result=next(url,context);
      return url===reference?{...result,source:changed}:result;}});
    await assert.rejects(async()=>{const {validateSourceScope}=await import(${JSON.stringify(capture)});
      validateSourceScope();},/VALIDATION_TOOLING_REFERENCE_DRIFT/);
    console.log(JSON.stringify({referenceRejectedBeforeScope:true}));`;
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],
    {cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:1024*1024}));
  assert.deepEqual(result,{referenceRejectedBeforeScope:true});
});
test('the complete Finance proof computes its Sales scope once for every checked path',()=>{
  const target=pathToFileURL(path.join(root,'scripts/sales/reviewed-package-v2.mjs')).href;
  const finance=pathToFileURL(path.join(root,'scripts/finance/reviewed-package-v1.mjs')).href;
  const script=`import assert from 'node:assert/strict';
    import {registerHooks} from 'node:module';
    globalThis.scopeVisits=0;
    registerHooks({load(url,context,next){const result=next(url,context);
      if(url!==${JSON.stringify(target)})return result;
      const signature='export function withReviewedSalesScope(paths){',source=result.source.toString();
      assert.equal(source.split(signature).length,2);
      return {...result,source:source.replace(signature,signature+'globalThis.scopeVisits++;')};}});
    const {validateReviewedFinance}=await import(${JSON.stringify(finance)});
    validateReviewedFinance();
    assert.equal(globalThis.scopeVisits,1);
    console.log(JSON.stringify({scopeVisits:globalThis.scopeVisits}));`;
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:1024*1024}));
  assert.equal(result.scopeVisits,1);
});
