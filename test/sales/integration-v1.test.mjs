import test from 'node:test';
import assert from 'node:assert/strict';
import {read, compatibilityMessages} from '../../scripts/sales/integration-schema-v1.mjs';
import {integrationPath} from '../../scripts/sales/release-v1.mjs';
import {validateConnected,validateRecovery,validateCashReplay,fingerprint} from '../../scripts/sales/integration-v1.mjs';
const load=id=>read(integrationPath+id+'.json');
const normal=()=>load('normal');
for(const id of load('scenarios').scenarios)test('E connected wire scenario '+id,()=>assert.equal(validateConnected(load(id)).runtime_demonstrated,false));

for(const [name,edit,code] of [
  ['foreign tenant',s=>s.stock.command.payload.context.organization_id='foreign',/E_STOCK_organization_id/],
  ['changed physical factor',s=>s.stock.command.payload.lines[0].snapshot.conversion_factor='2',/E_STOCK_SNAPSHOT:conversion_factor/],
  ['different source description',s=>s.capture.lines[0].catalog.description='current master',/E_CATALOG_ORIGINAL/],
  ['changed observed price',s=>s.request.lines[0].reference.observed_unit_price='75.26',/E_OBSERVED_PRICE/],
  ['captured total differs',s=>s.capture.totals.commercial_total='75.26',/E_CAPTURE_TOTAL/],
  ['different stock result in finance',s=>s.finance.command.payload.stock.result_id=s.finance.result.result_id,/E_FINANCE_STOCK/],
  ['lost causal stock link',s=>s.finance.command.causation_id=s.accepted.operation_id,/E_CASH_CAUSE/],
  ['unadvanced process version',s=>s.finance.command.payload.context.process_version=1,/E_PROCESS_VERSION_ORDER/],
  ['changed cash total',s=>s.finance.command.payload.amounts.commercial_total='75.26',/E_CASH_TOTAL/],
  ['paid but compensation requested',s=>s.compensation=load('finance-rejected').compensation,/E_PAID_COMPENSATION/],
  ['completed stock ID mismatch',s=>s.completed.payload.stock.result_id=s.finance.result.result_id,/E_COMPLETED_STOCK/],
  ['completed payment ID mismatch',s=>s.completed.payload.payment.result_id=s.stock.result.result_id,/E_COMPLETED_PAYMENT/],
  ['completed capture changed',s=>s.completed.payload.lines[0].catalog.description='new master',/E_IMMUTABLE_CAPTURE:lines/],
  ['cash before confirmed stock',s=>[s.trace[2],s.trace[3]]=[s.trace[3],s.trace[2]],/E_TRACE/],
  ['regressed version',s=>s.trace[3].version=1,/E_TRACE/],
  ['number allocated in retained capture',s=>s.capture.commercial_number=s.completed.payload.commercial_number,/E_CAPTURE_FIELDS/],
  ['fiscal emission inferred',s=>s.capture.fiscal_context.fiscal_status='authorized',/E_PENDING_PROFILE/],
  ['runtime claim',s=>s.runtime_demonstrated=true,/E_RUNTIME_CLAIM/],
])test('E rejects '+name,()=>{const s=normal();edit(s);assert.throws(()=>validateConnected(s),code);});

test('stock rejection never issues cash or completed',()=>{const s=load('stock-rejected');s.finance=normal().finance;assert.throws(()=>validateConnected(s),/E_REJECTED_STOCK_CASH/);});
test('compensation cannot use another finance result',()=>{const s=load('finance-rejected');s.compensation.command.payload.finance_result_id=s.stock.result.result_id;assert.throws(()=>validateConnected(s),/E_COMPENSATION_FINANCE_RESULT/);});
test('compensation preserves exact original stock and difference case',()=>{const s=load('finance-rejected');s.compensation.result.payload.preserved_reconciliations=[];assert.throws(()=>validateConnected(s),/B_COMP_RECONCILIATION/);});
for(const key of ['organization_id','operation_id','sale_id','process_id','branch_id','warehouse_id','location_id','pos_id'])
  test('compensation rejects consistently forged '+key+' even with a matching command fingerprint',()=>{
    const s=load('finance-rejected'),x=s.compensation,value='019a1ae0-0000-7000-8000-000000000991';
    for(const context of [x.command.payload.context,x.result.payload.context,x.events[0].payload.context])context[key]=value;
    for(const field of ['organization_id','operation_id','process_id','process_version'])x.authority_query[field]=x.command.payload.context[field];
    x.authority_query.command_fingerprint=fingerprint(x.command);Object.assign(x.authority,x.authority_query);
    assert.throws(()=>validateConnected(s),new RegExp('E_COMPENSATION_CONTEXT:'+key));
  });
test('compensation result cannot change sale independently',()=>{const s=load('finance-rejected');s.compensation.result.payload.context.sale_id='019a1ae0-0000-7000-8000-000000000991';assert.throws(()=>validateConnected(s),/B_COMP_CONTEXT/);});
test('compensation event cannot change its physical context independently',()=>{const s=load('finance-rejected');s.compensation.events[0].payload.context.warehouse_id='019a1ae0-0000-7000-8000-000000000991';assert.throws(()=>validateConnected(s),/B_COMP_EVENT_PAYLOAD/);});
for(const [name,edit,code] of [
  ['command process',x=>x.command.correlation_id=x.command.command_id,/E_COMPENSATION_COMMAND_PROCESS/],
  ['result process',x=>x.result.correlation_id=x.command.command_id,/E_COMPENSATION_RESULT_PROCESS/],
  ['result cause',x=>x.result.causation_id=x.command.payload.finance_result_id,/E_COMPENSATION_RESULT_CAUSE/],
  ['event tenant',x=>x.events[0].organization_id='019a1ae0-0000-7000-8000-000000000991',/E_COMPENSATION_EVENT_CONTEXT:organization_id/],
  ['event branch',x=>x.events[0].branch_id='019a1ae0-0000-7000-8000-000000000991',/E_COMPENSATION_EVENT_CONTEXT:branch_id/],
  ['event POS',x=>x.events[0].pos_id='019a1ae0-0000-7000-8000-000000000991',/E_COMPENSATION_EVENT_CONTEXT:pos_id/],
  ['event process',x=>x.events[0].correlation_id=x.command.command_id,/E_COMPENSATION_EVENT_PROCESS/],
  ['event cause',x=>x.events[0].causation_id=x.command.payload.finance_result_id,/E_COMPENSATION_EVENT_CAUSE/],
])test('compensation envelope binds '+name+' to the same accepted process',()=>{const s=load('finance-rejected');edit(s.compensation);assert.throws(()=>validateConnected(s),code);});
for(const [name,edit,code] of [
  ['acceptance later than completed event',s=>s.accepted.accepted_at='2026-10-26T21:00:00Z',/E_COMPLETED_ACCEPTED_AT/],
  ['different accepted instant in event',s=>s.completed.payload.accepted_at='2026-10-26T20:00:01Z',/E_COMPLETED_ACCEPTED_AT/],
  ['request occurrence changed',s=>s.request.occurred_at='2026-10-26T19:59:59Z',/E_COMPLETED_OCCURRED_AT/],
  ['event occurrence changed',s=>s.completed.payload.occurred_at='2026-10-26T19:59:59Z',/E_COMPLETED_OCCURRED_AT/],
  ['request business date changed',s=>s.request.operating_date.business_date='2026-10-25',/E_COMPLETED_OPERATING_DATE/],
  ['request time zone changed',s=>s.request.operating_date.time_zone='Etc/UTC',/E_COMPLETED_OPERATING_DATE/],
  ['request date policy changed',s=>s.request.operating_date.date_policy_version='another-policy',/E_COMPLETED_OPERATING_DATE/],
  ['unparseable acceptance',s=>s.accepted.accepted_at='not-a-date',/E_TIME_INVALID:accepted/],
  ['unparseable catalog capture',s=>{s.catalog.captured_at='not-a-date';s.capture.captured_at='not-a-date';},/E_TIME_INVALID:capture/],
])test('D02 rejects '+name,()=>{const s=normal();edit(s);assert.throws(()=>validateConnected(s),code);});
test('D02 requires capture before acceptance even without a completed sale',()=>{const s=load('stock-rejected');s.accepted.accepted_at='2026-10-26T19:59:59Z';assert.throws(()=>validateConnected(s),/E_CAPTURE_AFTER_ACCEPTANCE/);});
test('D02 compares equal UTC instants across valid fractional-second representations',()=>{const s=normal();s.accepted.accepted_at='2026-10-26T20:00:00Z';s.completed.payload.accepted_at='2026-10-26T20:00:00.000Z';s.request.occurred_at='2026-10-26T20:00:00Z';s.completed.payload.occurred_at='2026-10-26T20:00:00.000Z';assert.equal(validateConnected(s).outcome,'completed');});
test('a stock difference remains posted and cash/complete succeed',()=>{for(const id of ['zero-difference','negative-difference']){const s=load(id);assert.equal(validateConnected(s).outcome,'completed');assert(s.completed.payload.stock.reconciliation_required);assert.equal(s.completed.payload.stock.reconciliations[0].severity,'action_required');}});

for(const owner of ['inventory','finance']) {
  test(owner+' response loss and retry preserve command/result/snapshot IDs',()=>validateRecovery(normal(),load('recovery-'+owner)));
  for(const [name,edit,code] of [
    ['new command',o=>o.command.command_id=o.completed.event_id,/E_RECOVERY_COMMAND/],
    ['new result ID',o=>o.retained_result.result_id=o.completed.event_id,/E_RECOVERY_ORIGINAL_RESULT/],
    ['404 treated as rejection',o=>o.lookups[0].action='compensate',/E_UNKNOWN_IS_REJECTION/],
    ['pending claims terminal result',o=>o.lookups[1].result=o.retained_result,/E_RECOVERY_PREMATURE_RESULT/],
    ['another movement',o=>o.new_movements.push({movement_id:'synthetic'}),/E_RECOVERY_NEW_EFFECT/],
    ['another number',o=>o.new_numbers.push('2'),/E_RECOVERY_NEW_NUMBER/],
    ['another completed snapshot',o=>o.completed.payload.commercial_number.number='2',/E_RECOVERY_FINAL_SNAPSHOT/],
    ['compensate unknown',o=>o.compensation={requested:true},/E_RECOVERY_COMPENSATION/],
  ])test(owner+' recovery rejects '+name,()=>{const o=load('recovery-'+owner);edit(o);assert.throws(()=>validateRecovery(normal(),o),code);});
}
test('cash duplicate uses independently retained original result without new funds',()=>validateCashReplay(normal(),load('cash-replay')));
test('different transport ID cannot create another payment',()=>{
 const r=load('cash-replay');r.command.command_id='019a1ae0-0000-7000-8000-000000000001';r.authority_query.command_id=r.command.command_id;r.authority_query.command_fingerprint=fingerprint(r.command);Object.assign(r.authority,r.authority_query);validateCashReplay(normal(),r);
});
test('conflicting cash amount retains prior success and reports conflict, never payment_absent',()=>{
 const r=load('cash-replay');r.command.payload.amounts.received='101.00';r.command.payload.amounts.change='25.75';r.authority_query.command_fingerprint=fingerprint(r.command);Object.assign(r.authority,r.authority_query);r.conflict={code:'finance_operation_conflict',retryable:false};validateCashReplay(normal(),r,true);
 r.result={...r.result,status:'failed',payload:{payment_absent:true}};assert.throws(()=>validateCashReplay(normal(),r,true),/C_RETAINED_RESULT_STABLE/);
});
test('cash replay cannot create another movement',()=>{const r=load('cash-replay');r.movements=normal().finance.movements;assert.throws(()=>validateCashReplay(normal(),r),/C_RETAINED_DUPLICATE_MOVEMENT/);});

test('all fourteen known producer/reader pairs use fixed revisions and no runtime admission',()=>{
 const matrix=load('compatibility'),messages=compatibilityMessages();assert.equal(messages.length,14);assert.equal(matrix.pairs.length,14);
 assert.deepEqual(matrix.pairs.map(p=>p.type),messages.map(p=>p.type));
 for(const p of matrix.pairs){assert.equal(p.revision,1);assert.equal(p.reader,p.producer.replace('.schema.json','.consumer.schema.json'));}
 for(const owner of matrix.future_owners){assert.equal(owner.runtime_version,null);assert.equal(owner.consumer_admission,'not_created');}
});
test('declared optional source_note does not change known message interpretation',()=>{
 for(const {value} of compatibilityMessages()) {const evolved=structuredClone(value);evolved.payload.extensions={source_note:'synthetic'};
  const interpretation=v=>{const payload=structuredClone(v.payload);delete payload.extensions;return payload;};assert.deepEqual(interpretation(evolved),interpretation(value));}
});
test('traceability closes D01-D13 and CAF01-15 with concrete fixtures/gates and runtime owners',()=>{
 const t=load('traceability');assert.deepEqual(t.data.map(r=>r.id),Array.from({length:13},(_,i)=>'D'+String(i+1).padStart(2,'0')));
 assert.deepEqual(t.criteria.map(r=>r.id),Array.from({length:15},(_,i)=>'CAF-'+String(i+1).padStart(2,'0')));
 for(const r of [...t.data,...t.criteria]){assert(r.invariant&&r.gates.length&&r.runtime_owners.length);for(const f of r.fixtures){if(['release','compatibility'].includes(f))continue;assert.doesNotThrow(()=>read(f.includes('/')?f:integrationPath+f+'.json'));}}
 assert.equal(t.runtime_demonstrated,false);assert(t.runtime_limits.includes('CAF-16'));
});
