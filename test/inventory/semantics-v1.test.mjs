import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {decimal,baseQuantity} from '../../scripts/inventory/quantity-v1.mjs';
import {fingerprint,normalizedRequest,requestFingerprint,validateHumanBinding} from '../../scripts/inventory/authority-v1.mjs';
import {validatePostScenario,validateReplay,validateCompensationScenario,validatePhysicalProjection} from '../../scripts/inventory/effects-v1.mjs';
import {validateHistory,validateAdjustment,validatePosition,validateRetainedResult} from '../../scripts/inventory/history-v1.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const fixture=name=>read('inventory/fixtures/effects/v1/'+name+'.json');
const resign=s=>{s.authority_query.command_fingerprint=fingerprint(s.command);s.authority.command_fingerprint=s.authority_query.command_fingerprint;return s;};
for(const [name,load,validate] of [
 ['post',()=>fixture('normal'),validatePostScenario],
 ['compensation',()=>read('inventory/fixtures/compensation/v1/after_difference.json'),validateCompensationScenario],
]) {
 test(name+' authority query is constructible from the hashed command step',()=>{const s=load();assert.equal(s.command.payload.step_id,s.authority_query.step_id);assert.equal(s.authority_query.command_fingerprint,fingerprint(s.command));validate(s);});
 test(name+' cannot substitute query and decision step with unchanged command',()=>{const s=load();s.authority_query.step_id=s.authority.step_id='019a0000-0000-7000-8000-999999999999';assert.throws(()=>validate(s),/B_STEP_ID_BINDING/);});
 test(name+' requires the step inside the command',()=>{const s=load();delete s.command.payload.step_id;resign(s);assert.throws(()=>validate(s),/B_STEP_ID_REQUIRED/);});
 test(name+' command step is protected by the complete fingerprint',()=>{const s=load();s.command.payload.step_id=s.authority_query.step_id=s.authority.step_id='019a0000-0000-7000-8000-999999999999';assert.throws(()=>validate(s),/B_COMMAND_HASH/);});
}
test('restricted origin audit links the difference without entering any physical projection',()=>{const s=fixture('zero_with_difference');validatePostScenario(s);assert.equal(s.observations.restricted_origin_audit[0].grant_decision_ref,s.authority.stock_difference_grant.decision_ref);for(const x of [s.result,s.events,read('inventory/fixtures/http/v1/resources.json').Reconciliation])validatePhysicalProjection(x);});
for(const [name,select] of [
 ['result',s=>s.result.payload.differences[0]],
 ['posted fact',s=>s.events[0].payload.differences[0]],
 ['reconciliation fact',s=>s.events[1].payload.difference],
])test('restricted origin evidence is rejected in '+name,()=>{const s=fixture('zero_with_difference');select(s).grant_decision_ref=s.authority.stock_difference_grant.decision_ref;assert.throws(()=>validatePostScenario(s),/B_RESTRICTED_AUDIT_LEAK/);});
test('restricted origin audit cannot be omitted or rebound',()=>{let s=fixture('zero_with_difference');s.observations.restricted_origin_audit=[];assert.throws(()=>validatePostScenario(s),/B_RESTRICTED_AUDIT_COVERAGE/);s=fixture('zero_with_difference');s.observations.restricted_origin_audit[0].grant_decision_ref='other';assert.throws(()=>validatePostScenario(s),/B_RESTRICTED_AUDIT_BINDING/);});

for(const name of ['normal','zero_with_difference','negative_with_difference','first_movement','block_rejection','missing_permission_rejection','missing_presence_rejection','same_position_presentations','non_stock','service'])test('declared stock observations: '+name,()=>assert.equal(validatePostScenario(fixture(name)).runtime_demonstrated,false));
for(const [name,mutate] of [
  ['different tenant',s=>{s.result.payload.context.organization_id='other';}],
  ['forged command',s=>{s.command.payload.lines[0].quantity='3';}],
  ['new command identity',s=>{s.command.command_id='019a0000-0000-7000-8000-999999999999';}],
  ['authority expired',s=>{s.budget.now=3000;}],
  ['wrong caller',s=>{s.authority.caller='gateway-bff';}],
  ['wrong audience',s=>{s.authority.audience='identity-tenancy.catalog-authority';}],
  ['stale process version',s=>{s.authority.process_version++;}],
  ['missing physical presence',s=>{s.command.payload.lines[0].physical_presence_confirmed=false;resign(s);}],
  ['wrong permission',s=>{s.authority.stock_difference_grant.permission='sales.finalize';}],
  ['different origin authority',s=>{s.authority.stock_difference_grant.origin_authorization_ref='another-origin';}],
  ['wrong branch scope',s=>{s.authority.stock_difference_grant.branch_id='other';}],
  ['wrong POS scope',s=>{s.authority.stock_difference_grant.pos_id='other';}],
  ['wrong warehouse scope',s=>{s.authority.stock_difference_grant.warehouse_id='019a0000-0000-7000-8000-999999999999';}],
  ['grant quantity too small',s=>{s.authority.stock_difference_grant.maximum_base_quantities[0].base_quantity='0.5';}],
  ['grant does not cover every line',s=>{s.authority.stock_difference_grant.line_ids.pop();}],
  ['policy BLOCK',s=>{s.observations.policy='BLOCK';}],
  ['unknown policy',s=>{s.observations.policy='IGNORE';}],
  ['duplicate line',s=>{s.command.payload.lines[1].line_id=s.command.payload.lines[0].line_id;resign(s);}],
  ['wrong derived quantity',s=>{s.command.payload.lines[0].base_quantity='0.1';resign(s);}],
  ['wrong factor',s=>{s.command.payload.lines[0].snapshot.conversion_factor='3';resign(s);}],
  ['partial group result',s=>{s.result.payload.lines.pop();}],
  ['missing movement',s=>{s.result.payload.movements.pop();}],
  ['duplicate movement identity',s=>{s.result.payload.movements[1].movement_id=s.result.payload.movements[0].movement_id;}],
  ['false zero balance',s=>{s.observations.lines[0].after='0';}],
  ['missing reconciliation warning',s=>{s.result.payload.warnings=[];}],
  ['wrong occurrence',s=>{s.result.payload.differences[0].occurrence_id='019a0000-0000-7000-8000-999999999999';}],
  ['wrong policy version',s=>{s.observations.policy_version++;}],
  ['unknown result revision',s=>{s.result.schema_version=2;}],
  ['transient failure claimed terminal',s=>{s.result.retryable=true;}],
])test('stock negative: '+name,()=>{const s=fixture('same_position_presentations');mutate(s);assert.throws(()=>validatePostScenario(s));});
test('availability does not promise a later effect: enough then insufficient transcript rejects the group',()=>{
  const s=fixture('missing_permission_rejection');s.observations.prior_available='10';assert.equal(validatePostScenario(s).outcome,'rejected');
});
test('a rejected group cannot preserve one partial movement',()=>{const s=fixture('block_rejection');s.observations.movements.push(fixture('normal').observations.movements[0]);assert.throws(()=>validatePostScenario(s),/B_FAILED_MOVEMENTS/);});
test('not_required never fabricates a stock event',()=>{const s=fixture('service');s.events.push(fixture('normal').events[0]);assert.throws(()=>validatePostScenario(s),/B_FALSE_STOCK_EVENT/);});
test('declared compatible metadata preserves known stock interpretation',()=>{const s=fixture('normal'),expected=validatePostScenario(s);s.result.payload.extensions={source_note:'synthetic'};s.events[0].payload.extensions={source_note:'synthetic'};assert.deepEqual(validatePostScenario(s),expected);});
test('posted group aggregate identifies the immutable original operation, not an arbitrary movement',()=>{const s=fixture('normal');s.events[0].aggregate_id=s.result.payload.movements[0].movement_id;assert.throws(()=>validatePostScenario(s),/B_POSTING_ID/);});
test('serialized command/result/event limit is checked before any fixture effect is accepted',()=>{const s=fixture('normal');s.events[0].payload.extensions={source_note:'x'.repeat(131072)};assert.throws(()=>validatePostScenario(s),/B_MESSAGE_SIZE/);});
test('replay preserves every result, effect and reconciliation identity',()=>{const s=fixture('same_position_presentations');validateReplay(s,structuredClone(s));const wrong=structuredClone(s);wrong.result.result_id='new';assert.throws(()=>validateReplay(s,wrong),/B_REPLAY_RESULT/);});
for(const name of ['before_output','after_difference'])test('compensation '+name,()=>validateCompensationScenario(read('inventory/fixtures/compensation/v1/'+name+'.json')));
for(const [name,change] of [
 ['payment exists',s=>{s.authority.terminal_finance_rejection.payment_absent=false;}],
 ['sale completed',s=>{s.authority.terminal_finance_rejection.sale_completed=true;}],
 ['not terminal',s=>{s.authority.terminal_finance_rejection=null;}],
 ['different finance result',s=>{s.authority.terminal_finance_rejection.finance_result_id='other';}],
 ['lost original links',s=>{s.result.payload.original_movement_ids=[];}],
 ['cleared physical difference',s=>{s.result.payload.preserved_reconciliations=[];}],
 ['current factor used',s=>{s.result.payload.movements[0].snapshot.conversion_factor='2';}],
 ['double compensation quantity',s=>{s.result.payload.movements[0].base_quantity='2';}],
])test('compensation negative: '+name,()=>{const s=read('inventory/fixtures/compensation/v1/after_difference.json');change(s);assert.throws(()=>validateCompensationScenario(s));});
test('late output after early closure cannot be applied',()=>{const s=read('inventory/fixtures/compensation/v1/before_output.json');s.late_output_rejected=false;assert.throws(()=>validateCompensationScenario(s),/B_LATE_OUTPUT/);});

const vectors=read('inventory/fixtures/vectors/v1/quantities.json');
for(const [index,v] of vectors.cases.entries())test('exact quantity vector '+index,()=>{
 const snapshot={conversion_factor:v.factor,minimum_quantity:'0.001',quantity_increment:'0.001',allows_fractions:true,base_unit:'unit',presentation_unit:'unit'};
 if(v.error)assert.throws(()=>baseQuantity(v.quantity,snapshot),new RegExp(v.error));else assert.equal(baseQuantity(v.quantity,snapshot),v.expected);
});
for(const value of ['-0','-0.000000000','+1','01','1e2','1,5','1.0000000001','9'.repeat(39)])test('invalid balance decimal '+value,()=>assert.throws(()=>decimal(value,{signed:true,canonical:true})));
test('incompatible units and indivisible fractions are rejected',()=>{
 const s={conversion_factor:'1',minimum_quantity:'1',quantity_increment:'1',allows_fractions:false,base_unit:'unit',presentation_unit:'unit'};
 assert.throws(()=>baseQuantity('1.5',s),/B_INDIVISIBLE|B_MINIMUM_INCREMENT/);assert.throws(()=>baseQuantity('2',{...s,presentation_unit:'kg'}),/B_UNIT_DIMENSION/);
});
test('catalogue minimum must be a multiple of its increment and indivisible configuration uses integers',()=>{const s={conversion_factor:'1',minimum_quantity:'1',quantity_increment:'0.3',allows_fractions:true,base_unit:'unit',presentation_unit:'unit'};assert.throws(()=>baseQuantity('1',s),/B_MINIMUM_INCREMENT_MULTIPLE/);assert.throws(()=>baseQuantity('1',{...s,minimum_quantity:'0.001',quantity_increment:'0.001',allows_fractions:false}),/B_INDIVISIBLE_CONFIGURATION/);});
const h=read('identity/fixtures/inventory-authority/v1/human.json');
test('human decision binds current scope and complete canonical request',()=>validateHumanBinding(h.request,h.decision,h.check));
for(const [name,change] of [['tenant',s=>{s.check.organization='other';}],['account',s=>{s.check.account='other';}],['scope',s=>{s.decision.scope.branch_ids=[];}],['permission',s=>{s.check.permission='inventory.configure';}],['hash',s=>{s.request.body.reason_code='correction';}],['expired',s=>{s.check.now=3000;}]])test('human negative: '+name,()=>{const s=structuredClone(h);change(s);assert.throws(()=>validateHumanBinding(s.request,s.decision,s.check));});
test('scale is checked before canonical decimal normalization',()=>{
 const equivalent=structuredClone(h.request);equivalent.body.lines[0].quantity='2.000';assert.equal(requestFingerprint(equivalent),requestFingerprint(h.request));
 equivalent.body.lines[0].quantity='2.0000';assert.throws(()=>requestFingerprint(equivalent),/B_DECIMAL_FORMAT/);
});
test('canonical query order does not matter and omission remains distinct from null',()=>{
 const a=structuredClone(h.request);a.query={cursor:'opaque',limit:'50'};const b=structuredClone(a);b.query={limit:'50',cursor:'opaque'};assert.equal(requestFingerprint(a),requestFingerprint(b));
 const x=structuredClone(h.request);x.body.reconciliation_id=null;assert.notEqual(requestFingerprint(x),requestFingerprint(h.request));
 assert.throws(()=>normalizedRequest({...h.request,extra:true}),/B_CANONICAL_FIELDS/);
});
test('body operation and HTTP idempotency key remain the same identity',()=>{const s=structuredClone(h.request);s.body.operation_id='019a0000-0000-7000-8000-999999999999';assert.throws(()=>requestFingerprint(s),/B_IDEMPOTENCY_BINDING/);});
for(const name of ['complete','partial'])test('history '+name,()=>validateHistory(read('inventory/fixtures/history/v1/'+name+'.json')));
for(const [name,change] of [
 ['wrong tenant',s=>{s.page.organization_id='other';}],['wrong account',s=>{s.check.account_ref='other';}],['new cut',s=>{s.page.snapshot_high_watermark='3';}],
 ['concurrent disposition',s=>{s.check.disposition_generation++;}],['expired cursor session',s=>{s.check.at=s.session.expires_at;}],
 ['too long session',s=>{s.session.expires_at='2026-10-26T13:00:00Z';}],['modified source bytes',s=>{s.page.items[0].original_json+=' ';}],
 ['unknown revision',s=>{s.page.items[0].schema_version=999;}],['reordered facts',s=>{s.page.items.reverse();}],['changed limit',s=>{s.page.page.limit=100;}],
])test('history negative: '+name,()=>{const s=read('inventory/fixtures/history/v1/complete.json');change(s);assert.throws(()=>validateHistory(s));});
test('end of a partial page never proves complete history',()=>{const s=read('inventory/fixtures/history/v1/partial.json');s.page.coverage='complete_for_requested_range';assert.throws(()=>validateHistory(s),/B_FALSE_COMPLETE/);});
test('opening adjustment uses the verified physical capture',()=>validateAdjustment(read('inventory/fixtures/adjustment/v1/opening.json')));
for(const [name,change] of [['wrong factor',s=>{s.capture.lines[0].conversion_factor='2';}],['stale version',s=>{s.position_before.version++;}],['negative result',s=>{s.request.lines[0].direction='out';s.result.movements[0].direction='out';}],['different presentation',s=>{s.capture.lines[0].presentation_id='other';}]])test('adjustment negative: '+name,()=>{const s=read('inventory/fixtures/adjustment/v1/opening.json');change(s);assert.throws(()=>validateAdjustment(s));});
test('availability equals on_hand in F1; no movements is a zero accumulator, not a physical count',()=>{const p=read('inventory/fixtures/http/v1/resources.json').Position;validatePosition(p);assert.throws(()=>validatePosition({...p,on_hand:'-1',available:'-1'}),/B_POSITION_INITIAL_BALANCE/);assert.throws(()=>validatePosition({...p,available:'1'}),/B_POSITION_AVAILABLE/);});
test('pending result is absent; terminal query returns its original owner result and identity',()=>{const pending=read('inventory/fixtures/http/v1/resources.json').SaleStockResult;validateRetainedResult(pending);const s=fixture('normal');const resource={organization_id:s.command.organization_id,operation_id:s.command.payload.context.operation_id,command_id:s.command.command_id,status:'succeeded',result:s.result};validateRetainedResult(resource);assert.throws(()=>validateRetainedResult({...resource,status:'rejected'}),/B_RESOURCE_RESULT_STATUS/);assert.throws(()=>validateRetainedResult({...resource,operation_id:'other'}),/B_RESOURCE_OPERATION/);});
test('terminal failed compensation preserves its own identity without claiming stock rejection or restored balance',()=>{const s=read('inventory/fixtures/compensation/v1/terminal_failure.json');validateRetainedResult({organization_id:s.command.organization_id,operation_id:s.command.payload.compensation_operation_id,command_id:s.command.command_id,status:'rejected',result:s.result});assert.equal(s.result.payload.no_compensation_effect,true);assert(!Object.hasOwn(s.result.payload,'stock_status'));assert.deepEqual(s.events,[]);});
