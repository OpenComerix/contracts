import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decimal,validatePhysicalLine} from './quantity-v1.mjs';

const families=new Set(['inventory.stock-adjustment.recorded.v1','inventory.sale-stock.posted.v2','inventory.sale-stock.compensated.v1','inventory.reconciliation-required.v2']);
export function validateHistory({session,page,check}) {
  assert.equal(check.organization_id,session.organization_id,'B_HISTORY_TENANT');
  assert.equal(session.request.organization_id,session.organization_id,'B_HISTORY_TENANT');
  assert.equal(page.organization_id,session.organization_id,'B_HISTORY_TENANT');
  assert.equal(check.account_ref,session.account_ref,'B_HISTORY_ACCOUNT');
  assert.equal(page.read_session_id,session.read_session_id,'B_HISTORY_SESSION');
  const lifetime=Date.parse(session.expires_at)-Date.parse(session.created_at);
  assert(Number.isFinite(lifetime)&&lifetime>0&&lifetime<=1_800_000,'B_HISTORY_LIFETIME');
  assert(Date.parse(check.at)>=Date.parse(session.created_at)&&Date.parse(check.at)<Date.parse(session.expires_at),'B_HISTORY_EXPIRED');
  assert.equal(page.snapshot_high_watermark,session.snapshot_high_watermark,'B_HISTORY_CUT');
  assert.equal(page.disposition_generation,session.disposition_generation,'B_HISTORY_GENERATION');
  assert.equal(check.disposition_generation,session.disposition_generation,'B_HISTORY_GENERATION');
  assert.equal(page.page.limit,session.request.limit,'B_HISTORY_LIMIT');
  assert(page.items.length<=page.page.limit&&page.page.limit<=100,'B_HISTORY_LIMIT');
  assert.equal(page.page.has_more,page.page.next_cursor!==null,'B_HISTORY_CURSOR');
  assert(Buffer.byteLength(JSON.stringify(page))<=1_048_576,'B_HISTORY_PAGE_SIZE');
  const high=BigInt(session.snapshot_high_watermark),from=BigInt(session.request.from_sequence);
  const to=BigInt(session.request.to_sequence??session.snapshot_high_watermark);
  assert(to<=high&&from<=to,'B_HISTORY_RANGE');
  assert.equal(page.requested_range.from_sequence,String(from),'B_HISTORY_RANGE');
  assert.equal(page.requested_range.to_sequence,String(to),'B_HISTORY_RANGE');
  const declared=page.families.map(x=>x.event_type).sort();
  assert.deepEqual(declared,[...session.request.families].sort(),'B_HISTORY_FAMILIES');
  for(const family of page.families)assert(families.has(family.event_type)&&family.schema_version===1,'B_HISTORY_VERSION');
  let previous=BigInt(check.last_sequence);const ids=new Set();
  for(const item of page.items) {
    const sequence=BigInt(item.history_sequence);
    assert(sequence>previous&&sequence>=from&&sequence<=to,'B_HISTORY_ORDER');previous=sequence;
    assert(session.request.families.includes(item.event_type)&&item.schema_version===1,'B_HISTORY_VERSION');
    assert(Buffer.byteLength(item.original_json)<=131072,'B_HISTORY_FACT_SIZE');
    assert.equal(createHash('sha256').update(item.original_json,'utf8').digest('hex'),item.serialized_sha256,'B_HISTORY_HASH');
    const fact=JSON.parse(item.original_json);
    assert.equal(fact.organization_id,session.organization_id,'B_HISTORY_FACT_TENANT');
    assert.equal(fact.event_type,item.event_type,'B_HISTORY_FACT_TYPE');assert.equal(fact.schema_version,item.schema_version,'B_HISTORY_VERSION');
    assert(!ids.has(fact.event_id),'B_HISTORY_DUPLICATE');ids.add(fact.event_id);
  }
  const ranges=page.missing_ranges.map(r=>[BigInt(r.from_sequence),BigInt(r.to_sequence)]);
  let lastMissing=0n;
  for(const [a,b] of ranges){assert(a>=from&&a<=b&&b<=to&&a>lastMissing,'B_HISTORY_MISSING_RANGE');lastMissing=b;assert(!page.items.some(x=>BigInt(x.history_sequence)>=a&&BigInt(x.history_sequence)<=b),'B_HISTORY_RANGE_OVERLAP');}
  if(page.coverage==='complete_for_requested_range')assert.equal(page.missing_ranges.length,0,'B_FALSE_COMPLETE');
  assert(['complete_for_requested_range','partial','unverifiable'].includes(page.coverage),'B_HISTORY_COVERAGE');
  // Filtered families legitimately have sequence gaps; the owner's retained
  // coverage declaration, not arithmetic continuity or end-of-page, is evidence.
  return {facts:page.items.length,coverage:page.coverage,runtime_demonstrated:false};
}
export function validateAdjustment(s) {
  const {request,capture,result,position_before,event}=s;
  assert.equal(capture.organization_id,request.organization_id,'B_ADJUST_TENANT');
  assert.equal(capture.operation_id,request.operation_id,'B_ADJUST_CAPTURE');
  assert.equal(capture.consistent_group,true,'B_ADJUST_CAPTURE');
  assert.equal(result.operation_id,request.operation_id,'B_ADJUST_OPERATION');
  assert.equal(result.reason_code,request.reason_code,'B_ADJUST_REASON');
  assert.equal(event.event_type,'inventory.stock-adjustment.recorded.v1','B_ADJUST_EVENT');assert.deepEqual(event.payload,result,'B_ADJUST_EVENT');
  assert.equal(event.aggregate_id,result.adjustment_id,'B_ADJUST_AGGREGATE');
  for(const key of ['organization_id','branch_id','warehouse_id','location_id'])assert.equal(result[key],request[key],'B_ADJUST_CONTEXT');
  assert.equal(new Set(request.lines.map(x=>x.line_id)).size,request.lines.length,'B_ADJUST_DUPLICATE');
  assert.equal(result.movements.length,request.lines.length,'B_ADJUST_GROUP');
  for(const input of request.lines) {
    assert.equal(input.expected_version,position_before.version,'B_ADJUST_VERSION');
    const snapshot=capture.lines.find(x=>x.line_id===input.line_id);assert(snapshot,'B_ADJUST_CAPTURE');
    assert.equal(snapshot.product_type,'STOCKED_GOOD','B_ADJUST_NONSTOCK');
    for(const key of ['presentation_id','product_version','presentation_version'])assert.equal(snapshot[key],input[key],'B_ADJUST_CATALOG_VERSION');
    const movement=result.movements.find(x=>x.line_id===input.line_id);assert(movement,'B_ADJUST_LINE');
    assert.deepEqual(movement.snapshot,snapshot,'B_ADJUST_SNAPSHOT');validatePhysicalLine(movement);
    assert.equal(movement.quantity,input.quantity,'B_ADJUST_QUANTITY');assert.equal(movement.direction,input.direction,'B_ADJUST_DIRECTION');
    const after=decimal(movement.before,{signed:true})+(movement.direction==='in'?1n:-1n)*decimal(movement.base_quantity,{positive:true});
    assert(after>=0n,'B_ADJUST_NEGATIVE');assert.equal(decimal(movement.after,{signed:true}),after,'B_ADJUST_BALANCE');
    assert.equal(movement.position_id,position_before.position_id,'B_ADJUST_POSITION');
  }
  if(request.reconciliation_id)assert.equal(request.reason_code,'correction','B_ADJUST_RECONCILIATION');
  return {runtime_demonstrated:false};
}

export function validatePosition(position) {
  const onHand=decimal(position.on_hand,{signed:true,canonical:true});
  assert.equal(position.available,position.on_hand,'B_POSITION_AVAILABLE');
  if(!position.has_movements){assert.equal(position.version,0,'B_POSITION_INITIAL_VERSION');assert.equal(onHand,0n,'B_POSITION_INITIAL_BALANCE');}
  else assert(position.version>0,'B_POSITION_VERSION');
}
export function validateRetainedResult(resource) {
  if(resource.status==='pending'){assert.equal(resource.result,null,'B_PENDING_TERMINAL_RESULT');return;}
  const result=resource.result;assert(result,'B_MISSING_TERMINAL_RESULT');
  assert.equal(resource.status,result.status==='succeeded'?'succeeded':'rejected','B_RESOURCE_RESULT_STATUS');
  assert.equal(resource.command_id,result.command_id,'B_RESOURCE_COMMAND');
  assert.equal(resource.organization_id,result.payload.context.organization_id,'B_RESOURCE_TENANT');
  assert.equal(resource.operation_id,result.result_type==='inventory.compensate-sale-stock.result.v1'?result.payload.compensation_operation_id:result.payload.context.operation_id,'B_RESOURCE_OPERATION');
}
