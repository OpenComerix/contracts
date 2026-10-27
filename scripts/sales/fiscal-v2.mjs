import assert from 'node:assert/strict';
import {decimal,add,mul,divide,equal,fixed,cents,amount} from './decimal-v2.mjs';
const zero=()=>({n:0n,d:1n});
const subtract=(a,b)=>({n:a.n*b.d-b.n*a.d,d:a.d*b.d});
const tax=r=>divide(mul(decimal(r.base),decimal(r.rate,6,6)),{n:100n,d:1n});
const jurisdiction=j=>[j.country,j.level,j.code];
const key=c=>JSON.stringify([jurisdiction(c.jurisdiction),c.tax_code,c.treatment,c.concept_code,c.category,c.rate,c.rule.code,c.rule.version]);
export function signedDecimal(s){assert(typeof s==='string'&&/^-?(?:0|[1-9][0-9]{0,37})(?:\.[0-9]{1,34})?$/u.test(s),'D_RESIDUE_FORMAT');const negative=s.startsWith('-'),v=decimal(negative?s.slice(1):s);assert(!negative||v.n!==0n,'D_NEGATIVE_ZERO');return {...v,n:negative?-v.n:v.n};}
export function signedFixed(v,scale=34){return v.n<0n?'-'+fixed({...v,n:-v.n},scale):fixed(v,scale);}
export function roundedAllocation(total,rows){
 const result=rows.map(r=>{const scaled=mul(r.value,{n:100n,d:1n});return {line_id:r.line_id,n:scaled.n/scaled.d,remainder:{n:scaled.n%scaled.d,d:scaled.d}};});
 assert.equal(new Set(result.map(x=>x.line_id)).size,result.length,'D_TAX_DUPLICATE_COMPONENT');let left=cents(total)-result.reduce((n,x)=>n+x.n,0n);assert(left>=0n&&left<=BigInt(rows.length),'D_TAX_ALLOCATION_RANGE');
 const sorted=[...result].sort((a,b)=>{const d=a.remainder.n*b.remainder.d-b.remainder.n*a.remainder.d;return d===0n?(a.line_id<b.line_id?-1:1):d>0n?-1:1;});for(const r of sorted){if(left===0n)break;r.n++;left--;}
 assert.equal(left,0n,'D_TAX_ALLOCATION_RANGE');return new Map(result.map(x=>[x.line_id,amount(x.n)]));
}
// Exact synthetic policy oracle. It is not a production fiscal engine.
export function validateResolved(s){
 const t=s.fiscal_context;assert.equal(t.lines.length,s.lines.length,'D_TAX_LINE_COUNT');assert.equal(new Set(t.lines.map(x=>x.line_id)).size,t.lines.length,'D_TAX_LINE_IDS');
 assert(Date.parse(t.profile.valid_from)<=Date.parse(t.profile.captured_at)&&(t.profile.valid_to===null||Date.parse(t.profile.captured_at)<Date.parse(t.profile.valid_to)),'D_PROFILE_VALIDITY');
 const supported=new Set(t.rules.map(r=>r.code+'@'+r.version));assert.equal(supported.size,t.rules.length,'D_RULE_DUPLICATE');assert([...supported].every(r=>['SYNTHETIC_VAT@1','SYNTHETIC_OTHER@1'].includes(r)),'D_UNSUPPORTED_RULE');
 const rule=r=>assert(r&&supported.has(r.code+'@'+r.version),'D_UNSUPPORTED_RULE');if(t.recipient.kind==='anonymous')rule(t.recipient.rule);for(const d of t.decisions)rule(d.rule);
 const groups=new Map(),netByTreatment={taxable:0n,exempt:0n,not_taxable:0n};
 for(const l of t.lines){
  const commercial=s.lines.find(x=>x.line_id===l.line_id);assert(commercial,'D_TAX_LINE_BINDING');assert(l.components.length>0,'D_TAX_COMPONENTS');assert.equal(new Set(l.components.map(c=>c.component_id)).size,l.components.length,'D_COMPONENT_ID');
  const vats=l.components.filter(c=>c.category==='vat');assert.equal(vats.length,1,'D_SYNTHETIC_PRIMARY_BASE');
  const rates=l.components.filter(c=>c.treatment==='taxable').reduce((a,c)=>add(a,decimal(c.rate,6,6)),zero());
  const base=divide(decimal(commercial.commercial_total,2),add({n:1n,d:1n},divide(rates,{n:100n,d:1n})));const capturedBase=decimal(fixed(base,34));
  const taxes=l.components.reduce((a,c)=>a+cents(c.amount),0n),net=cents(commercial.commercial_total)-taxes;assert(net>=0n,'D_INCLUDED_NEGATIVE_NET');
  for(const c of l.components){
   rule(c.rule);assert(t.jurisdictions.some(j=>JSON.stringify(jurisdiction(j))===JSON.stringify(jurisdiction(c.jurisdiction))),'D_JURISDICTION');assert(['taxable','exempt','not_taxable'].includes(c.treatment),'D_TAX_TREATMENT');assert(['vat','other'].includes(c.category),'D_TAX_CATEGORY');assert.equal(c.included,s.tax_included,'D_COMPONENT_INCLUSION');
   if(c.treatment!=='taxable')assert(c.reason&&cents(c.amount)===0n&&decimal(c.rate,6,6).n===0n,'D_EXEMPT_REASON');
   assert(equal(decimal(c.base),capturedBase),'D_INCLUDED_BASE');
   const theoretical=c.treatment==='taxable'?tax(c):zero(),wireTheory=decimal(fixed(theoretical,34));assert(equal(decimal(c.theoretical_amount),wireTheory),'D_THEORETICAL_AMOUNT');
   assert(equal(signedDecimal(c.allocated_residue),subtract(decimal(c.amount,2),wireTheory)),'D_TAX_RESIDUE');
   assert.equal(c.allocated_base,amount(net),'D_ALLOCATED_BASE');assert(equal(signedDecimal(c.base_residue),subtract(decimal(c.allocated_base,2),decimal(c.base))),'D_BASE_RESIDUE');
   const k=key(c),row=groups.get(k)??{base:zero(),theoretical:zero(),amount:0n,allocated_base:0n,components:[]};row.base=add(row.base,decimal(c.base));row.theoretical=add(row.theoretical,theoretical);row.amount+=cents(c.amount);row.allocated_base+=cents(c.allocated_base);row.components.push({line_id:l.line_id,c,theoretical});groups.set(k,row);
  }
  netByTreatment[vats[0].treatment]+=net;
 }
 assert.equal(t.groups.length,groups.size,'D_GROUP_COUNT');let vat=0n,other=0n;
 for(const g of t.groups){
  rule(g.rule);const row=groups.get(key(g));assert(row,'D_GROUP_KEY');groups.delete(key(g));assert(equal(decimal(g.base),row.base),'D_GROUP_BASE');assert.equal(g.amount,amount(row.amount),'D_GROUP_AMOUNT');assert.equal(g.amount,fixed(row.theoretical),'D_TAX_RATE_AMOUNT');
  assert.equal(g.allocated_base,amount(row.allocated_base),'D_GROUP_ALLOCATED_BASE');assert(equal(signedDecimal(g.base_residue),subtract(decimal(g.allocated_base,2),row.base)),'D_GROUP_BASE_RESIDUE');
  assert.deepEqual([...g.line_ids].sort(),row.components.map(x=>x.line_id).sort(),'D_GROUP_LINES');const assigned=roundedAllocation(g.amount,row.components.map(x=>({line_id:x.line_id,value:x.theoretical})));for(const x of row.components)assert.equal(x.c.amount,assigned.get(x.line_id),'D_TAX_ALLOCATION');
  if(g.category==='vat')vat+=cents(g.amount);else other+=cents(g.amount);
 }
 for(const [k,n] of Object.entries({taxable_net:netByTreatment.taxable,vat,exempt:netByTreatment.exempt,not_taxable:netByTreatment.not_taxable,other_taxes:other}))assert.equal(t.totals[k],amount(n),'D_FISCAL_TOTAL:'+k);
 assert.equal(amount(Object.values(netByTreatment).reduce((a,b)=>a+b,0n)+vat+other),s.totals.commercial_total,'D_FISCAL_CLOSURE');assert.equal(t.totals.total,s.totals.commercial_total,'D_TAX_TOTAL');return {synthetic:true,runtime_demonstrated:false};
}
