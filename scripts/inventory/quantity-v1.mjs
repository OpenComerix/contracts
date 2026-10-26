import assert from 'node:assert/strict';

// Contract vectors only: exact fixed-point arithmetic, no inventory persistence.
const SCALE=1_000_000_000n;
export function decimal(value,{scale=9,integer=38,signed=false,positive=false,canonical=false}={}) {
  assert(typeof value==='string','B_DECIMAL_TYPE');
  const expression=new RegExp('^'+(signed?'-?':'')+'(?:0|[1-9][0-9]{0,'+(integer-1)+'})(?:\\.[0-9]{1,'+scale+'})?$');
  assert(expression.test(value),'B_DECIMAL_FORMAT');
  const negative=value.startsWith('-');
  const [whole,fraction='']=(negative?value.slice(1):value).split('.');
  const result=(BigInt(whole)*SCALE+BigInt(fraction.padEnd(9,'0')))*(negative?-1n:1n);
  assert(!negative||result!==0n,'B_NEGATIVE_ZERO');
  assert(!positive||result>0n,'B_POSITIVE');
  if(canonical)assert.equal(format(result),value,'B_DECIMAL_CANONICAL');
  return result;
}
export function format(value) {
  const sign=value<0n?'-':'';const absolute=value<0n?-value:value;
  const whole=absolute/SCALE;const fraction=(absolute%SCALE).toString().padStart(9,'0').replace(/0+$/u,'');
  return sign+whole+(fraction?'.'+fraction:'');
}
export function baseQuantity(quantity,snapshot) {
  const input=decimal(quantity,{scale:3,integer:12,positive:true});
  const factor=decimal(snapshot.conversion_factor,{scale:6,integer:12,positive:true});
  const minimum=decimal(snapshot.minimum_quantity,{scale:3,integer:12,positive:true});
  const increment=decimal(snapshot.quantity_increment,{scale:3,integer:12,positive:true});
  assert(minimum%increment===0n,'B_MINIMUM_INCREMENT_MULTIPLE');
  assert(snapshot.allows_fractions||(minimum%SCALE===0n&&increment%SCALE===0n),'B_INDIVISIBLE_CONFIGURATION');
  assert(input>=minimum && (input-minimum)%increment===0n,'B_MINIMUM_INCREMENT');
  assert(snapshot.allows_fractions||input%SCALE===0n,'B_INDIVISIBLE');
  const dimensions={unit:'count',kg:'mass',g:'mass',l:'volume',ml:'volume',m:'length',cm:'length',m2:'area'};
  assert(dimensions[snapshot.base_unit] && dimensions[snapshot.base_unit]===dimensions[snapshot.presentation_unit],'B_UNIT_DIMENSION');
  const product=input*factor;
  assert(product%SCALE===0n,'B_CONVERSION_PRECISION');
  const base=product/SCALE;
  decimal(format(base),{positive:true,canonical:true});
  return format(base);
}
export function validatePhysicalLine(line) {
  assert(['STOCKED_GOOD','NON_STOCK_GOOD','SERVICE'].includes(line.snapshot.product_type),'B_PRODUCT_TYPE');
  assert.equal(line.snapshot.product_status,'active','B_PRODUCT_STATE');
  assert.equal(line.snapshot.presentation_status,'active','B_PRESENTATION_STATE');
  assert.equal(line.snapshot.variant_version_source,'product_version','B_VARIANT_VERSION');
  assert.equal(line.snapshot.line_id,line.line_id,'B_LINE_BINDING');
  assert.equal(line.base_quantity,baseQuantity(line.quantity,line.snapshot),'B_BASE_QUANTITY');
  return decimal(line.base_quantity,{positive:true,canonical:true});
}
