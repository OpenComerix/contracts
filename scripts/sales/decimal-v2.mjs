import assert from 'node:assert/strict';
// Exact rationals for synthetic contract vectors; no production fiscal engine.
const pow=n=>10n**BigInt(n);
export function decimal(s,scale=34,integers=38,{positive=false}={}){
 assert(typeof s==='string'&&new RegExp('^(?:0|[1-9][0-9]{0,'+(integers-1)+'})(?:\\.[0-9]{1,'+scale+'})?$','u').test(s),'D_DECIMAL_FORMAT');
 const [a,b='']=s.split('.'),n=BigInt(a+b);assert(!positive||n>0n,'D_DECIMAL_POSITIVE');return {n,d:pow(b.length)};
}
export const add=(a,b)=>({n:a.n*b.d+b.n*a.d,d:a.d*b.d});
export const mul=(a,b)=>({n:a.n*b.n,d:a.d*b.d});
export const equal=(a,b)=>a.n*b.d===b.n*a.d;
export function divide(a,b){assert(b.n>0n,'D_ZERO_DIVISOR');return {n:a.n*b.d,d:a.d*b.n};}
export function fixed(a,scale=2){assert(a.n>=0n&&a.d>0n,'D_NONNEGATIVE');const p=pow(scale),n=(a.n*p*2n+a.d)/(2n*a.d);assert(n/p<pow(38),'D_DERIVED_RANGE');return (n/p).toString()+(scale?'.'+(n%p).toString().padStart(scale,'0'):'');}
export function exact(a,scale=9){assert((a.n*pow(scale))%a.d===0n,'D_INEXACT');const s=fixed(a,scale);return s.includes('.')?s.replace(/0+$/u,'').replace(/\.$/u,''):s;}
export function cents(s){assert(typeof s==='string'&&/^(?:0|[1-9][0-9]{0,37})\.[0-9]{2}$/u.test(s),'D_MONEY');return BigInt(s.replace('.',''));}
export function amount(n){assert(n>=0n&&n<10n**40n,'D_DERIVED_RANGE');return n/100n+'.'+(n%100n).toString().padStart(2,'0');}
export function line(price,quantity,factor,{allows_fractions=true,minimum='0.001',increment='0.001'}={}){
 const p=decimal(price,2,12,{positive:true}),q=decimal(quantity,3,12,{positive:true}),f=decimal(factor,6,12,{positive:true});
 if(!allows_fractions)assert(/^[1-9][0-9]{0,11}$/u.test(quantity),'D_INDIVISIBLE');
 const min=decimal(minimum,3,12,{positive:true}),inc=decimal(increment,3,12,{positive:true});assert(min.n*q.d<=q.n*min.d,'D_MINIMUM');assert((q.n*inc.d)%(inc.n*q.d)===0n,'D_INCREMENT');assert((min.n*inc.d)%(inc.n*min.d)===0n,'D_MINIMUM_INCREMENT');
 return {base_quantity:exact(mul(q,f)),commercial_total:fixed(mul(p,q))};
}
export function largestRemainder(total,weights){
 const target=cents(total);assert(weights.length&&new Set(weights.map(x=>x.line_id)).size===weights.length,'D_ALLOCATION_IDS');const parsed=weights.map(x=>({...x,w:decimal(x.weight,34,38,{positive:true})})),sum=parsed.reduce((a,x)=>add(a,x.w),{n:0n,d:1n});
 const rows=parsed.map(x=>{const r=divide(mul({n:target,d:1n},x.w),sum);return {...x,n:r.n/r.d,remainder:{n:r.n%r.d,d:r.d}};});let left=target-rows.reduce((n,x)=>n+x.n,0n);
 const sorted=[...rows].sort((a,b)=>{const delta=a.remainder.n*b.remainder.d-b.remainder.n*a.remainder.d;return delta===0n?(a.line_id<b.line_id?-1:1):delta>0n?-1:1;});for(const r of sorted){if(left===0n)break;r.n++;left--;}assert.equal(left,0n,'D_ALLOCATION_REMAINDER');return rows.map(x=>({line_id:x.line_id,amount:amount(x.n)}));
}
export function included(gross,rate){const g=decimal(gross,2),r=decimal(rate,6,6),net=divide(g,add({n:1n,d:1n},divide(r,{n:100n,d:1n}))),netClosed=fixed(net);return {net:netClosed,tax:amount(cents(gross)-cents(netClosed)),gross};}
