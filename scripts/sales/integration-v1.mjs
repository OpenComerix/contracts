import assert from 'node:assert/strict';
import {validatePostScenario, validateCompensationScenario} from '../inventory/effects-v1.mjs';
import {validatePayment, cents, validateRetainedResult} from '../finance/semantics-v1.mjs';
import {event as validateSale, fingerprint} from './semantics-v2.mjs';
import {line, amount} from './decimal-v2.mjs';

const same = (actual, expected, code) => assert.deepEqual(actual, expected, 'E_' + code);
const instant = (value, label) => {
  assert(typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value)), 'E_TIME_INVALID:' + label);
  return Date.parse(value);
};
const sameInstant = (actual, expected, code) => same(instant(actual, code), instant(expected, code), code);
export function stockEvidence(stock) {
  const p = stock.result.payload;
  return {operation_id: p.context.operation_id, result_id: stock.result.result_id,
    command_id: stock.command.command_id, status: 'succeeded', stock_status: p.stock_status,
    reconciliation_required: p.reconciliation_required};
}
export function stockProjection(stock) {
  const p = stock.result.payload;
  return {status: p.stock_status, command_id: stock.command.command_id, result_id: stock.result.result_id,
    recorded_at: p.recorded_at, movements: p.movements.map(m => ({movement_id: m.movement_id,
      movement_version: m.movement_version, line_ids: [m.line_id]})),
    reconciliation_required: p.reconciliation_required,
    reconciliations: p.differences.map(d => ({reconciliation_id: d.reconciliation_id, occurrence_id: d.occurrence_id,
      code: 'inventory_stock_difference_recorded', severity: 'action_required'}))};
}
export function paymentProjection(finance) {
  const p = finance.result.payload;
  return {status: 'paid', command_id: finance.command.command_id, result_id: finance.result.result_id,
    payment_id: p.payment_id, movement_id: p.movement_id, payment_version: p.payment_version,
    shift_version: p.shift_version, recorded_at: p.recorded_at,
    ...Object.fromEntries(['method', 'currency', 'applied', 'received', 'change'].map(key => [key, p.amounts[key]]))};
}

// This oracle checks declared synthetic observations and actual wire payloads.
// It does not execute a sale, authorize a workload or simulate atomic SQL.
export function validateConnected(s) {
  same(s.runtime_demonstrated, false, 'RUNTIME_CLAIM');
  same(Object.keys(s.capture).sort(), ['context','lines','totals','fiscal_context','captured_at','capture_id','calculation_policy_version'].sort(), 'CAPTURE_FIELDS');
  const {request: r, accepted: a, capture: c, stock, finance: f, compensation: x, completed: e} = s;
  same(a.operation_id, r.operation_id, 'ACCEPTED_OPERATION'); same(a.sale_id, r.sale_id, 'ACCEPTED_SALE');
  same(a.organization_id, r.context.organization_id, 'ACCEPTED_TENANT'); same(a.status, 'accepted', 'ACCEPTANCE');
  const acceptedAt = instant(a.accepted_at, 'accepted'), capturedAt = instant(c.captured_at, 'capture');
  assert(capturedAt <= acceptedAt, 'E_CAPTURE_AFTER_ACCEPTANCE');
  for (const key of Object.keys(c.context)) same(c.context[key], r.context[key], 'REQUEST_CONTEXT:' + key);
  same(c.capture_id, s.catalog.capture_id, 'CATALOG_CAPTURE');
  sameInstant(c.captured_at, s.catalog.captured_at, 'CATALOG_TIME');
  for (const key of ['organization_id', 'operation_id']) same(s.catalog[key], a[key], 'CATALOG_' + key);
  same(s.catalog.consistent_group, true, 'CATALOG_GROUP');
  same(c.lines.map(l => l.catalog), s.catalog.lines, 'CATALOG_ORIGINAL');
  same(c.fiscal_context, {context_status:'pending_profile', tax_snapshot_schema_version:1, reason:'profile_unavailable', fiscal_status:'pending'}, 'PENDING_PROFILE');
  same(c.calculation_policy_version, 'sales-f1-ars-1', 'CALCULATION_POLICY');
  same(r.lines.length, c.lines.length, 'REQUEST_LINES');
  let total = 0n;
  for (const [i, l] of c.lines.entries()) {
    const reference = r.lines[i].reference;
    same(l.line_id, reference.line_id, 'LINE_ID');
    same(l.physical_presence_confirmed, r.lines[i].physical_presence_confirmed, 'PRESENCE');
    same(l.quantity, reference.quantity, 'QUANTITY');
    for (const key of ['presentation_id','product_version','presentation_version','price_id','price_version','price_list_id','price_list_version'])
      same(l.catalog[key], reference[key], 'OBSERVED_' + key);
    same(l.catalog.classification.code, reference.classification_code, 'CLASSIFICATION_CODE');
    same(l.catalog.classification.version, reference.classification_version, 'CLASSIFICATION_VERSION');
    same(l.catalog.unit_price, reference.observed_unit_price, 'OBSERVED_PRICE');
    const calculated = line(l.catalog.unit_price, l.quantity, l.catalog.conversion_factor,
      {allows_fractions:l.catalog.allows_fractions, minimum:l.catalog.minimum_quantity, increment:l.catalog.quantity_increment});
    same(l.base_quantity, calculated.base_quantity, 'BASE_QUANTITY');
    same(l.commercial_total, calculated.commercial_total, 'LINE_TOTAL'); total += cents(l.commercial_total);
  }
  same(c.totals.commercial_total, amount(total), 'CAPTURE_TOTAL'); same(r.observed_total, amount(total), 'OBSERVED_TOTAL');
  const sc = stock.command.payload.context;
  for (const key of ['organization_id','operation_id','sale_id','process_id']) same(sc[key], a[key], 'STOCK_' + key);
  for (const key of ['branch_id','warehouse_id','location_id','pos_id']) same(sc[key], c.context[key], 'STOCK_CONTEXT:' + key);
  same(stock.command.correlation_id, a.process_id, 'STOCK_CORRELATION');
  same(stock.command.causation_id, a.operation_id, 'STOCK_CAUSE');
  same(stock.command.payload.lines.length, c.lines.length, 'STOCK_LINE_COUNT');
  for (const [i, l] of stock.command.payload.lines.entries()) {
    const captured = c.lines[i];
    same(l.line_id, captured.line_id, 'STOCK_LINE');same(l.quantity, captured.quantity, 'STOCK_QUANTITY');
    same(l.base_quantity, captured.base_quantity, 'STOCK_BASE');same(l.physical_presence_confirmed, captured.physical_presence_confirmed, 'STOCK_PRESENCE');
    for (const [key, value] of Object.entries(l.snapshot)) same(value, captured.catalog[key], 'STOCK_SNAPSHOT:' + key);
  }
  validatePostScenario(stock);
  const trace = ['accepted', 'stock_sent'];
  if (stock.result.status === 'failed') {
    same(f, null, 'REJECTED_STOCK_CASH'); same(x, null, 'REJECTED_STOCK_COMPENSATION');same(e, null, 'REJECTED_STOCK_COMPLETED');
    trace.push('stock_rejected');
  } else {
    assert(f, 'E_MISSING_FINANCE');
    for (const key of ['organization_id','operation_id','sale_id','process_id']) same(f.command.payload.context[key], a[key], 'FINANCE_' + key);
    for (const key of ['branch_id','pos_id','cash_register_id','cash_shift_id']) same(f.command.payload.context[key], c.context[key], 'FINANCE_CONTEXT:' + key);
    assert(f.command.payload.context.process_version > sc.process_version, 'E_PROCESS_VERSION_ORDER');
    same(f.command.causation_id, stock.result.result_id, 'CASH_CAUSE');
    same(f.command.payload.stock, stockEvidence(stock), 'FINANCE_STOCK');
    same(f.command.payload.payment_id, r.payment.payment_id, 'PAYMENT_ID');
    for (const key of ['method','currency','applied','received']) same(f.command.payload.amounts[key], r.payment[key], 'PAYMENT_' + key);
    same(f.command.payload.amounts.commercial_total, c.totals.commercial_total, 'CASH_TOTAL');
    validatePayment(f, {organization_id:a.organization_id, lookup_complete:true, retained:[], runtime_demonstrated:false});
    trace.push('stock_confirmed', 'cash_sent');
    if (f.result.status === 'failed') {
      assert(x, 'E_COMPENSATION_REQUIRED'); same(e, null, 'REJECTED_CASH_COMPLETED');
      same(f.result.payload.payment_absent, true, 'PAYMENT_ABSENT');same(f.result.retryable, false, 'TERMINAL_REJECTION');
      same(x.command.payload.finance_result_id, f.result.result_id, 'COMPENSATION_FINANCE_RESULT');
      same(x.command.causation_id, f.result.result_id, 'COMPENSATION_CAUSE');
      same(x.command.payload.original_command_id, stock.command.command_id, 'COMPENSATION_STOCK_COMMAND');
      same(x.command.payload.original_operation_id, a.operation_id, 'COMPENSATION_OPERATION');
      const compensationContext = x.command.payload.context;
      same(Object.keys(compensationContext).sort(), Object.keys(sc).sort(), 'COMPENSATION_CONTEXT_KEYS');
      for (const key of Object.keys(sc)) if (key !== 'process_version')
        same(compensationContext[key], sc[key], 'COMPENSATION_CONTEXT:' + key);
      same(x.command.correlation_id, a.process_id, 'COMPENSATION_COMMAND_PROCESS');
      same(x.result.correlation_id, a.process_id, 'COMPENSATION_RESULT_PROCESS');
      same(x.result.causation_id, x.command.command_id, 'COMPENSATION_RESULT_CAUSE');
      for (const fact of x.events) {
        for (const key of ['organization_id','branch_id','pos_id']) same(fact[key], sc[key], 'COMPENSATION_EVENT_CONTEXT:' + key);
        same(fact.correlation_id, a.process_id, 'COMPENSATION_EVENT_PROCESS');
        same(fact.causation_id, x.command.command_id, 'COMPENSATION_EVENT_CAUSE');
      }
      same(x.original, stock, 'COMPENSATION_ORIGINAL');
      assert(x.command.payload.context.process_version > f.command.payload.context.process_version, 'E_COMPENSATION_VERSION');
      validateCompensationScenario(x);
      trace.push('cash_rejected', 'compensation_sent', 'compensated');
    } else {
      same(x, null, 'PAID_COMPENSATION');assert(e, 'E_COMPLETION_REQUIRED');
      sameInstant(e.payload.accepted_at, a.accepted_at, 'COMPLETED_ACCEPTED_AT');
      sameInstant(e.payload.occurred_at, r.occurred_at, 'COMPLETED_OCCURRED_AT');
      same(e.payload.operating_date, r.operating_date, 'COMPLETED_OPERATING_DATE');
      validateSale(e);
      for (const key of ['organization_id','operation_id','sale_id','process_id']) same(e.payload[key], a[key], 'COMPLETED_' + key);
      for (const key of Object.keys(c)) same(e.payload[key], c[key], 'IMMUTABLE_CAPTURE:' + key);
      same(e.payload.stock, stockProjection(stock), 'COMPLETED_STOCK');
      same(e.payload.payment, paymentProjection(f), 'COMPLETED_PAYMENT');trace.push('cash_confirmed','completed');
    }
  }
  same(s.trace, trace.map((action, i) => ({action, version:i + 1})), 'TRACE');
  return {runtime_demonstrated:false, outcome:trace.at(-1)};
}

export function validateRecovery(original, observation) {
  const owner = observation.owner === 'inventory' ? original.stock : observation.owner === 'finance' ? original.finance : null;
  assert(owner, 'E_RECOVERY_OWNER');
  same(observation.command, owner.command, 'RECOVERY_COMMAND');
  same(observation.retained_result, owner.result, 'RECOVERY_ORIGINAL_RESULT');
  same(observation.new_movements, [], 'RECOVERY_NEW_EFFECT');same(observation.new_events, [], 'RECOVERY_NEW_FACT');
  same(observation.new_numbers, [], 'RECOVERY_NEW_NUMBER');same(observation.compensation, null, 'RECOVERY_COMPENSATION');
  same(observation.lookups.map(x => x.status), ['not_found','pending','succeeded'], 'RECOVERY_LOOKUP_ORDER');
  for (const lookup of observation.lookups) {
    same(lookup.command_id, owner.command.command_id, 'RECOVERY_LOOKUP_COMMAND');
    same(lookup.operation_id, original.accepted.operation_id, 'RECOVERY_LOOKUP_OPERATION');
    if (lookup.status !== 'succeeded') {
      same(lookup.result, null, 'RECOVERY_PREMATURE_RESULT');same(lookup.action, 'retry_same', 'UNKNOWN_IS_REJECTION');
    } else {same(lookup.result, owner.result, 'RECOVERY_RESULT');same(lookup.action, 'continue_same', 'RECOVERY_ACTION');}
  }
  if (observation.owner === 'finance') validateRetainedResult({organization_id:original.accepted.organization_id,
    operation_id:original.accepted.operation_id, command_id:owner.command.command_id, status:'succeeded', result:observation.retained_result});
  same(observation.completed, original.completed, 'RECOVERY_FINAL_SNAPSHOT');
  return {runtime_demonstrated:false};
}

export function validateCashReplay(original, replay, changed = false) {
  const source = {organization_id:original.accepted.organization_id, lookup_complete:true,
    retained:[{command:original.finance.command, result:original.finance.result}], runtime_demonstrated:false};
  const result = validatePayment(replay, source);
  same(result.conflict, changed, 'REPLAY_KIND');
  if (!changed) same(replay.command.payload, original.finance.command.payload, 'REPLAY_PAYLOAD');
  return result;
}

export {fingerprint};
