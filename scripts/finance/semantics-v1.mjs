import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Synthetic contract oracles, never payment runtime or signature verification.
export function cents(value,{positive=false}={}) {
 assert(typeof value==='string'&&/^(?:0|[1-9][0-9]{0,37})\.[0-9]{2}$/u.test(value),'C_MONEY_FORMAT');
 const n=BigInt(value.replace('.',''));assert(!positive||n>0n,'C_MONEY_POSITIVE');return n;
}
export function money(n){assert(n>=0n&&n<10n**40n,'C_MONEY_RANGE');return n/100n+'.'+(n%100n).toString().padStart(2,'0');}
export function validateAmounts(a){assert.equal(a.currency,'ARS','C_CURRENCY');assert.equal(a.method,'cash','C_METHOD');const total=cents(a.commercial_total,{positive:true}),applied=cents(a.applied,{positive:true}),received=cents(a.received,{positive:true});assert.equal(applied,total,'C_APPLIED_TOTAL');assert(received>=applied,'C_RECEIVED');assert.equal(cents(a.change),received-applied,'C_CHANGE');return applied;}
export function canonicalJSON(v){if(v===null||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'){assert(Number.isSafeInteger(v),'C_JCS_NUMBER');return JSON.stringify(v);}if(typeof v==='string'){assert(v.isWellFormed(),'C_JCS_UNICODE');return JSON.stringify(v);}if(Array.isArray(v))return '['+v.map(canonicalJSON).join(',')+']';assert(v&&Object.getPrototypeOf(v)===Object.prototype,'C_JCS_OBJECT');return '{'+Object.keys(v).sort().map(k=>canonicalJSON(k)+':'+canonicalJSON(v[k])).join(',')+'}';}
export const fingerprint=v=>createHash('sha256').update(canonicalJSON(v),'utf8').digest('hex');
export function requestHash(r){assert.deepEqual(Object.keys(r).sort(),['body','canonicalization_version','idempotency_key','method','operation_id','path','query'],'C_CANONICAL_FIELDS');assert.equal(r.canonicalization_version,'finance-request-v1','C_CANONICAL_VERSION');assert.equal(r.idempotency_key,r.body?.operation_id??null,'C_HTTP_KEY');const n=structuredClone(r);if(n.body?.opening_float!==undefined)n.body.opening_float=money(cents(n.body.opening_float));if(n.body?.name!==undefined){assert(n.body.name===n.body.name.trim()&&!/[\x00-\x1f\x7f]/u.test(n.body.name),'C_NAME');n.body.name=n.body.name.normalize('NFC');}return fingerprint(n);}
export function budget(d,sent,now){assert(Number.isFinite(sent)&&Number.isFinite(now)&&now>=sent,'C_CLOCK');assert(Number.isSafeInteger(d.valid_for_ms)&&d.valid_for_ms>0&&d.valid_for_ms<=2000,'C_BUDGET');assert(now-sent<d.valid_for_ms,'C_AUTHORITY_EXPIRED');assert.equal(d.authorized,true,'C_AUTHORITY_DENIED');}
export function validateHuman({request:r,decision:d,check:c},permissions){
 budget(d,c.sent_at_ms,c.now_ms);const op=permissions.find(x=>x.operation_id===r.operation_id);assert(op,'C_HUMAN_OPERATION');assert.equal(op.method,r.method,'C_HUMAN_METHOD');assert(new RegExp('^'+op.path.replace(/\{[^}]+\}/gu,'[0-9a-f-]{36}')+'$','u').test(r.path),'C_HUMAN_PATH');
 const keys=r.operation_id==='listCashRegisters'?['pos_id','cursor','limit']:r.operation_id==='readFinanceHistoryFacts'?['cursor','limit']:[];for(const k of Object.keys(r.query))assert(keys.includes(k),'C_HUMAN_QUERY');if(r.operation_id==='listCashRegisters')assert(typeof r.query.pos_id==='string'&&r.query.pos_id.length>0,'C_HUMAN_POS_QUERY');
 assert.equal(d.canonicalization_version,'finance-request-v1','C_CANONICAL_VERSION');
 assert.equal(d.operation_id,r.operation_id,'C_HUMAN_OPERATION');
 assert.equal(d.request_hash,requestHash(r),'C_HUMAN_HASH');assert.equal(d.permission,op.permission,'C_PERMISSION');
 for(const k of ['organization_id','account_ref','membership_ref','device_ref'])assert.equal(d[k],c[k],'C_HUMAN_'+k);
 assert.equal(d.scope.organization_id,c.organization_id,'C_HUMAN_SCOPE');
 if(r.body?.organization_id)assert.equal(r.body.organization_id,c.organization_id,'C_BODY_TENANT');
 for(const [scope,key] of [['branch_ids','branch_id'],['pos_ids','pos_id']]){
  if(c[key])assert(d.scope[scope].includes(c[key]),'C_HUMAN_SCOPE');
  if(r.body&&Object.hasOwn(r.body,key)){
   assert(typeof c[key]==='string'&&c[key].length>0,'C_EFFECTIVE_CONTEXT');
   assert.equal(r.body[key],c[key],'C_REQUEST_CONTEXT_'+key);
   assert(d.scope[scope].includes(r.body[key]),'C_REQUEST_SCOPE_'+key);
  }
 }
 if(r.query.pos_id){assert.equal(r.query.pos_id,c.pos_id,'C_QUERY_POS_CONTEXT');assert(d.scope.pos_ids.includes(r.query.pos_id),'C_HUMAN_SCOPE');}
 for(const k of Object.keys(d.versions))assert.equal(d.versions[k],c.current_versions[k],'C_CURRENT_VERSION');
 if(op.step_up){const age=Date.parse(c.at)-Date.parse(d.step_up_at);assert(Number.isFinite(age)&&age>=0&&age<=900000,'C_STEP_UP');}
 return {runtime_demonstrated:false};
}
export function validateStep(command,q,d,c){
 budget(d,c.sent_at_ms,c.now_ms);assert.equal(command.command_type,'finance.record-sale-cash.v1','C_COMMAND_TYPE');assert.equal(command.producer,'sales-pos','C_PRODUCER');assert.equal(command.target,'finance','C_TARGET');assert.equal(command.organization_id,command.payload.context.organization_id,'C_COMMAND_TENANT');assert.equal(command.correlation_id,command.payload.context.process_id,'C_CORRELATION');for(const k of ['organization_id','operation_id','process_id','process_version'])assert.equal(q[k],command.payload.context[k],'C_QUERY_'+k);assert.equal(q.step_id,command.payload.step_id,'C_STEP_ID');assert.equal(q.command_id,command.command_id,'C_COMMAND_ID');assert.equal(q.step,command.command_type,'C_STEP_TYPE');assert.equal(q.target,'finance','C_TARGET');assert.equal(q.command_fingerprint,fingerprint(command),'C_FINGERPRINT');for(const k of Object.keys(q))assert.deepEqual(d[k],q[k],'C_DECISION_BINDING');assert.equal(d.caller,'finance','C_CALLER');assert.equal(d.audience,'sales-pos.process-authority','C_AUDIENCE');assert.deepEqual(d.stock,command.payload.stock,'C_STOCK_BINDING');assert.equal(d.stock.status,'succeeded','C_STOCK_UNKNOWN');assert(['posted','not_required'].includes(d.stock.stock_status),'C_STOCK_STATUS');assert.equal(d.stock.operation_id,command.payload.context.operation_id,'C_STOCK_OPERATION');assert.equal(d.authorized_responsible.cash_shift_id,command.payload.context.cash_shift_id,'C_SHIFT_BINDING');
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function validateEvent(e){
 assert(Buffer.byteLength(JSON.stringify(e))<=131072,'C_MESSAGE_SIZE');assert.equal(e.producer,'finance','C_EVENT_PRODUCER');assert.equal(e.schema_version,1,'C_EVENT_VERSION');for(const k of ['event_id','aggregate_id','causation_id','correlation_id','organization_id','branch_id','pos_id'])assert(typeof e[k]==='string'&&uuid.test(e[k]),'C_EVENT_ID');const p=e.payload,c=p.context??p;for(const k of ['organization_id','branch_id','pos_id'])assert.equal(e[k],c[k],'C_EVENT_CONTEXT');const choice={'finance.cash-shift.opened.v1':['cash_shift','cash_shift_id','opened_at'],'finance.cash-movement.recorded.v1':['cash_movement','movement_id','recorded_at'],'finance.sale-payment.recorded.v2':['sale_payment','payment_id','recorded_at']}[e.event_type];assert(choice,'C_EVENT_TYPE');assert.equal(e.aggregate_type,choice[0],'C_EVENT_AGGREGATE');assert.equal(e.aggregate_id,p[choice[1]],'C_EVENT_AGGREGATE');assert.equal(e.aggregate_version,1,'C_EVENT_AGGREGATE_VERSION');assert.equal(e.occurred_at,p[choice[2]],'C_EVENT_TIME');if(p.context){validateAmounts(p.amounts);assert.equal(e.correlation_id,p.context.process_id,'C_EVENT_PROCESS');assert.equal(e.causation_id,p.command_id,'C_EVENT_CAUSE');}
}
export function validateOpening({request:r,shift:s,movements:m,events:e}){
 cents(r.opening_float);assert.equal(r.currency,'ARS','C_CURRENCY');for(const k of ['organization_id','branch_id','pos_id','cash_register_id','operation_id','currency','opening_float'])assert.equal(s[k],r[k],'C_OPEN_BINDING');assert.equal(s.status,'open','C_OPEN_STATE');assert.equal(s.version,1,'C_OPEN_VERSION');const count=cents(r.opening_float)===0n?0:1;assert.equal(m.length,count,'C_OPEN_MOVEMENT_COUNT');assert.equal(e.length,count+1,'C_OPEN_EVENT_COUNT');assert.equal(s.opening_movement_id,count?m[0].movement_id:null,'C_OPEN_MOVEMENT_ID');if(count){for(const k of ['organization_id','branch_id','pos_id','cash_register_id','cash_shift_id','operation_id'])assert.equal(m[0][k],s[k],'C_OPEN_CONTEXT');assert.equal(m[0].kind,'opening_float','C_OPEN_KIND');assert.equal(m[0].amount,s.opening_float,'C_OPEN_AMOUNT');assert.equal(m[0].payment_id,null,'C_OPEN_PAYMENT');assert.equal(m[0].sale_id,null,'C_OPEN_SALE');assert.equal(m[0].shift_version,1,'C_OPEN_VERSION');assert.deepEqual(e[1].payload,m[0],'C_OPEN_FACT');}const {responsible_account_ref,responsible_membership_ref,device_ref,status,...publicShift}=s;assert.deepEqual(e[0].payload,publicShift,'C_OPEN_FACT');e.forEach(validateEvent);return {runtime_demonstrated:false};
}
export function validatePayment(s,source){
 const {command,authority_query,authority,check,before,result,movements,events,after}=s;validateStep(command,authority_query,authority,check);
 assert(source&&source.runtime_demonstrated===false&&source.lookup_complete===true&&Array.isArray(source.retained),'C_PAYMENT_SOURCE_REQUIRED');
 const c=command.payload.context;
 assert.equal(source.organization_id,c.organization_id,'C_PAYMENT_SOURCE_TENANT');
 // Synthetic retained owner identity is independent of the attempted command.
 // A domain lookup, not a new transport ID, decides whether money already moved.
 const matches=source.retained.filter(row=>row.command.command_id===command.command_id||row.command.payload.context.operation_id===c.operation_id||row.command.payload.context.sale_id===c.sale_id||row.command.payload.payment_id===command.payload.payment_id);
 assert(matches.length<=1,'C_RETAINED_IDENTITY_CONFLICT');
 if(matches.length){
  const prior=matches[0];
  assert.equal(prior.command.organization_id,c.organization_id,'C_RETAINED_TENANT');
  assert(['succeeded','failed'].includes(prior.result.status),'C_RETAINED_TERMINAL');
  validateRetainedResult({organization_id:c.organization_id,operation_id:prior.command.payload.context.operation_id,command_id:prior.command.command_id,status:prior.result.status==='succeeded'?'succeeded':'rejected',result:prior.result});
  const samePayload=fingerprint(prior.command.payload)===fingerprint(command.payload);
  if(samePayload)assert(!Object.hasOwn(s,'conflict'),'C_RETAINED_REPLAY_CONFLICT');
  else assert.deepEqual(s.conflict,{code:'finance_operation_conflict',retryable:false},'C_RETAINED_CONTENT_CONFLICT');
  // This is the retained lookup/replay observation, never a newly emitted
  // result with payment_absent after a previously confirmed payment.
  assert.deepEqual(result,prior.result,'C_RETAINED_RESULT_STABLE');
  assert.equal(movements.length,0,'C_RETAINED_DUPLICATE_MOVEMENT');assert.equal(events.length,0,'C_RETAINED_DUPLICATE_FACT');
  assert.deepEqual(after,before,'C_RETAINED_DUPLICATE_EFFECT');
  return {retained:true,conflict:!samePayload,runtime_demonstrated:false};
 }
 assert(!Object.hasOwn(s,'conflict'),'C_UNEXPECTED_PAYMENT_CONFLICT');
 assert.equal(result.command_id,command.command_id,'C_RESULT_COMMAND');assert.equal(result.correlation_id,command.correlation_id,'C_RESULT_CORRELATION');assert.equal(result.causation_id,command.command_id,'C_RESULT_CAUSE');assert.equal(result.producer,'finance','C_RESULT_PRODUCER');assert.equal(result.result_type,'finance.record-sale-cash.result.v1','C_RESULT_TYPE');assert.equal(result.schema_version,1,'C_RESULT_VERSION');assert.equal(result.retryable,false,'C_TERMINAL');
 let rejection=null;const shift=before.shift;if(!shift)rejection='finance_cash_shift_required';else if(['organization_id','branch_id','pos_id','cash_register_id','cash_shift_id'].some(k=>shift[k]!==c[k]))rejection='finance_resource_not_found';else if(shift.status!=='open')rejection='finance_cash_shift_not_open';else if(authority.authorized_responsible.account_ref!==shift.responsible_account_ref||authority.authorized_responsible.membership_ref!==shift.responsible_membership_ref||authority.authorized_responsible.device_ref!==shift.device_ref)rejection='finance_state_conflict';
 let applied;try{applied=validateAmounts(command.payload.amounts);}catch{rejection=command.payload.amounts.currency!=='ARS'?'finance_currency_unsupported':'finance_cash_amount_invalid';}
 if(rejection){assert.equal(result.status,'failed','C_REJECTION_STATUS');assert.equal(result.error_code,rejection,'C_REJECTION_CODE');assert.deepEqual(result.payload,{context:c,payment_id:command.payload.payment_id,payment_absent:true},'C_REJECTION_PAYLOAD');assert.equal(movements.length,0,'C_REJECTION_MOVEMENT');assert.equal(events.length,0,'C_REJECTION_FACT');assert.deepEqual(after,before,'C_REJECTION_EFFECT');}
 else{assert.equal(result.status,'succeeded','C_SUCCESS');assert(!Object.hasOwn(result,'error_code'),'C_SUCCESS_ERROR');const p=result.payload;assert.deepEqual(p.context,c,'C_PAYMENT_CONTEXT');assert.equal(p.payment_id,command.payload.payment_id,'C_PAYMENT_ID');assert.equal(p.command_id,command.command_id,'C_PAYMENT_COMMAND');assert.equal(p.result_id,result.result_id,'C_PAYMENT_RESULT');assert.equal(p.recorded_at,result.occurred_at,'C_PAYMENT_TIME');assert.deepEqual(p.amounts,command.payload.amounts,'C_PAYMENT_AMOUNTS');assert.deepEqual(p.stock,command.payload.stock,'C_PAYMENT_STOCK');assert.equal(p.payment_version,1,'C_PAYMENT_VERSION');assert.equal(p.shift_version,shift.version+1,'C_SHIFT_VERSION');assert.equal(movements.length,1,'C_PAYMENT_MOVEMENT');const m=movements[0];assert.equal(m.movement_id,p.movement_id,'C_MOVEMENT_ID');assert.equal(m.kind,'sale_cash','C_MOVEMENT_KIND');assert.equal(m.direction,'in','C_MOVEMENT_DIRECTION');assert.equal(m.amount,p.amounts.applied,'C_MOVEMENT_NET');assert.equal(m.payment_id,p.payment_id,'C_MOVEMENT_PAYMENT');assert.equal(m.sale_id,c.sale_id,'C_MOVEMENT_SALE');assert.equal(m.shift_version,p.shift_version,'C_MOVEMENT_VERSION');for(const k of ['organization_id','branch_id','pos_id','cash_register_id','cash_shift_id','operation_id'])assert.equal(m[k],c[k],'C_MOVEMENT_CONTEXT');assert.equal(m.currency,'ARS','C_CURRENCY');assert.equal(m.method,'cash','C_METHOD');assert.equal(m.recorded_at,p.recorded_at,'C_MOVEMENT_TIME');assert.deepEqual(m.operating_date,p.operating_date,'C_MOVEMENT_DATE');assert.equal(cents(after.expected),cents(before.expected)+applied,'C_EXPECTED_NET');assert.deepEqual(after.shift,{...shift,version:p.shift_version},'C_SHIFT_STATE');assert.equal(events.length,2,'C_PAYMENT_FACTS');assert.deepEqual(events[0].payload,m,'C_MOVEMENT_FACT');assert.deepEqual(events[1].payload,p,'C_PAYMENT_FACT');events.forEach(validateEvent);}return {runtime_demonstrated:false};
}
export function validateRetainedResult(r){if(r.status==='pending'){assert.equal(r.result,null,'C_PENDING_RESULT');return;}assert(r.result,'C_RESULT_MISSING');assert.equal(r.status,r.result.status==='succeeded'?'succeeded':'rejected','C_RESOURCE_STATUS');assert.equal(r.command_id,r.result.command_id,'C_RESOURCE_COMMAND');assert.equal(r.organization_id,r.result.payload.context.organization_id,'C_RESOURCE_TENANT');assert.equal(r.operation_id,r.result.payload.context.operation_id,'C_RESOURCE_OPERATION');}
export function validateHistory({session:s,page:p,check:c},source,validateFact=validateEvent){
 for(const v of [p.organization_id,s.request.organization_id,c.organization_id])assert.equal(v,s.organization_id,'C_HISTORY_TENANT');assert.equal(c.account_ref,s.account_ref,'C_HISTORY_ACCOUNT');assert.equal(p.read_session_id,s.read_session_id,'C_HISTORY_SESSION');const life=Date.parse(s.expires_at)-Date.parse(s.created_at);assert(life>0&&life<=1800000,'C_HISTORY_LIFETIME');assert(Date.parse(c.at)>=Date.parse(s.created_at)&&Date.parse(c.at)<Date.parse(s.expires_at),'C_HISTORY_EXPIRED');for(const v of [p.disposition_generation,c.disposition_generation])assert.equal(v,s.disposition_generation,'C_HISTORY_GENERATION');assert.equal(p.snapshot_high_watermark,s.snapshot_high_watermark,'C_HISTORY_CUT');const from=BigInt(s.request.from_sequence),to=BigInt(s.request.to_sequence??s.snapshot_high_watermark);assert(from<=to&&to<=BigInt(s.snapshot_high_watermark),'C_HISTORY_RANGE');assert.deepEqual(p.requested_range,{from_sequence:String(from),to_sequence:String(to)},'C_HISTORY_RANGE');assert.equal(p.page.limit,s.request.limit,'C_HISTORY_LIMIT');assert(p.items.length<=p.page.limit&&p.page.limit<=100,'C_HISTORY_LIMIT');assert.equal(p.page.has_more,p.page.next_cursor!==null,'C_HISTORY_CURSOR');assert(Buffer.byteLength(JSON.stringify(p))<=1048576,'C_HISTORY_SIZE');assert.deepEqual(p.families.map(x=>x.event_type).sort(),[...s.request.families].sort(),'C_HISTORY_FAMILIES');for(const f of p.families)assert.equal(f.schema_version,1,'C_HISTORY_VERSION');
 const ids=new Set();let last=BigInt(c.last_sequence);for(const i of p.items){const n=BigInt(i.history_sequence);assert(n>last&&n>=from&&n<=to,'C_HISTORY_ORDER');last=n;assert(s.request.families.includes(i.event_type)&&i.schema_version===1,'C_HISTORY_VERSION');assert(Buffer.byteLength(i.original_json)<=131072,'C_HISTORY_FACT_SIZE');assert.equal(createHash('sha256').update(i.original_json,'utf8').digest('hex'),i.serialized_sha256,'C_HISTORY_HASH');const f=JSON.parse(i.original_json);validateFact(f);assert.equal(f.organization_id,s.organization_id,'C_HISTORY_FACT_TENANT');assert.equal(f.event_id,i.event_id,'C_HISTORY_FACT_ID');assert.equal(f.event_type,i.event_type,'C_HISTORY_FACT_TYPE');assert.equal(f.schema_version,i.schema_version,'C_HISTORY_VERSION');assert(!ids.has(i.event_id),'C_HISTORY_DUPLICATE');ids.add(i.event_id);}
 let lastMissing=from-1n;for(const r of p.missing_ranges){const a=BigInt(r.from_sequence),b=BigInt(r.to_sequence);assert(a>=from&&b<=to&&a<=b&&a>lastMissing,'C_HISTORY_GAP');assert(!p.items.some(i=>BigInt(i.history_sequence)>=a&&BigInt(i.history_sequence)<=b),'C_HISTORY_GAP_OVERLAP');lastMissing=b;}
 assert(['complete_for_requested_range','partial','unverifiable'].includes(p.coverage),'C_HISTORY_COVERAGE');
 if(p.coverage==='complete_for_requested_range')assert.equal(p.missing_ranges.length,0,'C_HISTORY_FALSE_COMPLETE');
 // Independent synthetic owner-state input, never inferred from the response.
 // The future SQL producer must prove its actual retained cut and disposition;
 // these contract vectors do not authenticate the source or implement a reader.
 assert(source&&source.runtime_demonstrated===false&&Array.isArray(source.facts),'C_HISTORY_SOURCE_REQUIRED');
 assert.equal(source.organization_id,s.organization_id,'C_HISTORY_SOURCE_TENANT');
 assert.equal(source.snapshot_high_watermark,s.snapshot_high_watermark,'C_HISTORY_SOURCE_CUT');
 assert.equal(source.disposition_generation,s.disposition_generation,'C_HISTORY_SOURCE_GENERATION');
 assert.equal(p.data_as_of,source.data_as_of,'C_HISTORY_SOURCE_TIME');
 assert.deepEqual(p.available_range,source.available_range,'C_HISTORY_SOURCE_RANGE');
 const selected=new Set(s.request.families);
 for(const family of selected)assert(source.families.includes(family),'C_HISTORY_SOURCE_FAMILY');
 const expectedMissing=source.missing_ranges.filter(r=>r.families.some(f=>selected.has(f)))
  .filter(r=>BigInt(r.from_sequence)<=to&&BigInt(r.to_sequence)>=from)
  .map(r=>({from_sequence:String(BigInt(r.from_sequence)>from?BigInt(r.from_sequence):from),to_sequence:String(BigInt(r.to_sequence)<to?BigInt(r.to_sequence):to)}));
 assert.deepEqual(p.missing_ranges,expectedMissing,'C_HISTORY_SOURCE_MISSING');
 const available=source.available_range;
 const fullyAvailable=available!==null&&BigInt(available.from_sequence)<=from&&BigInt(available.to_sequence)>=to;
 const coverage=!source.verifiable?'unverifiable':fullyAvailable&&expectedMissing.length===0?'complete_for_requested_range':'partial';
 assert.equal(p.coverage,coverage,'C_HISTORY_SOURCE_COVERAGE');
 const remaining=source.facts.filter(i=>selected.has(i.event_type)&&BigInt(i.history_sequence)>=from&&BigInt(i.history_sequence)<=to&&BigInt(i.history_sequence)>BigInt(c.last_sequence));
 const metadata=i=>({history_sequence:i.history_sequence,event_id:i.event_id,event_type:i.event_type,schema_version:i.schema_version,serialized_sha256:i.serialized_sha256});
 assert.deepEqual(p.items.map(metadata),remaining.slice(0,p.items.length).map(metadata),'C_HISTORY_SOURCE_FACTS');
 assert.equal(p.page.has_more,p.items.length<remaining.length,'C_HISTORY_SOURCE_TERMINATION');
 assert(!p.page.has_more||p.items.length>0,'C_HISTORY_SOURCE_PROGRESS');
 return {facts:p.items.length,coverage:p.coverage,runtime_demonstrated:false};
}
