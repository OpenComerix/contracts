import assert from 'node:assert/strict';
import {decimal,format,validatePhysicalLine} from './quantity-v1.mjs';
import {validateTechnicalBinding,canonicalJSON} from './authority-v1.mjs';

const same=(a,b,code)=>assert.deepEqual(a,b,code);
export function validatePhysicalProjection(value) {
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)) {
    assert(!['grant_decision_ref','origin_authorization_ref','decision_ref'].includes(key),'B_RESTRICTED_AUDIT_LEAK');
    validatePhysicalProjection(child);
  }
}
function contexts(value,organization) {
  if(!value||typeof value!=='object')return;
  if(Object.hasOwn(value,'organization_id'))same(value.organization_id,organization,'B_TENANT');
  Object.values(value).forEach(x=>contexts(x,organization));
}
export function validatePostScenario(s) {
  // Validate declared observations; this is not simulated SQL execution.
  const {command,result,authority_query,authority,observations}=s;
  validatePhysicalProjection(result);validatePhysicalProjection(s.events);
  for(const message of [command,result,...s.events])assert(Buffer.byteLength(canonicalJSON(message))<=131072,'B_MESSAGE_SIZE');
  validateTechnicalBinding(command,authority_query,authority,s.budget);
  const context=command.payload.context;
  contexts(s,context.organization_id);
  same(result.command_id,command.command_id,'B_RESULT_COMMAND');
  same(result.producer,'inventory','B_RESULT_PRODUCER');
  same(result.result_type,'inventory.post-sale-stock.result.v1','B_RESULT_TYPE');
  same(result.schema_version,1,'B_RESULT_REVISION');
  same(result.payload.context,context,'B_RESULT_CONTEXT');
  same(result.correlation_id,command.correlation_id,'B_CORRELATION');
  same(result.causation_id,command.command_id,'B_CAUSATION');
  const seen=new Set(),groups=new Map();
  for(const line of command.payload.lines) {
    assert(!seen.has(line.line_id),'B_DUPLICATE_LINE');seen.add(line.line_id);
    const amount=validatePhysicalLine(line);
    const obs=observations.lines.find(x=>x.line_id===line.line_id);assert(obs,'B_LINE_OBSERVATION');
    if(line.snapshot.product_type!=='STOCKED_GOOD')continue;
    const group=groups.get(obs.position_id)??{amount:0n,lines:[],before:obs.before,after:obs.after};
    same(group.before,obs.before,'B_GROUP_BEFORE');same(group.after,obs.after,'B_GROUP_AFTER');
    group.amount+=amount;group.lines.push(line);groups.set(obs.position_id,group);
  }
  same(observations.lines.length,command.payload.lines.length,'B_OBSERVATION_COVERAGE');
  let rejected=false;const differences=[];
  for(const [position,g] of groups) {
    const after=decimal(g.before,{signed:true,canonical:true})-g.amount;
    if(after>=0n)continue;
    const grant=authority.stock_difference_grant;
    const granted=grant && grant.permission==='inventory.sell_with_stock_difference'
      && grant.organization_id===context.organization_id && grant.branch_id===context.branch_id
      && grant.warehouse_id===context.warehouse_id && grant.location_id===context.location_id && grant.pos_id===context.pos_id
      && grant.origin_authorization_ref===command.payload.origin_authorization_ref
      && g.lines.every(line=>line.physical_presence_confirmed===true && grant.line_ids.includes(line.line_id)
        && grant.maximum_base_quantities.some(q=>q.line_id===line.line_id&&decimal(q.base_quantity,{positive:true})>=decimal(line.base_quantity,{positive:true})));
    if(observations.policy!=='ALLOW_AND_ALERT'||!granted)rejected=true;
    differences.push(position);
  }
  same(result.status,rejected?'failed':'succeeded','B_STOCK_DECISION');
  same(result.retryable,false,'B_TERMINAL_ONLY');
  if(rejected) {
    same(result.error_code,'inventory_insufficient_stock','B_STOCK_ERROR');
    same(result.payload.stock_status,'rejected','B_FAILED_STATUS');same(result.payload.no_effect,true,'B_NO_EFFECT');
    same(observations.movements,[],'B_FAILED_MOVEMENTS');same(s.events,[],'B_FAILED_EVENTS');same(observations.differences,[],'B_FAILED_DIFFERENCES');
    same(observations.restricted_origin_audit,[],'B_FAILED_DIFFERENCE_AUDIT');
    for(const g of groups.values())same(g.after,g.before,'B_FAILED_BALANCE');
    return {outcome:'rejected',runtime_demonstrated:false};
  }
  assert(!Object.hasOwn(result,'error_code'),'B_SUCCESS_ERROR');
  same(result.payload.stock_status,groups.size?'posted':'not_required','B_STOCK_STATUS');
  same(result.payload.reconciliation_required,differences.length>0,'B_DIFFERENCE_STATUS');
  same(result.payload.movements,observations.movements,'B_MOVEMENT_RESULT');
  same(result.payload.differences,observations.differences,'B_DIFFERENCE_RESULT');
  same(result.payload.differences.map(x=>x.position_id).sort(),differences.sort(),'B_DIFFERENCE_COVERAGE');
  same(new Set(result.payload.differences.map(x=>x.occurrence_id)).size,differences.length,'B_OCCURRENCE_UNIQUE');
  same(result.payload.warnings.length,differences.length,'B_WARNING_COUNT');
  same(observations.restricted_origin_audit.length,differences.length,'B_RESTRICTED_AUDIT_COVERAGE');
  for(const [position,g] of groups) {
    same(g.after,format(decimal(g.before,{signed:true})-g.amount),'B_GROUP_BALANCE');
    const moves=observations.movements.filter(x=>x.position_id===position);
    same(moves.length,g.lines.length,'B_MOVEMENT_LINE_COVERAGE');
    same(moves.reduce((sum,x)=>sum+decimal(x.base_quantity,{positive:true}),0n),g.amount,'B_MOVEMENT_AMOUNT');
    let running=decimal(g.before,{signed:true});
    for(const movement of moves) {
      same(movement.direction,'out','B_MOVEMENT_DIRECTION');same(movement.reason_code,'sale','B_MOVEMENT_REASON');
      const source=g.lines.find(x=>x.line_id===movement.line_id);assert(source,'B_MOVEMENT_LINE');
      same(movement.snapshot,source.snapshot,'B_SNAPSHOT');same(movement.quantity,source.quantity,'B_QUANTITY');same(movement.base_quantity,source.base_quantity,'B_QUANTITY');
      same(movement.before,format(running),'B_MOVEMENT_BEFORE');running-=decimal(movement.base_quantity,{positive:true});same(movement.after,format(running),'B_MOVEMENT_AFTER');
      same(movement.operation_id,context.operation_id,'B_MOVEMENT_OPERATION');
      for(const key of ['branch_id','warehouse_id','location_id'])same(movement[key],context[key],'B_MOVEMENT_CONTEXT');
    }
    if(differences.includes(position)) {
      const d=result.payload.differences.find(x=>x.position_id===position);
      same(d.before,g.before,'B_DIFFERENCE_BEFORE');same(d.after,g.after,'B_DIFFERENCE_AFTER');same(d.issued,format(g.amount),'B_DIFFERENCE_AMOUNT');
      same(d.line_ids,g.lines.map(x=>x.line_id),'B_DIFFERENCE_LINES');same(d.policy,'ALLOW_AND_ALERT','B_DIFFERENCE_POLICY');
      same(d.policy_version,observations.policy_version,'B_POLICY_VERSION');
      const audit=observations.restricted_origin_audit.find(x=>x.occurrence_id===d.occurrence_id);assert(audit,'B_RESTRICTED_AUDIT_LINK');
      same(audit,{organization_id:context.organization_id,operation_id:context.operation_id,position_id:position,reconciliation_id:d.reconciliation_id,occurrence_id:d.occurrence_id,grant_decision_ref:authority.stock_difference_grant.decision_ref,origin_authorization_ref:command.payload.origin_authorization_ref},'B_RESTRICTED_AUDIT_BINDING');
      assert(result.payload.warnings.some(w=>w.code==='inventory_stock_difference_recorded'&&w.severity==='action_required'&&w.occurrence_id===d.occurrence_id&&w.reconciliation_id===d.reconciliation_id&&w.position_id===position),'B_WARNING_BINDING');
    }
  }
  for(const line of command.payload.lines) {
    const effect=result.payload.lines.find(x=>x.line_id===line.line_id);assert(effect,'B_EFFECT_LINE');
    if(line.snapshot.product_type==='STOCKED_GOOD') {
      same(effect.status,'posted','B_EFFECT_STATUS');assert(observations.movements.some(m=>m.line_id===line.line_id&&m.movement_id===effect.movement_id&&m.movement_version===effect.movement_version&&m.position_version===effect.position_version),'B_EFFECT_MOVEMENT');
    }else {same(effect.status,'not_required','B_EFFECT_STATUS');same(effect.reason_code,line.snapshot.product_type,'B_NONSTOCK_REASON');same(effect.snapshot,line.snapshot,'B_NONSTOCK_SNAPSHOT');}
  }
  same(result.payload.lines.length,command.payload.lines.length,'B_EFFECT_COVERAGE');
  const posted=s.events.filter(x=>x.event_type==='inventory.sale-stock.posted.v2');
  same(posted.length,groups.size?1:0,'B_FALSE_STOCK_EVENT');if(groups.size){same(posted[0].payload,result.payload,'B_EVENT_RESULT');same(posted[0].aggregate_type,'sale_stock_posting','B_POSTING_AGGREGATE');same(posted[0].aggregate_id,context.operation_id,'B_POSTING_ID');same(posted[0].aggregate_version,1,'B_POSTING_VERSION');}
  const reconciliation=s.events.filter(x=>x.event_type==='inventory.reconciliation-required.v2');
  same(reconciliation.length,differences.length,'B_RECONCILIATION_EVENTS');
  for(const e of reconciliation){same(e.aggregate_type,'inventory_reconciliation','B_CASE_AGGREGATE');same(e.aggregate_id,e.payload.reconciliation_id,'B_CASE_ID');}
  for(const d of result.payload.differences)assert(reconciliation.some(e=>e.payload.occurrence_id===d.occurrence_id&&e.payload.reconciliation_id===d.reconciliation_id&&JSON.stringify(e.payload.difference)===JSON.stringify(d)),'B_RECONCILIATION_BINDING');
  same(new Set(observations.movements.map(x=>x.movement_id)).size,observations.movements.length,'B_MOVEMENT_UNIQUE');
  return {outcome:'succeeded',positions:groups.size,differences:differences.length,runtime_demonstrated:false};
}
export function validateReplay(original,replay) {
  same(replay.result,original.result,'B_REPLAY_RESULT');same(replay.events,original.events,'B_REPLAY_EVENT_IDS');same(replay.observations,original.observations,'B_REPLAY_OBSERVATIONS');
  return {runtime_demonstrated:false};
}
export function validateCompensationScenario(s) {
  for(const message of [s.command,s.result,...s.events])assert(Buffer.byteLength(canonicalJSON(message))<=131072,'B_MESSAGE_SIZE');
  validateTechnicalBinding(s.command,s.authority_query,s.authority,s.budget);
  const {payload}=s.result;const original=s.original;
  same(s.result.command_id,s.command.command_id,'B_COMP_COMMAND');same(payload.context,s.command.payload.context,'B_COMP_CONTEXT');contexts(s,payload.context.organization_id);
  same(s.result.result_type,'inventory.compensate-sale-stock.result.v1','B_COMP_RESULT_TYPE');same(s.result.schema_version,1,'B_COMP_REVISION');
  same(s.result.status,'succeeded','B_COMP_STATUS');same(s.result.retryable,false,'B_COMP_RETRY');
  for(const key of ['compensation_operation_id','original_operation_id','original_command_id','finance_result_id'])same(payload[key],s.command.payload[key],'B_COMP_BINDING');
  if(s.arrival==='before_output') {
    same(payload.status,'closed_without_movement','B_EARLY_STATUS');same(payload.movements,[],'B_EARLY_MOVEMENT');same(payload.original_movement_ids,[],'B_EARLY_IDS');same(s.events,[],'B_EARLY_EVENTS');same(s.late_output_rejected,true,'B_LATE_OUTPUT');
  }else {
    same(payload.status,'compensated','B_COMP_STATUS');same(payload.movements.length,original.result.payload.movements.length,'B_COMP_COUNT');
    same(payload.original_movement_ids,original.result.payload.movements.map(x=>x.movement_id),'B_COMP_ORIGINALS');
    for(const movement of payload.movements) {
      const prior=original.result.payload.movements.find(x=>x.movement_id===movement.original_movement_id);assert(prior,'B_COMP_ORIGINAL');
      same(movement.position_id,prior.position_id,'B_COMP_POSITION');same(movement.snapshot,prior.snapshot,'B_COMP_SNAPSHOT');same(movement.base_quantity,prior.base_quantity,'B_COMP_QUANTITY');
      same(movement.direction,'in','B_COMP_DIRECTION');same(movement.reason_code,'technical_compensation','B_COMP_REASON');
      same(decimal(movement.after,{signed:true}),decimal(movement.before,{signed:true})+decimal(prior.base_quantity,{positive:true}),'B_COMP_BALANCE');
    }
    same(payload.preserved_reconciliations,original.result.payload.differences.map(x=>x.reconciliation_id),'B_COMP_RECONCILIATION');
    same(s.events.length,1,'B_COMP_EVENT_COUNT');same(s.events[0].event_type,'inventory.sale-stock.compensated.v1','B_COMP_EVENT');same(s.events[0].payload,payload,'B_COMP_EVENT_PAYLOAD');same(s.events[0].aggregate_id,payload.compensation_operation_id,'B_COMP_AGGREGATE');
  }
  return {runtime_demonstrated:false};
}
