import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { evaluate, problem, managementPermission, assignablePermissions } from './catalog-history-permissions-v1-semantics.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
export const apiPath = 'identity/http/private/v1/identity-catalog-history-permissions-v1.yaml';
export const schemaPath = 'identity/http/shared/v1/identity-catalog-history-permissions-v1.schema.json';
export const policyPath = 'identity/http/shared/v1/identity-catalog-history-permissions-v1-policy.json';
export const vectorsPath = 'identity/fixtures/catalog-history-permissions/v1/catalog-history-permissions-v1-vectors.json';
export const scenario = () => { const { context, state, command } = read(vectorsPath); return { context, state, command }; };
export function change(object, field, value) {
  const keys = field.split('.');
  const parent = keys.slice(0, -1).reduce((item, key) => item[key], object);
  parent[keys.at(-1)] = structuredClone(value);
  return object;
}

export function validateContract(bundle) {
  const schema = read(schemaPath), policy = read(policyPath), vectors = read(vectorsPath);
  const api = parse(fs.readFileSync(path.join(root, apiPath), 'utf8'));
  assert.equal(api.openapi, '3.1.0'); assert.equal(api.info.version, '1.0.0');
  assert.deepEqual(Object.keys(api.paths), ['/internal/v1/identity/catalog/history-permissions/{membership_id}']);
  const item = Object.values(api.paths)[0];
  assert.deepEqual(Object.keys(item).sort(), ['get', 'parameters', 'put']);
  assert.equal(api.components.securitySchemes.currentSessionCookie.name, '__Host-oc_session');
  const statusSets = { get: [200,400,401,403,404,406,429,500,503], put: [200,400,401,403,404,406,409,413,415,429,500,503] };
  for (const method of ['get','put']) {
    const operation = item[method];
    assert.deepEqual(operation.security, [{ gatewayServiceBearer: [], currentSessionCookie: [] }]);
    assert.deepEqual(operation['x-workload'], { caller:'gateway-bff', audience:'identity-tenancy.gateway', type:'service' });
    assert.deepEqual(Object.keys(operation.responses).map(Number), statusSets[method]);
    for (const [status, response] of Object.entries(operation.responses)) {
      assert.equal(response.headers['Cache-Control'].$ref, '#/components/headers/NoStore');
      if (status !== '200') assert.equal(response.content['application/problem+json'].schema.allOf[1].properties.status.const, Number(status));
    }
    if (bundle) {
      const bundled = Object.values(bundle.paths)[0][method];
      assert.deepEqual(bundled.responses['200'].content['application/json'].schema, extractSchema('AssignmentState', false));
      if (method === 'put') assert.deepEqual(bundled.requestBody.content['application/json'].schema, extractSchema('ReplaceRequest', false));
    }
  }
  assert.equal(item.get.requestBody, undefined);
  assert.equal(item.put.parameters[0].name, 'Idempotency-Key'); assert.equal(item.put.parameters[0].required, true);
  assert.equal(api.components.headers.NoStore.schema.const, 'no-store');
  assert.equal(policy.status, 'candidate'); assert.equal(policy.owner, 'identity-tenancy');
  assert.equal(policy.runtime_demonstrated, false); assert.equal(policy.production_enabled, false);
  assert.equal(policy.management_permission, managementPermission);
  assert.deepEqual(policy.initial_role_mapping, { OWNER: [managementPermission] });
  assert.deepEqual(policy.assignable_permissions, assignablePermissions);
  assert.deepEqual(policy.automatic_exceptional_permissions, []);
  assert.equal(policy.assignment_scope, 'organization'); assert.equal(policy.mfa_maximum_age_seconds, 300);
  for (const key of ['approved_device_required','active_selected_organization_required','credential_version_current_required','authority_on_every_request','fail_closed']) assert.equal(policy[key], true);
  assert.equal(policy.version_semantics.maximum, '9223372036854775807');
  assert.equal(policy.idempotency.retention_seconds, 604800);
  assert.deepEqual(policy.mutation_atomicity, ['assignment','membership_authorization_version','idempotency_result','mandatory_audit']);
  assert.deepEqual(policy.field_inventory.map(row=>row.path).sort(), Object.keys(schema.$defs).map(key=>'/$defs/'+key).sort());
  for (const field of policy.field_inventory) {
    const profile=policy.profiles[field.profile]; assert(profile,field.path);
    assert.equal(profile.owner,'identity-tenancy'); assert.equal(profile.sensitivity,'RESTRICTED');
    assert.equal(profile.log_policy,'prohibited-values');
    for(const key of ['categories','purpose','base','consumers','access','encryption','retention','export_correction','third_parties_regions']) assert(profile[key],field.path+': '+key);
  }
  assert.equal(vectors.runtime_demonstrated, false);
  assert.equal(new Set(vectors.negative.map(row=>row.id)).size, vectors.negative.length);
  for (const row of vectors.negative) {
    const input = scenario(); change(input.context, row.field, row.value);
    const result = evaluate(input);
    assert.equal(result.status, row.status, row.id); assert.equal(result.body.code, row.code, row.id);
    assert.equal(result.mutation, undefined);
  }
  const catalog = read('common/errors/v8/error-catalog-v8.json');
  for (const row of schema.$defs.Problem.allOf[1].oneOf) {
    const code = row.properties.code.const;
    const error = catalog.errors.find(item=>item.code===code);
    assert(error, code); assert(error.statuses.includes(row.properties.status.const), code);
    assert.equal(error.retryable_by_default, row.properties.retryable.const, code);
  }
  return { semantic_negatives:vectors.negative.length, runtime_demonstrated:false };
}

// Resolve only this unpublished DTO and its immutable common envelope. No network resolver.
export function extractSchema(definition, dialect = true) {
  const source = read(schemaPath), commonRef = '../../../../common/http/shared/v3/problem-details-v3.schema.json';
  const common = read('common/http/shared/v3/problem-details-v3.schema.json');
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    if (value.$ref) {
      assert.equal(Object.keys(value).length, 1, 'REFERENCE_SIBLING_NOT_SUPPORTED');
      if (value.$ref === commonRef) { const { $schema, $id, ...envelope } = common; return visit(envelope); }
      assert(value.$ref.startsWith('#/$defs/'), 'UNEXPECTED_REFERENCE');
      const target = source.$defs[value.$ref.slice(8)]; assert(target, value.$ref); return visit(target);
    }
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)]));
  }
  assert(source.$defs[definition], definition);
  return { ...(dialect ? { $schema:source.$schema } : {}), ...visit(source.$defs[definition]) };
}

export function prepare(output, bundle) {
  const summary = validateContract(bundle);
  assert.equal(fs.existsSync(output), false, 'PERMISSION_OUTPUT_EXISTS');
  const cases = [], input = scenario(), result = evaluate(input);
  const add = (definition,id,expected,value) => cases.push({definition,id,expected,value});
  for (const [definition,value] of Object.entries({MembershipId:input.command.target_membership_id,IdempotencyKey:input.command.idempotency_key,ReplaceRequest:input.command.body,AssignmentState:result.body})) {
    add(definition,definition+'-valid','accept',value);
    add(definition,definition+'-wrong-type','reject',42);
    if (typeof value==='object') {
      for (const key of Object.keys(value)) { const missing=structuredClone(value);delete missing[key];add(definition,definition+'-missing-'+key,'reject',missing); }
      add(definition,definition+'-extra','reject',{...value,unsafe_extra:true});
    }
  }
  add('AssignmentState','initial-state','accept',input.state);
  add('AssignmentState','revoked-nonzero-state','accept',{...result.body,permissions:[]});
  add('AssignmentState','zero-with-permission','reject',{...input.state,permissions:[assignablePermissions[0]]});
  add('AssignmentState','nonzero-without-time','reject',{...result.body,updated_at:null});
  add('AssignmentState','invalid-timestamp','reject',{...result.body,updated_at:'tomorrow'});
  add('ReplaceRequest','explicit-revoke','accept',{expected_version:'1',permissions:[]});
  add('ReplaceRequest','management-not-assignable','reject',{...input.command.body,permissions:[managementPermission]});
  add('ReplaceRequest','duplicated-permission','reject',{...input.command.body,permissions:[assignablePermissions[0],assignablePermissions[0]]});
  add('ReplaceRequest','numeric-version','reject',{...input.command.body,expected_version:0});
  add('ReplaceRequest','noncanonical-version','reject',{...input.command.body,expected_version:'01'});
  for (const definition of ['MembershipId','IdempotencyKey']) add(definition,definition+'-uuidv4','reject','019a0010-0000-4000-8000-000000000001');
  const rows=read(schemaPath).$defs.Problem.allOf[1].oneOf;
  rows.forEach((row,index)=> {
    const body=problem(row.properties.status.const,row.properties.code.const,row.properties.retryable.const).body;
    add('Problem','problem-'+index,'accept',body);
    add('Problem','problem-status-'+index,'reject',{...body,status:200});
    add('Problem','problem-retryable-'+index,'reject',{...body,retryable:!body.retryable});
  });
  const failure=problem(403,'identity_access_denied').body;
  for (const key of Object.keys(failure)) { const missing={...failure};delete missing[key];add('Problem','problem-missing-'+key,'reject',missing); }
  for (const key of ['detail','errors','correlation_id','unsafe_extra']) add('Problem','problem-forbidden-'+key,'reject',{...failure,[key]:key==='errors'?[]:'protected'});
  add('Problem','problem-mismatched-type','reject',{...failure,type:'urn:opencomerix:problem:identity_invalid_request'});
  fs.mkdirSync(output,{recursive:true});
  for (const definition of new Set(cases.map(row=>row.definition))) fs.writeFileSync(path.join(output,definition+'.schema.json'),JSON.stringify(extractSchema(definition))+'\n',{flag:'wx'});
  for (const row of cases) fs.writeFileSync(path.join(output,row.id+'.json'),JSON.stringify(row.value)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(output,'cases.tsv'),cases.map(row=>[row.id,row.expected,row.definition+'.schema.json',row.id+'.json'].join('\t')).join('\n')+'\n',{flag:'wx'});
  return {...summary,schema_positive:cases.filter(row=>row.expected==='accept').length,schema_negative:cases.filter(row=>row.expected==='reject').length};
}

if (import.meta.url === pathToFileURL(process.argv[1]??'').href) {
  assert([3,4].includes(process.argv.length),'usage: node scripts/identity/validate-catalog-history-permissions-v1.mjs <new-output> [dereferenced-bundle]');
  const output=path.resolve(process.argv[2]);
  assert(output.startsWith(path.join(root,'.ci-artifacts')+path.sep),'PERMISSION_OUTPUT_SCOPE');
  console.log('F1-08I permission candidate gate: '+JSON.stringify(prepare(output,process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):undefined)));
}
