import assert from "node:assert/strict";
import { decimal, text, uuid7 } from "./security-v1-common.mjs";
import { quantities, barcodeKey, normalizeBody } from "./http-v1-common.mjs";
import { instant, priceRecord, listRecord, normalizePriceBody } from "./pricing-http-v1-common.mjs";

// Contract-fixture semantics only. No SQL, broker, authorizer or projection runtime.
export const eventTypes = {
  category: "catalog.category.changed.v1",
  product: "catalog.product.changed.v1",
  presentation: "catalog.presentation.changed.v1",
  price: "pricing.presentation-price.changed.v1",
};
export const effectOperations = {
  createCatalogCategory: ["category"], updateCatalogCategory: ["category"],
  moveCatalogCategory: ["category"], inactivateCatalogCategory: ["category"],
  createCatalogProduct: ["product", "presentation"], updateCatalogProduct: ["product"],
  transitionCatalogProduct: ["product"], createCatalogPresentation: ["presentation"],
  updateCatalogPresentation: ["presentation"], transitionCatalogPresentation: ["presentation"],
  addCatalogPresentationBarcode: ["presentation"], retireCatalogPresentationBarcode: ["presentation"],
  createPresentationPrice: ["price"],
};
const record = (v, code) => assert(v && typeof v === "object" && !Array.isArray(v), code);
const same = (a,b,code) => assert.deepEqual(a,b,code);
const version = v => assert(Number.isSafeInteger(v) && v > 0,"E_VERSION");
const identifier = v => assert(typeof v === "string" && uuid7.test(v),"E_ID");

function tenant(value, organization) {
  if (Array.isArray(value)) { value.forEach(x => tenant(x,organization)); return; }
  if (!value || typeof value !== "object") return;
  if (Object.hasOwn(value,"organization_id")) same(value.organization_id,organization,"E_TENANT");
  Object.values(value).forEach(x => tenant(x,organization));
}
function normalizedStrings(value) {
  if (Array.isArray(value)) return value.forEach(normalizedStrings);
  if (!value || typeof value !== "object") return;
  for (const [key,x] of Object.entries(value)) {
    if (typeof x === "string") {
      assert(x.isWellFormed() && x.normalize("NFC") === x,"E_UNICODE");
      if (key === "name") text(x,160);
    } else normalizedStrings(x);
  }
}
export function expectedEffects(c) {
  record(c,"E_CONTEXT"); record(c.request,"E_REQUEST");
  assert(Object.hasOwn(effectOperations,c.operation_id),"E_OPERATION");
  assert(["committed","replay","rejected","rollback"].includes(c.outcome),"E_OUTCOME");
  if (c.outcome !== "committed") return [];
  const keys = [...effectOperations[c.operation_id]];
  if (c.operation_id === "updateCatalogProduct" && Object.hasOwn(c.request.default_variant ?? {},"base_unit")) keys.push("presentation");
  return keys;
}

export function validateEvent(e, policy) {
  record(e,"E_EVENT"); record(e.payload,"E_PAYLOAD");
  const descriptor = policy.events.find(d => d.event_type === e.event_type && d.schema_version === e.schema_version);
  assert(descriptor,"E_UNSUPPORTED_PAIR");
  same(e.producer,"catalog-pricing","E_PRODUCER");
  same(e.aggregate_type,descriptor.aggregate_type,"E_AGGREGATE_TYPE");
  identifier(e.event_id); identifier(e.aggregate_id); identifier(e.causation_id); version(e.aggregate_version);
  instant(e.occurred_at); normalizedStrings(e.payload); tenant(e.payload,e.organization_id);
  const p=e.payload, key=descriptor.key;
  assert(policy.operation_effects.some(x=>x.operation_id===p.operation_id && x.event_type===e.event_type),"E_EVENT_OPERATION");
  const snapshot=p[key]; record(snapshot,"E_SNAPSHOT");
  same(e.aggregate_id,snapshot[key === "price" ? "presentation_id" : key+"_id"],"E_AGGREGATE_ID");
  same(e.aggregate_version,snapshot.version,"E_AGGREGATE_VERSION");
  if (key === "price") {
    priceRecord(p.price); listRecord(p.list);
    same(p.price.price_list_id,p.list.price_list_id,"E_PRICE_LIST");
    same(p.price.valid_to,null,"E_NEW_PRICE_OPEN");
    same(instant(e.occurred_at),instant(p.price.valid_from),"E_PRICE_OCCURRENCE");
    assert(instant(p.list.created_at)<=instant(p.price.valid_from),"E_LIST_TIME");
    if(p.previous_price === null) {
      same(p.price.version,1,"E_FIRST_PRICE");
    } else {
      priceRecord(p.previous_price);
      same(p.previous_price.version,p.price.version-1,"E_PRICE_SEQUENCE");
      assert(p.previous_price.price_id!==p.price.price_id,"E_PRICE_IDENTITY");
      for(const field of ["organization_id","price_list_id","product_id","presentation_id","currency","tax_included"])
        same(p.previous_price[field],p.price[field],"E_PRICE_SCOPE");
      same(instant(p.previous_price.valid_to),instant(p.price.valid_from),"E_PRICE_CONTIGUITY");
    }
  } else {
    same(instant(snapshot.updated_at),instant(e.occurred_at),"E_OCCURRENCE");
    assert(instant(snapshot.created_at)<=instant(snapshot.updated_at),"E_ENTITY_TIME");
  }
  if(key === "product") {
    record(p.product.default_variant,"E_VARIANT");
    const fiscal=p.product.tax_classification;
    if(fiscal===null) same(p.tax_definition,null,"E_TAX_CAPTURE");
    else { record(p.tax_definition,"E_TAX_CAPTURE"); same(p.tax_definition.code,fiscal.code,"E_TAX_CAPTURE"); same(p.tax_definition.version,fiscal.version,"E_TAX_CAPTURE"); }
    if(p.product.status==="active") assert(fiscal!==null,"E_ACTIVE_TAX");
    if(p.affected_base_presentation!==null) {
      record(p.affected_base_presentation,"E_BASE_REFERENCE");
      same(p.affected_base_presentation.presentation_id,p.product.base_presentation_id,"E_BASE_REFERENCE");
      version(p.affected_base_presentation.version);
    }
  }
  if(key === "presentation") {
    quantities(p.presentation,p.base_unit); version(p.product_version);
    const isBarcode=["addCatalogPresentationBarcode","retireCatalogPresentationBarcode"].includes(p.operation_id);
    if(isBarcode) {
      record(p.barcode,"E_BARCODE_REQUIRED"); barcodeKey(p.barcode.type,p.barcode.value);
      same(p.barcode.presentation_id,p.presentation.presentation_id,"E_BARCODE_PRESENTATION");
      same(p.barcode.status,p.operation_id.startsWith("add")?"active":"retired","E_BARCODE_STATE");
      assert(instant(p.barcode.created_at)<=instant(e.occurred_at),"E_BARCODE_TIME");
      if(p.barcode.status==="retired")same(instant(p.barcode.retired_at),instant(e.occurred_at),"E_BARCODE_TIME");
      else same(p.barcode.retired_at,null,"E_BARCODE_TIME");
    } else same(p.barcode,null,"E_BARCODE_UNEXPECTED");
  }
  assert(Buffer.byteLength(JSON.stringify(e),"utf8") <= policy.maximum_bytes,"E_MESSAGE_SIZE");
  return descriptor.key;
}

export function validateEffects(c,policy) {
  const expected=expectedEffects(c);
  assert(Array.isArray(c.events),"E_EVENTS");
  same(c.events.map(e=>e.event_type).sort(),expected.map(k=>eventTypes[k]).sort(),"E_EFFECT_INVENTORY");
  if(!expected.length)return;
  record(c.response,"E_RESPONSE");
  const request=c.operation_id==="createPresentationPrice"?normalizePriceBody(c.operation_id,c.request):normalizeBody(c.operation_id,c.request);
  same(new Set(c.events.map(e=>e.event_id)).size,c.events.length,"E_EVENT_ID_UNIQUE");
  for(const e of c.events) {
    const key=validateEvent(e,policy),p=e.payload;
    for(const field of ["organization_id","causation_id","correlation_id"])same(e[field],c[field],"E_CAUSAL_CONTEXT");
    same(instant(e.occurred_at),instant(c.occurred_at),"E_CAUSAL_TIME");
    same(p.operation_id,c.operation_id,"E_HTTP_OPERATION");
    const snapshot=p[key], response=c.response.presentation??c.response;
    if(!(key==="presentation" && c.operation_id.includes("Product")))same(snapshot,response,"E_HTTP_SNAPSHOT");
    if(key==="price") {
      same(decimal(snapshot.amount,2,true),request.amount,"E_HTTP_PRICE");
      same(snapshot.version,request.expected_version+1,"E_HTTP_VERSION");
      same(p.previous_price,c.previous_price,"E_PREVIOUS_CAPTURE");
    } else if(key==="presentation" && c.operation_id.includes("Product")) {
      const product=c.events.find(x=>x.event_type===eventTypes.product)?.payload;
      assert(product,"E_MULTIAGGREGATE_PRODUCT");
      same(snapshot.presentation_id,product.product.base_presentation_id,"E_BASE_PAIR");
      same(snapshot.product_id,product.product.product_id,"E_BASE_PAIR");
      same(snapshot.variant_id,product.product.default_variant.variant_id,"E_BASE_PAIR");
      same(snapshot.version,product.affected_base_presentation?.version,"E_BASE_PAIR");
      same(snapshot.unit_code,product.product.default_variant.base_unit,"E_BASE_PAIR");
      same(p.base_unit,snapshot.unit_code,"E_BASE_PAIR");
      same(decimal(snapshot.conversion_factor,6,true),"1","E_BASE_FACTOR");
      same(p.product_version,product.product.version,"E_BASE_PAIR");
      same(snapshot.version,c.operation_id==="createCatalogProduct"?1:request.expected_base_presentation_version+1,"E_BASE_VERSION");
      if(c.operation_id==="createCatalogProduct") {
        for(const field of ["name","allows_fractions","minimum_quantity","quantity_increment"])same(snapshot[field],request.base_presentation[field],"E_HTTP_BASE");
        same(snapshot.status,"draft","E_CREATED_STATE");
      }
      record(c.base_presentation,"E_BASE_RESULT");
      same(snapshot,c.base_presentation,"E_BASE_SNAPSHOT");
    } else {
      same(snapshot.version,Object.hasOwn(request,"expected_version")?request.expected_version+1:1,"E_HTTP_VERSION");
    }
    if((key==="category"||key==="product"||key==="presentation") && !(key==="presentation" && c.operation_id.includes("Product"))) {
      for(const field of ["name","description","type","parent_id","category_id","tax_classification","unit_code","conversion_factor","allows_fractions","minimum_quantity","quantity_increment"])
        if(Object.hasOwn(request,field) && !c.operation_id.includes("Barcode"))same(snapshot[field],request[field],"E_HTTP_FIELD:"+field);
    }
    if(key==="product") {
      if(request.default_variant)for(const[field,v]of Object.entries(request.default_variant))same(snapshot.default_variant[field],v,"E_HTTP_VARIANT");
      const affects=c.operation_id==="createCatalogProduct"||Object.hasOwn(request.default_variant??{},"base_unit");
      same(p.affected_base_presentation!==null,affects,"E_BASE_EFFECT");
      if(c.operation_id==="createCatalogProduct")same(snapshot.status,"draft","E_CREATED_STATE");
    }
    if(key==="presentation" && c.response.barcode) {
      same(p.barcode,c.response.barcode,"E_HTTP_BARCODE");
      if(c.operation_id==="addCatalogPresentationBarcode")for(const k of["type","value"])same(p.barcode[k],request[k],"E_HTTP_BARCODE");
    }
    if(key==="presentation" && !c.operation_id.includes("Product")) {
      record(c.owner_product,"E_OWNER_PRODUCT");record(c.owner_product.default_variant,"E_OWNER_PRODUCT");
      same(c.owner_product.organization_id,c.organization_id,"E_OWNER_PRODUCT");
      same(p.presentation.product_id,c.owner_product.product_id,"E_OWNER_PRODUCT");
      same(p.presentation.variant_id,c.owner_product.default_variant.variant_id,"E_OWNER_PRODUCT");
      same(p.product_version,c.owner_product.version,"E_OWNER_PRODUCT");
      same(p.base_unit,c.owner_product.default_variant.base_unit,"E_OWNER_PRODUCT");
    }
    if(request.action && ["product","presentation"].includes(key))same(snapshot.status,{activate:"active",inactivate:"inactive",reactivate:"active",discontinue:"discontinued"}[request.action],"E_HTTP_TRANSITION");
    if(c.operation_id==="inactivateCatalogCategory")same(snapshot.status,"inactive","E_HTTP_TRANSITION");
  }
}

// A test-only known-data interpretation, not a domain projector or sale snapshot.
// Extension metadata is deliberately absent from all commercial decisions.
export function interpretKnown(e) {
  const p=e.payload;
  switch(e.event_type) {
    case eventTypes.category:return structuredClone(p.category);
    case eventTypes.product:return structuredClone({product:p.product,tax_definition:p.tax_definition,affected_base_presentation:p.affected_base_presentation});
    case eventTypes.presentation:return structuredClone({presentation:p.presentation,base_unit:p.base_unit,product_version:p.product_version,barcode:p.barcode});
    case eventTypes.price:return structuredClone({list:p.list,price:p.price,previous_price:p.previous_price});
    default:assert.fail("E_UNSUPPORTED_PAIR");
  }
}
