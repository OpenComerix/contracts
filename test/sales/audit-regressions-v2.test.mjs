import test from 'node:test';import assert from 'node:assert/strict';
import {read,resolveSchema} from '../../scripts/sales/schema-v2.mjs';
import {event,operation} from '../../scripts/sales/semantics-v2.mjs';
import {included} from '../../scripts/sales/decimal-v2.mjs';
const clone=structuredClone,pending=read('sales/fixtures/completion/v2/pending.json'),states=read('sales/fixtures/process/v2/states.json');
test('HTTP Sale resolves the same complete commercial number for producer and reader',()=>{
 for(const file of ['sales/http/shared/v2/sales-types-v2.schema.json','sales/http/shared/v2/sales-consumer-types-v2.schema.json']){const s=resolveSchema(file,'/$defs/Sale'),h=resolveSchema(file,'/$defs/HttpSale');assert.deepEqual(h.properties.commercial_number,s.properties.commercial_number);const number=resolveSchema(file,'/$defs/CommercialNumber');assert(number.required.includes('series_id'));assert(number.required.includes('display_number'));}
});
test('delegated Sales description names its own audience',()=>{const d=read('sales/http/private/v2/pos-sales-internal-v2.yaml');assert(d.components.securitySchemes.delegation.description.includes('sales-pos.user-api'));assert(!JSON.stringify(d).includes('finance.user-api'));});
for(const [name,edit,error] of [
 ['stocked without effect',e=>{e.payload.stock.status='not_required';e.payload.stock.movements=[];},/D_STOCK_PHYSICAL_REQUIRED/],
 ['missing physical line',e=>e.payload.stock.movements[0].line_ids=[],/D_STOCK_EMPTY_MOVEMENT/],
 ['foreign physical line',e=>e.payload.stock.movements[0].line_ids=['019a1ad0-0000-7000-8000-000000009999'],/D_STOCK_FOREIGN_LINE/],
 ['duplicate physical line',e=>e.payload.stock.movements[0].line_ids.push(e.payload.lines[0].line_id),/D_STOCK_DUPLICATE_LINE/],
 ['duplicate movement',e=>e.payload.stock.movements.push(clone(e.payload.stock.movements[0])),/D_STOCK_MOVEMENT_DUPLICATE/]
])test('physical coverage rejects '+name,()=>{const e=clone(pending);edit(e);assert.throws(()=>event(e),error);});
for(const kind of ['SERVICE','NON_STOCK_GOOD'])test(kind+' completes without false stock movement',()=>{const e=clone(pending);e.payload.lines[0].catalog.product_type=kind;e.payload.lines[0].physical_presence_confirmed=false;e.payload.stock.status='not_required';e.payload.stock.movements=[];event(e);});
test('a second physical line cannot be omitted from posting coverage',()=>{const e=clone(pending),l=clone(e.payload.lines[0]);l.line_id='019a1ad0-0000-7000-8000-000000009998';l.catalog.line_id=l.line_id;l.catalog.unit_price='0.01';l.commercial_total='0.01';l.gross_amount='0.01';e.payload.lines.push(l);e.payload.totals.gross='75.26';e.payload.totals.commercial_total='75.26';e.payload.payment.applied='75.26';e.payload.payment.change='24.74';assert.throws(()=>event(e),/D_STOCK_LINE_COVERAGE/);});
test('compensated state implies retained successful compensation even if step is removed',()=>{const o=clone(states.find(x=>x.stock_step==='compensated'));o.compensation_step='not_requested';o.compensation=null;assert.throws(()=>operation(o),/D_COMPENSATED_WITHOUT_RESULT/);});
for(const [name,edit,error] of [
 ['paid without evidence',o=>{o.payment_step='succeeded';o.payment=null;},/D_PAYMENT_EVIDENCE/],
 ['paid without confirmed stock',o=>{o.stock_step='unknown';o.stock=null;o.payment_step='succeeded';o.payment=clone(pending.payload.payment);},/D_PAID_WITHOUT_STOCK/],
 ['stock success without evidence',o=>o.stock=null,/D_STOCK_EVIDENCE/],
 ['unconfirmed payment evidence',o=>o.payment=clone(pending.payload.payment),/D_UNCONFIRMED_PAYMENT_EVIDENCE/],
 ['unrequested compensation evidence',o=>o.compensation=clone(states.find(x=>x.stock_step==='compensated').compensation),/D_UNREQUESTED_COMPENSATION/]
])test('operation evidence rejects '+name,()=>{const o=clone(states.find(x=>x.status==='requires_attention'));edit(o);assert.throws(()=>operation(o),error);});
const connected=read('sales/fixtures/vectors/v2/included-snapshots.json');
for(const v of connected.cases)test('included snapshot and independent golden totals '+v.id,()=>{const e=read(v.fixture);event(e);assert.equal(e.payload.totals.commercial_total,v.gross);if(v.oracle)assert.deepEqual({net:e.payload.fiscal_context.totals.taxable_net,tax:e.payload.fiscal_context.totals.vat,gross:v.gross},included(v.gross,'21'));});
test('three-cent IVA snapshot preserves raw base and closes to two cents plus one',()=>{const e=read('sales/fixtures/completion/v2/included-cent-03.json'),t=e.payload.fiscal_context;assert.equal(t.totals.taxable_net,'0.02');assert.equal(t.totals.vat,'0.01');assert.equal(t.totals.total,'0.03');assert.notEqual(t.lines[0].components[0].base,'0.02');event(e);});
test('group cent allocation ties use line_id, not arrival or display order',()=>{const e=read('sales/fixtures/completion/v2/included-three-line-tie.json'),t=e.payload.fiscal_context;const sorted=[...t.lines].sort((a,b)=>a.line_id.localeCompare(b.line_id));assert.deepEqual(sorted.map(l=>l.components[0].amount),['0.01','0.00','0.00']);assert.equal(t.totals.taxable_net,'0.02');assert.equal(t.totals.vat,'0.01');e.payload.lines.reverse();t.lines.reverse();t.groups[0].line_ids.reverse();event(e);});
for(const [name,edit,error] of [
 ['invented theoretical amount',t=>t.lines[0].components[0].theoretical_amount='999999.99',/D_THEORETICAL_AMOUNT/],
 ['invented allocated residue',t=>t.lines[0].components[0].allocated_residue='999.99',/D_TAX_RESIDUE/],
 ['false tax exclusion',t=>t.lines[0].components[0].included=false,/D_COMPONENT_INCLUSION/],
 ['invented raw base',t=>t.lines[0].components[0].base='0.02',/D_INCLUDED_BASE/],
 ['invented allocated net',t=>t.lines[0].components[0].allocated_base='0.01',/D_ALLOCATED_BASE/],
 ['invented net residue',t=>t.lines[0].components[0].base_residue='0.50',/D_BASE_RESIDUE/],
 ['future recipient rule',t=>t.recipient.rule.version='future',/D_UNSUPPORTED_RULE/],
 ['future decision rule',t=>t.decisions[0].rule.version='future',/D_UNSUPPORTED_RULE/],
 ['future group rule',t=>t.groups[0].rule.version='future',/D_UNSUPPORTED_RULE/],
 ['wrong group allocated net',t=>t.groups[0].allocated_base='0.01',/D_GROUP_ALLOCATED_BASE/],
 ['wrong group residue',t=>t.groups[0].base_residue='0.50',/D_GROUP_BASE_RESIDUE/],
 ['negative zero',t=>t.lines[0].components[0].allocated_residue='-0.00',/D_NEGATIVE_ZERO/]
])test('fiscal trace rejects '+name,()=>{const e=read('sales/fixtures/completion/v2/included-cent-03.json');edit(e.payload.fiscal_context);assert.throws(()=>event(e),error);});
