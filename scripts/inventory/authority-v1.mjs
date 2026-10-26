import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decimal,format} from './quantity-v1.mjs';

export function canonicalJSON(value) {
  if(value===null||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){assert(Number.isSafeInteger(value),'B_JCS_NUMBER');return JSON.stringify(value);}
  if(typeof value==='string'){assert(value.isWellFormed(),'B_JCS_UNICODE');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
  assert(value && Object.getPrototypeOf(value)===Object.prototype,'B_JCS_OBJECT');
  return '{'+Object.keys(value).sort().map(key=>canonicalJSON(key)+':'+canonicalJSON(value[key])).join(',')+'}';
}
export const fingerprint=value=>createHash('sha256').update(canonicalJSON(value),'utf8').digest('hex');
export function normalizedRequest(request) {
  assert.deepEqual(Object.keys(request).sort(),['body','canonicalization_version','idempotency_key','method','operation_id','path','query'],'B_CANONICAL_FIELDS');
  assert.equal(request.canonicalization_version,'inventory-request-v1','B_CANONICAL_VERSION');
  if(request.body?.operation_id)assert.equal(request.idempotency_key,request.body.operation_id,'B_IDEMPOTENCY_BINDING');
  const normalize=(value,key='')=>{
    if(Array.isArray(value))return value.map(x=>normalize(x));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
    if(typeof value==='string' && ['quantity','minimum_quantity','quantity_increment'].includes(key))return format(decimal(value,{scale:3,integer:12,positive:true}));
    if(typeof value==='string' && key==='name')return value.normalize('NFC');
    return value;
  };
  return normalize(structuredClone(request));
}
export const requestFingerprint=request=>fingerprint(normalizedRequest(request));
export function validateBudget(decision,sentAt,now,ceiling=2000) {
  assert(Number.isFinite(sentAt)&&Number.isFinite(now)&&now>=sentAt,'B_MONOTONIC_TIME');
  assert(Number.isSafeInteger(decision.valid_for_ms)&&decision.valid_for_ms>0&&decision.valid_for_ms<=ceiling,'B_AUTHORITY_BUDGET');
  assert(now-sentAt<decision.valid_for_ms,'B_AUTHORITY_EXPIRED');
  assert.equal(decision.authorized,true,'B_AUTHORITY_DENIED');
}
// Workload signature verification belongs to the future owner. These vectors
// check claims/bindings, not cryptography, network timing or Identity runtime.
export function validateHumanBinding(request,decision,{sentAt,now,organization,permission,branch,warehouse,account,stepUpAt,currentTime}) {
  validateBudget(decision,sentAt,now);
  assert.equal(decision.organization_id,organization,'B_AUTHORITY_TENANT');
  assert.equal(decision.scope.organization_id,organization,'B_AUTHORITY_SCOPE');
  assert.equal(decision.account_ref,account,'B_AUTHORITY_ACCOUNT');
  assert.equal(decision.permission,permission,'B_PERMISSION');
  assert.equal(decision.operation_id,request.operation_id,'B_AUTHORITY_OPERATION');
  assert.equal(decision.request_hash,requestFingerprint(request),'B_REQUEST_BINDING');
  assert.equal(decision.canonicalization_version,'inventory-request-v1','B_CANONICAL_VERSION');
  if(branch)assert(decision.scope.branch_ids.includes(branch),'B_BRANCH_SCOPE');
  if(warehouse)assert(decision.scope.warehouse_ids.includes(warehouse),'B_WAREHOUSE_SCOPE');
  if(permission==='inventory.history.read') {
    assert(typeof stepUpAt==='string'&&stepUpAt===decision.step_up_at,'B_STEP_UP');
    const age=Date.parse(currentTime)-Date.parse(stepUpAt);
    assert(Number.isFinite(age)&&age>=0&&age<=900_000,'B_STEP_UP');
  }
}
export function validateTechnicalBinding(command,query,decision,{sentAt,now}) {
  validateBudget(decision,sentAt,now);
  assert.equal(decision.caller,'inventory','B_CALLER');
  assert.equal(decision.audience,'sales-pos.process-authority','B_AUDIENCE');
  for(const key of ['organization_id','operation_id','process_id','process_version'])assert.equal(query[key],command.payload.context[key],'B_STEP_'+key);
  assert(typeof command.payload.step_id==='string','B_STEP_ID_REQUIRED');
  assert.equal(query.step_id,command.payload.step_id,'B_STEP_ID_BINDING');
  assert.equal(query.command_id,command.command_id,'B_COMMAND_BINDING');
  assert.equal(query.step,command.command_type,'B_STEP_TYPE');
  assert.equal(query.target,'inventory','B_STEP_TARGET');
  assert.equal(command.target,'inventory','B_STEP_TARGET');
  assert.equal(command.producer,'sales-pos','B_PRODUCER');
  assert.equal(query.command_fingerprint,fingerprint(command),'B_COMMAND_HASH');
  for(const key of Object.keys(query))assert.deepEqual(decision[key],query[key],'B_STEP_DECISION_'+key);
  if(command.command_type==='inventory.compensate-sale-stock.v1') {
    assert(decision.terminal_finance_rejection,'B_FINANCE_TERMINAL');
    assert.equal(decision.terminal_finance_rejection.payment_absent,true,'B_PAYMENT_PRESENT');
    assert.equal(decision.terminal_finance_rejection.sale_completed,false,'B_COMPLETED');
    assert.equal(decision.terminal_finance_rejection.finance_result_id,command.payload.finance_result_id,'B_FINANCE_RESULT');
  } else assert.equal(command.command_type,'inventory.post-sale-stock.v1','B_STEP_TYPE');
}
