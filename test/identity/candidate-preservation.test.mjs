import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { gitReader, makeLock } from '../../tools/architecture/graph.mjs';
import { identityAdmissionSource } from '../../scripts/identity/validate-catalog-admission-v1.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const source=gitReader(root,'e1d073fe5264a4aa97d6d4156ce200101bb20615');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const registry=JSON.parse(gitReader(root,identityAdmissionSource)('registry/contracts.json'));
const previous=JSON.parse(source('registry/contracts.json'));
const candidateIds=['identity.catalog-history-permissions.http.v1','identity.catalog-history-permissions.schema.v1','identity.catalog-history-permissions.policy.v1','identity.catalog-history-permissions.fixtures.v1','identity.catalog-workload-profiles.policy.v1','identity.catalog-workload-profiles.fixtures.v1'];
test('immutable I source appends exactly six planned intentions without changing any of 109 admissions',()=> {
  assert.equal(previous.contracts.length,109);assert.equal(previous.preservedFiles.length,236);
  const expected=structuredClone(previous);
  expected.planned.push(...candidateIds.map(id=>({id,domain:'identity',owner:'identity-tenancy',materializeIn:'F1-08I',status:'planned',constraint:'Candidate explicit history-permission administration and purpose-bound workload profiles only. Publish immutable sources and verify CI before separate admission; no runtime or consumer migration.'})));
  assert.deepEqual(registry,expected);
});
test('all published transports, preserved artifacts and consumer exports retain their bytes',()=> {
  const files=execFileSync('git',['ls-tree','-r','--name-only','e1d073fe5264a4aa97d6d4156ce200101bb20615'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const paths=new Set([...previous.contracts.map(row=>row.path),...previous.preservedFiles.map(row=>row.path),...files.filter(file=>/^(openapi|consumers|catalog|common|events|commands|errors)\//.test(file)),...files.filter(file=>/^identity\/http\//.test(file))]);
  for(const file of paths) assert.equal(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),source(file).toString('utf8'),file);
});
test('CI preserves existing jobs and adds the H1A successor plus semantic and real schema gates',()=> {
  const prior=parse(execFileSync('git',['show','ff393889f32426d3674a92ae0bd4a30b50077d18:.gitlab-ci.yml'],{cwd:root,encoding:'utf8'}));
  const current=parse(fs.readFileSync(path.join(root,'.gitlab-ci.yml'),'utf8'));
  const expected=structuredClone(prior);
  const profileGate=expected['validate:identity-catalog-contracts'].script.indexOf('node scripts/identity/validate-catalog-workload-profiles-v1.mjs');
  expected['validate:identity-catalog-contracts'].script.splice(profileGate+1,0,'node scripts/identity/validate-catalog-workload-profiles-v2.mjs');
  assert.deepEqual(current,expected);
  assert(current['validate:identity-catalog-contracts'].script.includes('node --test test/identity/*.test.mjs'));
  assert(current['validate:identity-catalog-schema'].script.includes('sh scripts/catalog/validate-security-v1.sh .ci-artifacts/catalog-history-permissions-v1'));
});
for(const id of candidateIds) test('unadmitted candidate cannot be locked or consumed: '+id,()=> {
  const manifest={contracts:[{id,role:'validation',version:'1',operations:[],pointers:['']}],assets:[]};
  assert.throws(()=>makeLock(root,manifest,Buffer.from(JSON.stringify(manifest)),registry),/Unknown\/unmaterialized contract/);
});
