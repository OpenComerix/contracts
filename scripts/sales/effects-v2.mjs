import assert from 'node:assert/strict';import {cents,amount} from './decimal-v2.mjs';
export function validatePhysicalStock(s){
 const physical=new Set(s.lines.filter(l=>l.catalog.product_type==='STOCKED_GOOD').map(l=>l.line_id));assert(s.lines.every(l=>['STOCKED_GOOD','NON_STOCK_GOOD','SERVICE'].includes(l.catalog.product_type)),'D_PRODUCT_TYPE');
 assert.equal(s.stock.status,physical.size?'posted':'not_required','D_STOCK_PHYSICAL_REQUIRED');
 const seen=new Set(),movements=new Set();for(const m of s.stock.movements){assert(!movements.has(m.movement_id),'D_STOCK_MOVEMENT_DUPLICATE');movements.add(m.movement_id);assert(m.line_ids.length>0,'D_STOCK_EMPTY_MOVEMENT');for(const id of m.line_ids){assert(physical.has(id),'D_STOCK_FOREIGN_LINE');assert(!seen.has(id),'D_STOCK_DUPLICATE_LINE');seen.add(id);}}
 assert.deepEqual([...seen].sort(),[...physical].sort(),'D_STOCK_LINE_COVERAGE');if(!physical.size)assert(!s.stock.reconciliation_required&&s.stock.reconciliations.length===0,'D_FALSE_RECONCILIATION');
}
export function validateOperationEvidence(o){
 const knownStock=['succeeded','compensated'].includes(o.stock_step);assert.equal(o.stock!==null,knownStock,'D_STOCK_EVIDENCE');
 if(o.stock_step==='compensated'){assert.equal(o.compensation_step,'succeeded','D_COMPENSATED_WITHOUT_RESULT');assert(o.compensation?.result_id&&o.compensation?.recorded_at,'D_COMPENSATION_RESULT');}
 if(o.compensation_step==='succeeded')assert.equal(o.stock_step,'compensated','D_COMPENSATION_EFFECT');
 if(o.compensation_step==='not_requested')assert.equal(o.compensation,null,'D_UNREQUESTED_COMPENSATION');
 else{assert(o.compensation,'D_COMPENSATION_REFERENCE');assert.equal(o.compensation.status,o.compensation_step,'D_COMPENSATION_STATE');assert.equal(o.compensation.original_operation_id,o.operation_id,'D_COMPENSATION_BINDING');assert.equal(o.payment_step,'rejected','D_COMPENSATION_UNKNOWN');assert(knownStock,'D_COMPENSATION_STOCK');if(['pending','unknown'].includes(o.compensation_step))assert(o.compensation.result_id===null&&o.compensation.recorded_at===null&&o.compensation.movements.length===0,'D_PREMATURE_COMPENSATION_RESULT');else assert(o.compensation.result_id&&o.compensation.recorded_at,'D_COMPENSATION_RESULT');}
 if(o.payment_step==='succeeded'){
  assert(o.payment,'D_PAYMENT_EVIDENCE');assert.equal(o.stock_step,'succeeded','D_PAID_WITHOUT_STOCK');assert.equal(o.payment.status,'paid','D_PAYMENT_UNCONFIRMED');assert(cents(o.payment.applied)>0n&&cents(o.payment.received)>=cents(o.payment.applied),'D_PAYMENT_AMOUNT');assert.equal(o.payment.change,amount(cents(o.payment.received)-cents(o.payment.applied)),'D_CHANGE');assert.equal(o.compensation_step,'not_requested','D_PAID_COMPENSATION');
 }else assert.equal(o.payment,null,'D_UNCONFIRMED_PAYMENT_EVIDENCE');
 if(o.status==='completion_pending')assert.equal(o.payment_step,'succeeded','D_COMPLETION_WITHOUT_PAYMENT');
 if(o.status==='compensating')assert(['pending','unknown'].includes(o.compensation_step),'D_COMPENSATING_STATE');
 if(o.status==='rejected'&&o.stock_step==='rejected')assert(o.payment_step==='not_requested'&&o.compensation_step==='not_requested','D_REJECTED_STOCK_FLOW');
}
