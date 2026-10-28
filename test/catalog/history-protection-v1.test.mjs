import { readRepositoryFile } from '../../scripts/ci/retired-gitlab-v1.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { withoutToolingCI } from '../../scripts/ci/pipeline-v1.mjs';
import { root, schemaPath, policyPath, apiPath, vectorsPath, read, evaluateTrace, validateProtectionMetadata, prepareProtection, historyAdmissionSource, validateHistoryRegistry } from '../../scripts/catalog/validate-history-protection-v1.mjs';

const base = '63dbf6ff96fb3d38260c7a5ba5bed4b2947d381b';
const vectors = read(vectorsPath);
test('R2 transport stays candidate with explicit authority while its exact H registry admission is recognized', () => {
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
test('R2 preserves published contracts and historical registry metadata independently of H admission', () => {
  const prior = JSON.parse(execFileSync('git',['show',base+':registry/contracts.json'],{cwd:root,maxBuffer:2*1024*1024}));
  const current = read('registry/contracts.json');
  const published = JSON.parse(execFileSync('git', ['show', historyAdmissionSource + ':registry/contracts.json'], {cwd:root,maxBuffer:2*1024*1024}));
  assert.deepEqual({...published,planned:prior.planned}, prior);
  assert.deepEqual(published.planned.slice(0,prior.planned.length), prior.planned);
  assert.equal(validateHistoryRegistry(current).phase, 'admitted');
  for (const file of ['catalog/http/shared/v1/catalog-history-policy-v1.json','common/errors/v6/error-catalog-v6.json','common/errors/v6/error-catalog-v6.schema.json','catalog/http/private/v1/catalog-pricing-internal-v1.yaml','catalog/http/public/v1/catalog-pricing-v1.yaml']) {
    const bytes=execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:2*1024*1024}).toString('utf8');
    assert.equal(readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),bytes);
  }
});

test('R2 still accepts the exact immutable source candidate and keeps runtime disabled', () => {
  const candidate = JSON.parse(execFileSync('git', ['show', historyAdmissionSource + ':registry/contracts.json'], {cwd:root,maxBuffer:2*1024*1024}));
  assert.deepEqual(validateHistoryRegistry(candidate), {phase:'candidate',admitted:0});
  assert.equal(validateProtectionMetadata(undefined, undefined, undefined, candidate).runtime_demonstrated, false);
  candidate.planned.pop();
  assert.throws(() => validateHistoryRegistry(candidate), /H_CANDIDATE_REGISTRY/);
});

const firstAdmitted = registry => registry.contracts.find(row => row.id === 'catalog.history-protection.http.v1');
for (const [name, mutate, reason] of [
  ['partial-admission', r => {r.contracts.splice(85,1);}, 'H_SELECTED_ROOTS'],
  ['duplicate-root', r => {r.contracts.push(structuredClone(firstAdmitted(r)));}, 'H_SELECTED_ROOTS'],
  ['unselected-root', r => {r.contracts.push({...structuredClone(firstAdmitted(r)),id:'catalog.history-policy.v1'});}, 'H_SELECTED_ROOTS'],
  ['missing-root-with-candidate-count', r => {r.contracts=r.contracts.slice(0,85);}, 'H_CANDIDATE_REGISTRY'],
  ['mixed-planned-active', r => {r.planned.push({id:firstAdmitted(r).id,status:'planned'});}, 'H_REMAINING_INTENTIONS'],
  ['removed-r1-intention', r => {r.planned=r.planned.filter(row=>row.id!=='catalog.history-policy.v1');}, 'H_REMAINING_INTENTIONS'],
  ['unapproved-new-intention', r => {r.planned.push({id:'identity.unapproved',status:'planned'});}, 'H_REMAINING_INTENTIONS'],
  ['partial-identity-package', r => {r.planned.pop();}, 'H_REMAINING_INTENTIONS'],
  ['changed-identity-intention', r => {r.planned.at(-1).owner='gateway-bff';}, 'H_REMAINING_INTENTIONS'],
  ['promoted-asyncapi', r => {r.contracts.find(row=>row.id==='catalog.events.v1.asyncapi').status='active';}, 'H_PRIOR_DESCRIPTORS'],
  ['changed-previous-descriptor', r => {r.contracts[0].purpose='changed';}, 'H_PRIOR_DESCRIPTORS'],
  ['removed-preserved-file', r => {r.preservedFiles.pop();}, 'H_REGISTRY_METADATA'],
  ['expanded-consumer-coverage', r => {r.requiredConsumers.push('catalog-pricing');}, 'H_REGISTRY_METADATA'],
  ['wrong-source-revision', r => {firstAdmitted(r).commit='10c2b44ddbe9f8f1c73a212895dbf5d5ed849000';}, 'H_PROVENANCE'],
  ['wrong-source-hash', r => {firstAdmitted(r).sha256='0'.repeat(64);}, 'H_PROVENANCE'],
  ['invented-source-tag', r => {firstAdmitted(r).tag='catalog-contracts-v1.0.0';}, 'H_PROVENANCE'],
  ['invented-tag-object', r => {firstAdmitted(r).tagObject='0'.repeat(40);}, 'H_PROVENANCE'],
  ['draft-new-root', r => {firstAdmitted(r).status='draft';}, 'H_DESCRIPTOR'],
  ['wrong-path', r => {firstAdmitted(r).path='catalog/http/private/v1/catalog-history-recovery-v1.yaml';}, 'H_DESCRIPTOR'],
  ['wrong-version', r => {firstAdmitted(r).version='2.0.0';}, 'H_DESCRIPTOR'],
  ['wrong-owner', r => {firstAdmitted(r).owner='identity-tenancy';}, 'H_DESCRIPTOR'],
  ['wrong-domain', r => {firstAdmitted(r).domain='identity';}, 'H_DESCRIPTOR'],
  ['omitted-operation', r => {firstAdmitted(r).operations=[];}, 'H_OPERATIONS'],
  ['omitted-evolution-metadata', r => {delete firstAdmitted(r).purpose;}, 'H_EVOLUTION_METADATA'],
  ['missing-uri-mapping', r => {firstAdmitted(r).uriMappings.pop();}, 'H_URI_MAPPINGS'],
  ['redirected-uri-mapping', r => {firstAdmitted(r).uriMappings[0].path='catalog/http/shared/v1/catalog-history-policy-v1.json';}, 'H_URI_MAPPINGS'],
  ['unrelated-uri-mapping', r => {firstAdmitted(r).uriMappings.push({uri:'https://unselected.example',path:'catalog/http/shared/v1/catalog-history-policy-v1.json'});}, 'H_URI_MAPPINGS'],
]) test('R2 entry point rejects registry regression: '+name, () => {
  // Keep H's adversarial diagnostic checks against the immutable I admission;
  // the renewal candidate has its own full-tree and suffix regression tests.
  const registry = JSON.parse(execFileSync('git',['show','a6cf430dcdbafb515fa3f34b29ec5d98b976e0e7:registry/contracts.json'],{cwd:root,maxBuffer:2*1024*1024})); mutate(registry);
  assert.throws(() => validateProtectionMetadata(undefined, undefined, undefined, registry), new RegExp(reason));
});
test('CI retains every pre-existing job command and artifact while adding real R2 gates', () => {
  const previous=parse(execFileSync('git',['show',base+':.gitlab-ci.yml'],{cwd:root}).toString());
  const current=parse(withoutToolingCI(readRepositoryFile('.gitlab-ci.yml').toString('utf8').replaceAll('\r\n','\n')));
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
