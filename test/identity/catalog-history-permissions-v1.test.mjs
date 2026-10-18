import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluate, managementPermission, assignablePermissions, maximumVersion } from '../../scripts/identity/catalog-history-permissions-v1-semantics.mjs';
import { scenario, change, read, vectorsPath, validateContract, prepare } from '../../scripts/identity/validate-catalog-history-permissions-v1.mjs';

test('candidate policy, HTTP, canonical errors and fixture inventory agree',()=>validateContract());
for (const row of read(vectorsPath).negative) test('fresh authority: '+row.id,()=> {
  const input=scenario();change(input.context,row.field,row.value);
  const result=evaluate(input);assert.equal(result.status,row.status);assert.equal(result.body.code,row.code);
  assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.mutation,undefined);
});
test('MFA accepts exactly 300 seconds and rejects a millisecond older or in the future',()=> {
  for(const [timestamp,status] of [['11:55:00.000',200],['11:54:59.999',403],['12:00:00.001',403]]) {
    const input=scenario();input.context.actor.mfa_authenticated_at='2026-10-17T'+timestamp+'Z';assert.equal(evaluate(input).status,status);
  }
});
test('GET reads version zero without granting authority or mutating',()=> {
  const input=scenario();input.command={method:'GET',target_membership_id:input.command.target_membership_id};
  const result=evaluate(input);assert.equal(result.status,200);assert.deepEqual(result.body,input.state);assert.equal(result.mutation,undefined);
  input.command.body={};assert.equal(evaluate(input).status,400);
  delete input.command.body;input.context.actor.permissions=[];assert.equal(evaluate(input).status,403);
});
test('replacement is explicit, immutable to input and requires four atomic effects',()=> {
  const input=scenario(), before=structuredClone(input), result=evaluate(input);
  assert.deepEqual(input,before);assert.equal(result.body.assignment_version,'1');
  assert.deepEqual(result.body.permissions,['catalog.history.authorize','catalog.history.recover']);
  assert.deepEqual(result.atomic_effects,['assignment','membership_authorization_version','idempotency_result','mandatory_audit']);
  assert.equal(result.ledger_entry.expires_at,'2026-10-24T12:00:00.000Z');
});
test('self-assignment still needs current management authority',()=> {
  const input=scenario();input.context.target.membership_id=input.context.actor.membership_id;
  input.state.membership_id=input.command.target_membership_id=input.context.actor.membership_id;
  assert.equal(evaluate(input).status,200);input.context.actor.permissions=[];assert.equal(evaluate(input).status,403);
});
test('empty permissions revoke all and identical new intent increments the durable counter',()=> {
  const input=scenario();const first=evaluate(input);
  input.state=first.next_state;input.command.body.expected_version='1';input.command.body.permissions=[];
  const revoked=evaluate(input);assert.equal(revoked.body.assignment_version,'2');assert.deepEqual(revoked.body.permissions,[]);
  input.state=revoked.next_state;input.command.body.expected_version='2';assert.equal(evaluate(input).body.assignment_version,'3');
});
test('management, ordinary, unknown and duplicated permissions cannot be assigned',()=> {
  for (const permissions of [[managementPermission],['catalog.manage'],['OWNER'],['catalog.history.recover','catalog.history.recover'],[...assignablePermissions,'extra']]) {
    const input=scenario();input.command.body.permissions=permissions;assert.equal(evaluate(input).status,400);
  }
});
test('exact replay returns the historical result without extending time, version or audit',()=> {
  const input=scenario(), first=evaluate(input), saved=structuredClone(first.ledger_entry);
  input.state={...first.next_state,assignment_version:'7',permissions:[]};input.ledger=[first.ledger_entry];
  input.context.now='2026-10-17T12:00:01.000Z';
  const replay=evaluate(input);assert.equal(replay.status,200);assert.equal(replay.replay,true);assert.equal(replay.mutation,false);
  assert.deepEqual(replay.body,first.body);assert.equal(replay.next_state,undefined);assert.equal(replay.atomic_effects,undefined);
  assert.deepEqual(input.ledger[0],saved);
  input.command={method:'GET',target_membership_id:input.command.target_membership_id};assert.equal(evaluate(input).body.assignment_version,'7');
});
test('same key binds actor, target, expected version and original array order',()=> {
  for(const mutate of [
    input=>{input.context.actor.account_id='019a0010-0000-7000-8000-000000000009';},
    input=>{input.context.actor.membership_id='019a0010-0000-7000-8000-000000000009';},
    input=>{input.command.body.expected_version='1';},
    input=>{input.command.body.permissions.reverse();},
    input=>{input.context.target.membership_id=input.command.target_membership_id=input.state.membership_id='019a0010-0000-7000-8000-000000000009';},
  ]) {
    const input=scenario(), first=evaluate(input);input.state=first.next_state;input.ledger=[first.ledger_entry];mutate(input);
    assert.equal(evaluate(input).body.code,'identity_idempotency_key_reused');
  }
});
test('revocation, invalid workload or stale MFA is checked before replay and before parsing intent',()=> {
  for (const [field,value,status] of [['actor.permissions',[],403],['actor.membership_active',false,403],['actor.device_approved',false,403],['actor.mfa_authenticated_at','2026-10-17T11:54:59Z',403],['workload.authenticated',false,401]]) {
    const input=scenario(), first=evaluate(input);input.state=first.next_state;input.ledger=[first.ledger_entry];change(input.context,field,value);
    assert.equal(evaluate(input).status,status);input.command.body=null;assert.equal(evaluate(input).status,status);
  }
});
test('in-progress is retryable while a new key with stale version is not',()=> {
  const input=scenario(), first=evaluate(input);input.state=first.next_state;input.ledger=[{...first.ledger_entry,status:'in_progress'}];
  const pending=evaluate(input);assert.equal(pending.status,409);assert.equal(pending.body.retryable,true);assert.equal(pending.headers['Retry-After'],'1');
  input.command.idempotency_key='019a0010-0000-7000-8000-000000000009';
  const stale=evaluate(input);assert.equal(stale.body.code,'identity_state_or_version_conflict');assert.equal(stale.body.retryable,false);
});
test('expired ledger cannot recreate an old intent and never resets assignment version',()=> {
  const input=scenario(), first=evaluate(input);input.state=first.next_state;input.ledger=[{...first.ledger_entry,expires_at:input.context.now}];
  assert.equal(evaluate(input).body.code,'identity_state_or_version_conflict');
});
test('same key in another organization is independent',()=> {
  const input=scenario(), first=evaluate(input);input.ledger=[first.ledger_entry];
  const other='019a0010-0000-7000-8000-000000000009';
  input.context.actor.organization_id=input.context.actor.scope.organization_id=input.context.target.organization_id=input.state.organization_id=other;
  assert.equal(evaluate(input).status,200);
});
test('unknown, revoked and foreign target have identical protected response',()=> {
  const results=[null,{...scenario().context.target,active:false},{...scenario().context.target,organization_id:'019a0010-0000-7000-8000-000000000009'}].map(target=>{
    const input=scenario();input.context.target=target;return evaluate(input);
  });assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
test('signed bigint maximum never wraps; invalid request versions are rejected',()=> {
  const input=scenario();input.state={...input.state,assignment_version:maximumVersion.toString(),updated_at:input.context.now};
  input.command.body.expected_version=maximumVersion.toString();assert.equal(evaluate(input).body.code,'identity_state_or_version_conflict');
  for (const version of [(maximumVersion+1n).toString(),'01',-1,0,'-1','']) {input.command.body.expected_version=version;assert.equal(evaluate(input).status,400);}
});
test('corrupt state, ledger or unavailable audit fails without effects',()=> {
  for (const mutate of [input=>{input.state.assignment_version='-1';},input=>{input.state.permissions=['OWNER'];},input=>{input.state.permissions=['catalog.history.recover'];},input=>{input.ledger=[null];},input=>{input.context.audit_available=false;}]) {
    const input=scenario();mutate(input);const result=evaluate(input);assert.equal(result.status,503);assert.equal(result.mutation,undefined);
  }
});
test('extractor emits real DTO corpus into a fresh directory and refuses overwrite',()=> {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'oc-permission-candidate-'));
  try {
    const output=path.join(parent,'fixtures'),summary=prepare(output);
    assert(summary.schema_positive>20);assert(summary.schema_negative>50);assert.equal(summary.runtime_demonstrated,false);
    assert.throws(()=>prepare(output),/PERMISSION_OUTPUT_EXISTS/);
    assert(fs.readFileSync(path.join(output,'Problem.schema.json'),'utf8').includes('platform_not_acceptable'));
  } finally {fs.rmSync(parent,{recursive:true});}
});
