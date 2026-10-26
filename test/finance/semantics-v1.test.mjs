import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {read,root} from '../../scripts/finance/schema-v1.mjs';
import {cents,money,validateAmounts,validateOpening,validatePayment as validatePaymentAgainstSource,validateHuman,validateStep,validateHistory as validateHistoryAgainstSource,validateRetainedResult,fingerprint,requestHash,budget,canonicalJSON,validateEvent} from '../../scripts/finance/semantics-v1.mjs';
const sample=()=>read('finance/fixtures/cash/v1/normal.json');
const human=()=>read('identity/fixtures/finance-authority/v1/human.json');
const permissions=read('identity/http/shared/v1/identity-finance-authority-policy-v1.json').permissions;
const history=()=>read('finance/fixtures/history/v1/complete.json');
const historySources=read('finance/fixtures/history/v1/retained-source.json');
const validateHistory=(sample,source=historySources.complete)=>validateHistoryAgainstSource(sample,source);
const paymentSources=read('finance/fixtures/reliability/v1/retained-payments.json');
const validatePayment=(sample,source=paymentSources.empty)=>validatePaymentAgainstSource(sample,source);
for(const file of fs.readdirSync(path.join(root,'finance/fixtures/cash/v1')))test('cash outcome is internally consistent: '+file,()=>assert.equal(validatePayment(read('finance/fixtures/cash/v1/'+file)).runtime_demonstrated,false));
for(const name of ['zero','positive'])test('opening funds and events: '+name,()=>validateOpening(read('finance/fixtures/opening/v1/'+name+'.json')));
const vectors=read('finance/fixtures/vectors/v1/money.json');
for(const [i,v] of vectors.valid.entries())test('exact cash vector '+i,()=>assert.equal(money(validateAmounts(v.amounts)),v.net));
for(const [i,v] of vectors.invalid.entries())test('reject invalid money input '+i,()=>assert.throws(()=>cents(v),/C_MONEY_FORMAT/));
for(const [name,edit,error] of [
 ['applied different from total',s=>{s.command.payload.amounts.applied='75.24';s.authority_query.command_fingerprint=fingerprint(s.command);s.authority.command_fingerprint=s.authority_query.command_fingerprint;},/C_REJECTION_STATUS/],
 ['received/change cannot enter ledger',s=>s.movements[0].amount='100.00',/C_MOVEMENT_NET/],
 ['double cash movement',s=>s.movements.push(structuredClone(s.movements[0])),/C_PAYMENT_MOVEMENT/],
 ['wrong expected',s=>s.after.expected='200.00',/C_EXPECTED_NET/],
 ['lost version',s=>s.result.payload.shift_version=4,/C_SHIFT_VERSION/],
 ['missing result command',s=>s.result.command_id='synthetic',/C_RESULT_COMMAND/],
 ['new result identity in payload',s=>s.result.payload.result_id='synthetic',/C_PAYMENT_RESULT/],
 ['wrong result causal ID',s=>s.result.causation_id='synthetic',/C_RESULT_CAUSE/],
 ['wrong tenant in movement',s=>s.movements[0].organization_id='synthetic',/C_MOVEMENT_CONTEXT/],
 ['wrong aggregate',s=>s.events[1].aggregate_id=s.events[0].aggregate_id,/C_EVENT_AGGREGATE/],
 ['shift switching',s=>s.command.payload.context.cash_shift_id='synthetic',/C_FINGERPRINT|C_SHIFT_BINDING/],
 ['wrong step',s=>s.authority_query.step_id='synthetic',/C_STEP_ID/],
 ['wrong command fingerprint',s=>s.authority_query.command_fingerprint='0'.repeat(64),/C_FINGERPRINT/],
 ['permission from free caller',s=>s.authority.caller='gateway-bff',/C_CALLER/],
 ['wrong workload audience',s=>s.authority.audience='inventory.user-api',/C_AUDIENCE/],
 ['authority stale after lock',s=>s.check.now_ms=3000,/C_AUTHORITY_EXPIRED/],
 ['unknown is not succeeded',s=>s.authority.stock.status='unknown',/C_STOCK_BINDING|C_STOCK_UNKNOWN/],
 ['wrong responsible',s=>s.authority.authorized_responsible.account_ref='another',/C_REJECTION_STATUS/],
 ['missing original step',s=>delete s.command.payload.step_id,/C_STEP_ID/],
 ['wrong correlation',s=>s.result.correlation_id='synthetic',/C_RESULT_CORRELATION/],
 ['wrong fact cause',s=>s.events[1].causation_id=s.events[1].event_id,/C_EVENT_CAUSE/],
 ['wrong fact timestamp',s=>s.events[1].occurred_at='2026-10-25T00:00:00Z',/C_EVENT_TIME/],
 ['unknown fact revision',s=>s.events[0].schema_version=2,/C_EVENT_VERSION/]
])test('reject cash inconsistency: '+name,()=>{const s=sample();edit(s);assert.throws(()=>validatePayment(s),error);});
test('terminal rejection never fabricates a movement',()=>{const s=read('finance/fixtures/cash/v1/closed_shift.json');s.movements.push(sample().movements[0]);assert.throws(()=>validatePayment(s),/C_REJECTION_MOVEMENT/);});
test('technical fault cannot masquerade as deterministic terminal rejection',()=>{const s=read('finance/fixtures/cash/v1/closed_shift.json');s.result.error_code='platform_dependency_unavailable';assert.throws(()=>validatePayment(s),/C_REJECTION_CODE/);});
test('zero opening cannot create a fictitious monetary movement',()=>{const s=read('finance/fixtures/opening/v1/zero.json');s.movements.push(sample().movements[0]);assert.throws(()=>validateOpening(s),/C_OPEN_MOVEMENT_COUNT/);});
test('opening replay preserves shift, funds and original facts',()=>{const s=read('finance/fixtures/reliability/v1/results.json');assert.deepEqual(s.opening_replay,read('finance/fixtures/opening/v1/positive.json'));validateOpening(s.opening_replay);});
test('lost response and rejection replay preserve original terminal IDs',()=>{const r=read('finance/fixtures/reliability/v1/results.json');assert.deepEqual(r.lost_response_replay,r.paid);assert.deepEqual(r.terminal_rejection_replay,r.failed);for(const key of ['pending','paid','failed','lost_response_replay','terminal_rejection_replay'])validateRetainedResult(r[key]);});
test('another command ID recovers the retained result with no second monetary effect',()=>{const s=read('finance/fixtures/reliability/v1/identity-scenarios.json').new_command;assert.deepEqual(s.command,read('finance/fixtures/reliability/v1/results.json').same_semantic_new_command);assert.equal(validatePayment(s,paymentSources.paid).retained,true);});
test('exact command replay retains all original terminal IDs without effects',()=>validatePayment(read('finance/fixtures/reliability/v1/identity-scenarios.json').replay,paymentSources.paid));
test('rejected attempt stays rejected even after shift becomes usable',()=>validatePayment(read('finance/fixtures/reliability/v1/identity-scenarios.json').rejection_replay,paymentSources.rejected));
test('changed semantic content is a conflict and preserves the original payment result',()=>{const s=read('finance/fixtures/reliability/v1/identity-scenarios.json').changed_content;assert.deepEqual(s.command,read('finance/fixtures/reliability/v1/results.json').changed_semantic_content);assert.equal(validatePayment(s,paymentSources.paid).conflict,true);});
test('payment identity prevents recharging from another operation and sale',()=>validatePayment(read('finance/fixtures/reliability/v1/identity-scenarios.json').reused_payment,paymentSources.paid));
test('the oracle requires an independently completed identity lookup',()=>assert.throws(()=>validatePaymentAgainstSource(sample()),/C_PAYMENT_SOURCE_REQUIRED/));
test('a second coherent payment with retained payment_id is rejected',()=>{const s=sample();s.before=s.after;s.after=structuredClone(s.after);s.after.expected='250.50';s.after.shift.version++;s.command.command_id='019a1a10-0000-7000-8000-000000000080';s.authority_query.command_id=s.command.command_id;s.authority_query.command_fingerprint=fingerprint(s.command);Object.assign(s.authority,s.authority_query);assert.throws(()=>validatePayment(s,paymentSources.paid),/C_RETAINED_DUPLICATE_MOVEMENT/);});
for(const [name,edit,error] of [
 ['movement',s=>s.movements.push(sample().movements[0]),/C_RETAINED_DUPLICATE_MOVEMENT/],
 ['event',s=>s.events.push(sample().events[0]),/C_RETAINED_DUPLICATE_FACT/],
 ['expected',s=>s.after.expected='250.50',/C_RETAINED_DUPLICATE_EFFECT/],
 ['result',s=>s.result.result_id='019a1a10-0000-7000-8000-000000000099',/C_RETAINED_RESULT_STABLE/]
])test('retained replay rejects changed '+name,()=>{const s=read('finance/fixtures/reliability/v1/identity-scenarios.json').new_command;edit(s);assert.throws(()=>validatePayment(s,paymentSources.paid),error);});
test('changed content cannot silently pass as a replay',()=>{const s=read('finance/fixtures/reliability/v1/identity-scenarios.json').changed_content;delete s.conflict;assert.throws(()=>validatePayment(s,paymentSources.paid),/C_RETAINED_CONTENT_CONFLICT/);});
for(const [name,edit] of [['pending with result',r=>{r.status='pending';}],['wrong retained tenant',r=>{r.organization_id='other';}],['wrong retained operation',r=>{r.operation_id='other';}],['wrong retained command',r=>{r.command_id='other';}],['rejected with paid result',r=>{r.status='rejected';}]])test('retained result rejects '+name,()=>{const r=read('finance/fixtures/reliability/v1/results.json').paid;edit(r);assert.throws(()=>validateRetainedResult(r),/C_/);});
for(const name of ['human','history'])test('current human permission and binding '+name,()=>validateHuman(read('identity/fixtures/finance-authority/v1/'+name+'.json'),permissions));
for(const [name,edit,error] of [
 ['tenant',s=>s.check.organization_id='other',/C_HUMAN_organization_id/],['scope',s=>s.decision.scope.branch_ids=[],/C_HUMAN_SCOPE/],['permission',s=>s.decision.permission='finance.cash.read',/C_PERMISSION/],['hash',s=>s.decision.request_hash='0'.repeat(64),/C_HUMAN_HASH/],['profile',s=>s.request.canonicalization_version='finance-request-v2',/C_CANONICAL_VERSION/],['current membership',s=>s.check.current_versions.membership='other',/C_CURRENT_VERSION/],['revoked session',s=>s.check.current_versions.session='revoked',/C_CURRENT_VERSION/],['unapproved device',s=>s.check.current_versions.approval='revoked',/C_CURRENT_VERSION/],['stale after network',s=>s.check.now_ms=3000,/C_AUTHORITY_EXPIRED/],['unknown query',s=>s.request.query.permission='all',/C_HUMAN_QUERY/],['free role',s=>s.request.role='OWNER',/C_CANONICAL_FIELDS/],['wrong method',s=>s.request.method='GET',/C_HUMAN_METHOD/],['wrong path',s=>s.request.path+='/other',/C_HUMAN_PATH/],['new idempotency key',s=>s.request.idempotency_key='synthetic',/C_HTTP_KEY/]
])test('human authority rejects '+name,()=>{const s=human();edit(s);assert.throws(()=>validateHuman(s,permissions),error);});
for(const key of ['branch_id','pos_id'])test('human request rejects foreign '+key+' even with valid request hash',()=>{const s=human();s.request.body[key]='foreign-resource';s.decision.request_hash=requestHash(s.request);assert.throws(()=>validateHuman(s,permissions),new RegExp('C_REQUEST_CONTEXT_'+key));});
test('human request cannot switch to another scoped resource silently',()=>{const s=human();s.decision.scope.branch_ids.push('another-allowed-branch');s.request.body.branch_id='another-allowed-branch';s.decision.request_hash=requestHash(s.request);assert.throws(()=>validateHuman(s,permissions),/C_REQUEST_CONTEXT_branch_id/);});
test('requested resource needs an effective owner context as well as a permission',()=>{const s=human();delete s.check.branch_id;assert.throws(()=>validateHuman(s,permissions),/C_EFFECTIVE_CONTEXT/);});
test('another authorized context works when request and effective resources agree',()=>{const s=human();for(const [key,scope] of [['branch_id','branch_ids'],['pos_id','pos_ids']]){s.request.body[key]='another-'+key;s.check[key]=s.request.body[key];s.decision.scope[scope].push(s.request.body[key]);}s.decision.request_hash=requestHash(s.request);validateHuman(s,permissions);});
test('expired history step-up is not ordinary permission',()=>{const s=read('identity/fixtures/finance-authority/v1/history.json');s.decision.step_up_at='2026-10-26T19:44:59Z';assert.throws(()=>validateHuman(s,permissions),/C_STEP_UP/);});
test('JCS order and NFC equivalence, without floats or implicit defaults',()=>{assert.equal(fingerprint({b:2,a:1}),fingerprint({a:1,b:2}));const a=human().request,b=structuredClone(a);b.body.name='Cafe\u0301';a.body.name='Caf\u00e9';assert.equal(requestHash(a),requestHash(b));assert.throws(()=>canonicalJSON({money:1.25}),/C_JCS_NUMBER/);assert.throws(()=>canonicalJSON('\ud800'),/C_JCS_UNICODE/);assert.throws(()=>budget({authorized:true,valid_for_ms:2001},0,1),/C_BUDGET/);});
for(const name of ['complete','partial','first_page','last_page'])test('retained history '+name,()=>validateHistory(read('finance/fixtures/history/v1/'+name+'.json'),historySources[name==='partial'?'partial':'complete']));
test('reconstruction sums retained ledger only; opening and payment facts do not double funds',()=>{const s=history();validateHistory(s);const ledger=s.page.items.map(x=>JSON.parse(x.original_json)).filter(x=>x.event_type==='finance.cash-movement.recorded.v1');assert.equal(money(ledger.reduce((sum,x)=>sum+cents(x.payload.amount),0n)),s.ledger_expected);});
test('two pages preserve one cut and continue after last committed sequence',()=>{const a=read('finance/fixtures/history/v1/first_page.json'),b=read('finance/fixtures/history/v1/last_page.json');validateHistory(a);validateHistory(b);assert.equal(a.page.snapshot_high_watermark,b.page.snapshot_high_watermark);assert.equal(a.page.items.at(-1).history_sequence,b.check.last_sequence);assert.equal(new Set([...a.page.items,...b.page.items].map(x=>x.event_id)).size,history().page.items.length);});
for(const [name,edit,error] of [
 ['tenant',s=>s.page.organization_id='other',/C_HISTORY_TENANT/],['account',s=>s.check.account_ref='other',/C_HISTORY_ACCOUNT/],['expired session',s=>s.check.at=s.session.expires_at,/C_HISTORY_EXPIRED/],['extended session',s=>s.session.expires_at='2026-10-27T20:00:00Z',/C_HISTORY_LIFETIME/],['changed disposition generation',s=>s.check.disposition_generation='1',/C_HISTORY_GENERATION/],['different snapshot',s=>s.page.snapshot_high_watermark='5',/C_HISTORY_CUT/],['reversed sequence',s=>s.page.items.reverse(),/C_HISTORY_ORDER/],['modified original',s=>s.page.items[0].original_json+=' ',/C_HISTORY_HASH/],['unknown revision',s=>s.page.items[0].schema_version=2,/C_HISTORY_VERSION/],['false complete',s=>{s.page.items.splice(1,1);s.page.missing_ranges=[{from_sequence:'2',to_sequence:'2'}];},/C_HISTORY_FALSE_COMPLETE/],['overlap gap',s=>s.page.missing_ranges=[{from_sequence:'1',to_sequence:'1'}],/C_HISTORY_GAP_OVERLAP/],['wrong limit',s=>s.page.page.limit=100,/C_HISTORY_LIMIT/],['invalid cursor relation',s=>s.page.page.has_more=true,/C_HISTORY_CURSOR/],['unrequested fact family',s=>s.page.items[0].event_type='finance.unknown.v1',/C_HISTORY_VERSION/],['wrong event ID',s=>s.page.items[0].event_id=s.page.items[1].event_id,/C_HISTORY_FACT_ID/]
])test('history rejects '+name,()=>{const s=history();edit(s);assert.throws(()=>validateHistory(s),error);});
test('a modified retained financial fact is rejected even with updated checksum',()=>{const s=history(),i=s.page.items.at(-1),f=JSON.parse(i.original_json);f.payload.amounts.change='24.74';i.original_json=JSON.stringify(f);i.serialized_sha256=createHash('sha256').update(i.original_json).digest('hex');assert.throws(()=>validateHistory(s),/C_CHANGE/);});

test('history requires independent retained source evidence',()=>assert.throws(()=>validateHistoryAgainstSource(history()),/C_HISTORY_SOURCE_REQUIRED/));
test('undeclared omission cannot claim complete history',()=>{const s=history();s.page.items.splice(1,1);assert.throws(()=>validateHistory(s),/C_HISTORY_SOURCE_FACTS/);});
test('empty available range cannot claim complete coverage',()=>{const s=history();s.page.available_range=null;assert.throws(()=>validateHistory(s),/C_HISTORY_SOURCE_RANGE/);});
test('an available interval incompatible with the cut is rejected',()=>{const s=history();s.page.available_range.from_sequence='3';assert.throws(()=>validateHistory(s),/C_HISTORY_SOURCE_RANGE/);});
test('early terminal page cannot hide remaining retained facts',()=>{const s=read('finance/fixtures/history/v1/first_page.json');s.page.page.has_more=false;s.page.page.next_cursor=null;assert.throws(()=>validateHistory(s),/C_HISTORY_SOURCE_TERMINATION/);});
test('false continuation after the cut is exhausted is rejected',()=>{const s=history();s.page.page.has_more=true;s.page.page.next_cursor='synthetic-cursor';assert.throws(()=>validateHistory(s),/C_HISTORY_SOURCE_TERMINATION/);});
test('family filtering permits legitimate sequence gaps without declaring missing data',()=>{const s=history();s.session.request.families=['finance.cash-movement.recorded.v1'];s.page.families=s.page.families.filter(x=>s.session.request.families.includes(x.event_type));s.page.items=s.page.items.filter(x=>s.session.request.families.includes(x.event_type));assert.equal(validateHistory(s).coverage,'complete_for_requested_range');assert.deepEqual(s.page.items.map(x=>x.history_sequence),['2','3']);});
test('disposition of an unselected family does not fabricate a missing selected fact',()=>{const s=read('finance/fixtures/history/v1/partial.json');s.session.request.families=['finance.sale-payment.recorded.v2'];s.page.families=s.page.families.filter(x=>s.session.request.families.includes(x.event_type));s.page.items=s.page.items.filter(x=>s.session.request.families.includes(x.event_type));s.page.missing_ranges=[];s.page.coverage='complete_for_requested_range';validateHistory(s,historySources.partial);});
test('changed movement bytes cannot pass solely by recomputing its checksum',()=>{const s=history(),item=s.page.items[1],fact=JSON.parse(item.original_json);fact.payload.amount='99.00';item.original_json=JSON.stringify(fact);item.serialized_sha256=createHash('sha256').update(item.original_json).digest('hex');assert.throws(()=>validateHistory(s),/C_HISTORY_SOURCE_FACTS/);});
test('pagination cannot skip a retained matching fact between checkpoints',()=>{const s=read('finance/fixtures/history/v1/last_page.json');s.page.items.shift();assert.throws(()=>validateHistory(s),/C_HISTORY_SOURCE_FACTS/);});
test('unrepresentable opaque IDs never get coerced into UUID event envelope',()=>{const e=sample().events[0];e.branch_id='opaque-branch';assert.throws(()=>validateEvent(e),/C_EVENT_ID/);});
