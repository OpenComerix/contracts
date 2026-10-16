import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { root, schemaPath, policyPath, apiPath, vectorsPath, read, evaluateTrace, validateProtectionMetadata, prepareProtection } from '../../scripts/catalog/validate-history-protection-v1.mjs';

const base = '63dbf6ff96fb3d38260c7a5ba5bed4b2947d381b';
const vectors = read(vectorsPath);
test('R2 metadata stays candidate with explicit authority, field classification, errors and private surface', () => {
  const result = validateProtectionMetadata();
  assert(result.fields > 0);
  assert.equal(result.runtime_demonstrated, false);
});
for (const trace of vectors.traces) test('R2 contractual trace: '+trace.id, () => {
  const actual = evaluateTrace(trace);
  assert.deepEqual(actual.outputs, trace.expected_outputs);
  assert.deepEqual(actual.scopes, trace.expected_scopes);
});
for (const [name, mutate, reason] of [
  ['audience', p => {p.transport.audience='catalog-pricing.user-api';}, 'R2_AUTHORITY'],
  ['byte-limit', p => {p.limits.message_bytes=1048576;}, 'R2_LIMITS'],
  ['body-grants-authority', p => {p.authority.binding=[];}, 'R2_AUTHORITY'],
  ['missing-field-classification', p => {p.field_inventory.pop();}, 'R2_CLASSIFICATION'],
  ['no-replay-authority', p => {p.semantics.idempotency='replay-without-check';}, 'R2_REPLAY'],
  ['absence-liberates', p => {p.semantics.baseline='absent-means-released';}, 'R2_ABSENCE'],
  ['gap-only-blocks-arriving-scope', p => {p.semantics.ordering='contiguous-per-scope';}, 'R2_SOURCE_GAP'],
  ['completed-baseline-binding-forgotten', p => {p.semantics.baseline=p.semantics.baseline.replace('completed-bindings-retained-for-protection-lifecycle','');}, 'R2_BASELINE_BINDING'],
  ['hold-timeout', p => {p.semantics.holds='timeout-release';}, 'R2_HOLD'],
  ['closure-releases-obligations', p => {p.semantics.closure='purge-now';}, 'R2_CLOSURE'],
  ['production-enabled', p => {p.production_enabled=true;}, 'R2_SCOPE'],
]) test('R2 rejects metadata regression: '+name, () => {
  const policy = read(policyPath); mutate(policy);
  assert.throws(() => validateProtectionMetadata(read(schemaPath), policy), new RegExp(reason));
});
test('inventory absence needs explicit source AND enabled-contract inventory', () => {
  const trace = structuredClone(vectors.traces.find(row => row.id === 'explicit-no-sources'));
  trace.inventory.enabled_contracts = structuredClone(vectors.traces[0].inventory.enabled_contracts);
  assert.throws(() => evaluateTrace(trace), /R2_INVENTORY_COVERAGE/);
});
test('source scopes cannot overlap or change the source authority binding', () => {
  const trace=structuredClone(vectors.traces[0]);
  const second=structuredClone(trace.inventory.sources[0]);
  second.scope.scope_id=trace.context.known_references[1].event_id;
  trace.inventory.sources.push(second);
  assert.throws(()=>evaluateTrace(trace),/R2_INVENTORY_OVERLAP/);
  second.scope.references=[]; second.caller='unrelated-workload';
  assert.throws(()=>evaluateTrace(trace),/R2_INVENTORY_SOURCE_BINDING/);
});
test('a second scope shares its source sequence and cannot reset it to one', () => {
  const trace=structuredClone(vectors.traces[0]);
  const second=structuredClone(trace.inventory.sources[0]);
  trace.inventory.sources[0].scope.references=[trace.context.known_references[0]];
  second.scope={scope_id:trace.context.known_references[1].event_id,references:[trace.context.known_references[1]]};
  trace.inventory.sources.push(second);
  const message=structuredClone(trace.messages[0]);
  message.scope_id=second.scope.scope_id; message.message_id=trace.context.known_references[2].event_id;
  trace.messages.push(message);
  const actual=evaluateTrace(trace);
  assert.deepEqual(actual.outputs.at(-1),{status:409,code:'catalog_history_message_conflict'});
  assert.equal(actual.scopes[1].blocked,true);
});
test('R2 errors preserve every v6 entry; published contracts and registry metadata unchanged', () => {
  const prior = JSON.parse(execFileSync('git',['show',base+':registry/contracts.json'],{cwd:root,maxBuffer:2*1024*1024}));
  const current = read('registry/contracts.json');
  assert.deepEqual({...current,planned:prior.planned}, prior);
  assert.deepEqual(current.planned.slice(0,prior.planned.length), prior.planned);
  for (const file of ['catalog/http/shared/v1/catalog-history-policy-v1.json','common/errors/v6/error-catalog-v6.json','common/errors/v6/error-catalog-v6.schema.json','catalog/http/private/v1/catalog-pricing-internal-v1.yaml','catalog/http/public/v1/catalog-pricing-v1.yaml']) {
    const bytes=execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:2*1024*1024}).toString('utf8');
    assert.equal(readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),bytes);
  }
});
test('CI retains every pre-existing job command and artifact while adding real R2 gates', () => {
  const previous=parse(execFileSync('git',['show',base+':.gitlab-ci.yml'],{cwd:root}).toString());
  const current=parse(readFileSync(path.join(root,'.gitlab-ci.yml'),'utf8'));
  for(const [name,job] of Object.entries(previous)) {
    assert(Object.hasOwn(current,name));
    if(!job || typeof job !== 'object') continue;
    for(const command of job.script??[]) assert(current[name].script.includes(command),name+': '+command);
    for(const file of job.artifacts?.paths??[]) assert(current[name].artifacts.paths.includes(file),file);
  }
  assert(current['validate:catalog-contracts'].script.some(c=>c.includes('validate-history-protection-v1.mjs')));
  assert(current['validate:catalog-schema'].script.some(c=>c.includes('validate-security-v1.sh .ci-artifacts/catalog-history-protection-v1')));
});
test('R2 fixture inventory, safe schema extraction and overwrite refusal', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'oc-history-protection-'));
  try {
    const prepared=prepareProtection(dir,true);
    const rows=readFileSync(path.join(dir,'cases.tsv'),'utf8').trim().split('\n');
    assert.equal(rows.length,prepared.schema_cases);
    assert.equal(readdirSync(path.join(root,path.dirname(vectorsPath))).length,1);
    assert.equal(new Set(rows.map(r=>r.split('\t')[0])).size,rows.length);
    for(const row of rows) {
      const [,expected,schema,fixture]=row.split('\t');
      assert(['accept','reject'].includes(expected));
      assert.doesNotThrow(()=>JSON.parse(readFileSync(path.join(dir,fixture),'utf8')));
      const extracted=JSON.parse(readFileSync(path.join(dir,schema),'utf8'));
      assert.equal(extracted.$schema,'https://json-schema.org/draft/2020-12/schema');
      assert.deepEqual(extracted.$defs.Message,read(schemaPath).$defs.Message);
    }
    assert.throws(()=>prepareProtection(dir),/R2_OUTPUT_NOT_EMPTY/);
  } finally {
    assert(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep+'oc-history-protection-'));
    rmSync(dir,{recursive:true,force:true});
  }
});
