import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {parse} from 'yaml';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {
  reuseCandidateBase,reuseCandidateFiles,projectReuseCandidateFile,projectReuseCandidateDocument,
  withReuseCandidateScope,projectReviewedFile,projectReviewedRegistry,reviewedCandidateRevision,
} from '../../tools/architecture/validation-history.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const git=createGitReader(),base=git(root,reuseCandidateBase),old=git(root,reviewedCandidateRevision);
const current=new Map(reuseCandidateFiles.map(file=>[file,fs.readFileSync(path.join(root,file))]));
const read=file=>{assert(current.has(file),'Unexpected live path: '+file);return Buffer.from(current.get(file));};
const changed=bytes=>Buffer.concat([bytes,Buffer.from('\nUnapproved')]);

test('only thirteen exact candidate metadata, entry-point and test values project; altered and unrelated inputs never do',()=>{
  for(const file of [...reuseCandidateFiles.slice(0,10),...reuseCandidateFiles.slice(20,23)]){
    const input=read(file),expected=base(file);
    const output=projectReuseCandidateFile(file,input);
    assert.deepEqual(output,expected);
    assert.notEqual(output,input);
    output.fill(0);
    assert.deepEqual(projectReuseCandidateFile(file,input),expected,'isolated output');
    const invalid=changed(input);
    assert.equal(projectReuseCandidateFile(file,invalid),invalid);
  }
  const input=read('registry/contracts.json');
  assert.equal(projectReuseCandidateFile('registry/consumers/unapproved.json',input),input);
  const artifact='identity/http/private/v2/identity-internal-auth-v2.yaml',bytes=read(artifact);
  assert.equal(projectReuseCandidateFile(artifact,bytes),bytes,'new transports have no historical replacement');
});

test('historical registry projection is exact, isolated and rejects non-JSON additions',()=>{
  const file='registry/contracts.json',bytes=read(file),input=JSON.parse(bytes),expected=JSON.parse(old(file));
  assert.deepEqual(projectReviewedFile(reviewedCandidateRevision,file,bytes),old(file));
  const output=projectReviewedRegistry(reviewedCandidateRevision,input);
  assert.deepEqual(output,expected);output.contracts.pop();
  assert.deepEqual(projectReviewedRegistry(reviewedCandidateRevision,input),expected);
  const candidateView=projectReuseCandidateDocument(file,input);
  assert.deepEqual(candidateView,JSON.parse(base(file)));
  candidateView.planned.pop();
  assert.deepEqual(projectReuseCandidateDocument(file,input),JSON.parse(base(file)));
  for(const mutate of [value=>value.extra=undefined,value=>value.extra=NaN,value=>value.extra=1n,
    value=>value.planned.pop(),value=>value.contracts[0].owner='unapproved']){
    const invalid=structuredClone(input);mutate(invalid);
    assert.equal(projectReviewedRegistry(reviewedCandidateRevision,invalid),invalid);
    assert.equal(projectReuseCandidateDocument(file,invalid),invalid);
  }
});

for(const count of [1,10,100])test('one supplied-value projection per requested read, without another live file: '+count,t=>{
  const file='identity/index.json',input=read(file),expected=base(file);
  projectReuseCandidateFile(file,input); // Warm only immutable Git data.
  t.mock.method(fs,'readFileSync',()=>{throw Error('Unrelated live read');});
  let visits=0;
  const view=name=>{assert.equal(name,file);visits++;return projectReuseCandidateFile(name,input);};
  for(let index=0;index<count;index++)assert.deepEqual(view(file),expected);
  assert.equal(visits,count);
});

test('candidate scope checks every exact path once and grants no folder exemption',()=>{
  const visits=[];
  const scope=withReuseCandidateScope(['synthetic-kept'],file=>{visits.push(file);return read(file);});
  assert.deepEqual([...scope].sort(),['synthetic-kept',...reuseCandidateFiles].sort());
  assert.equal(visits.length,25);assert.equal(new Set(visits).size,25);
  assert(!scope.has('identity/http/private/v2/unapproved.yaml'));
  assert(!scope.has('registry/consumers/unapproved.json'));
});

for(const file of reuseCandidateFiles)for(const mutation of ['changed','missing'])
test('scope rereads and rejects '+file+' after warmup: '+mutation,()=>{
  withReuseCandidateScope([],read);
  const altered=name=>{
    if(name===file){if(mutation==='missing')throw Error('Synthetic missing candidate');return changed(read(name));}
    return read(name);
  };
  assert.throws(()=>withReuseCandidateScope([],altered));
  assert.equal(withReuseCandidateScope([],read).size,25);
});

test('historical scopes gain no candidate paths; partial selected admission is rejected',()=>{
  assert.deepEqual([...withReuseCandidateScope(['kept'],file=>file==='registry/contracts.json'?base(file):read(file))],['kept']);
  const registry=JSON.parse(read('registry/contracts.json'));
  registry.contracts=registry.contracts.filter(row=>row.id!=='identity.internal-auth.v2');
  assert.throws(()=>withReuseCandidateScope([],file=>file==='registry/contracts.json'?Buffer.from(JSON.stringify(registry)):read(file)),/H1A_V2_SCOPE_REGISTRY/);
});

test('CI adds H1A checks to existing jobs without changing prior commands, dependencies or job count',()=>{
  const file='.github/workflows/ci.yml',before=parse(base(file).toString('utf8')),after=parse(read(file).toString('utf8'));
  assert.equal(Object.keys(after.jobs).length,23);
  const job=after.jobs.validate_identity_catalog_contracts;
  const run=job.steps.find(step=>step.name==='Run original validation commands');
  const commands=[
    'node scripts/validate-redocly-no-warnings.mjs identity/http/private/v2/identity-internal-auth-v2.yaml',
    'npx --yes @redocly/cli@2.53.3 bundle identity/http/private/v2/identity-internal-auth-v2.yaml --dereferenced --ext json --output .ci-artifacts/identity-internal-auth-v2.bundle.json',
    'node scripts/identity/validate-internal-auth-v2.mjs .ci-artifacts/identity-internal-auth-v2.bundle.json',
  ];
  for(const command of commands){assert.equal(run.run.split(command).length,2);run.run=run.run.replace(command+'\n','');}
  const pack=job.steps.find(step=>step.name==='Package original artifact paths');
  const extra=' .ci-artifacts/identity-internal-auth-v2.bundle.json .ci-artifacts/identity-internal-auth-v2/';
  assert.equal(pack.run.split(extra).length,2);pack.run=pack.run.replace(extra,'');
  const native=after.jobs.validate_identity_catalog_schema.steps.find(step=>step.name==='Run original validation commands');
  const addition='\n          sh scripts/identity/validate-internal-auth-v2.sh .ci-artifacts/identity-internal-auth-v2';
  // YAML block scalar removes the common indentation from the shell string.
  const shellAddition=addition.replace('\n          ','\n');
  assert.equal(native.run.split(shellAddition).length,2);native.run=native.run.replace(shellAddition,'');
  assert.deepEqual(after,before);
});
