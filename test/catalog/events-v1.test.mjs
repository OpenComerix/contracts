import assert from "node:assert/strict";
import test from "node:test";
import { read, directory, fixtureDirectory, validateEvents, validateInventory, resolveSchema } from "../../scripts/catalog/validate-events-v1.mjs";
import { validateEvent, validateEffects, interpretKnown } from "../../scripts/catalog/event-v1-semantics.mjs";

const policy=read(directory+"catalog-event-policy-v1.json");
const manifest=read(fixtureDirectory+"catalog-event-v1-fixtures.json");
const effect=id=>structuredClone(read(manifest.effects.find(x=>x.id===id).fixture));
test("E inventory, HTTP effects, negatives and synthetic compatibility are complete",()=>{
  const result=validateEvents(null,true);
  assert.equal(result.events,4);assert.equal(result.effects,19);
  assert(result.schema_cases>150);assert(result.semantic_negatives>=25);
  assert.equal(result.runtime_demonstrated,false);
});
test("a presentation's first price may use an already existing default list",()=>{
  const c=effect("createPresentationPrice-first-existing-list");
  assert.equal(c.request.expected_version,0);
  assert(c.events[0].payload.list.created_at<c.events[0].payload.price.valid_from);
  validateEffects(c,policy);
  const bad=structuredClone(c);bad.events[0].payload.list.created_at="2027-01-01T00:00:00Z";
  bad.events[0].payload.list.updated_at="2027-01-01T00:00:00Z";
  assert.throws(()=>validateEffects(bad,policy),/E_LIST_TIME/);
});
test("multiple aggregate effects share cause without sharing identity or version sequence",()=>{
  for(const id of["createCatalogProduct","updateCatalogProduct-base-unit"]) {
    const c=effect(id);validateEffects(c,policy);
    assert.equal(c.events.length,2);
    const bad=structuredClone(c);bad.events[1].causation_id=c.events[0].event_id;
    assert.throws(()=>validateEffects(bad,policy),/E_CAUSAL_CONTEXT/);
  }
});
test("base-unit sibling event matches the complete locally committed presentation",()=>{
  const original=effect("updateCatalogProduct-base-unit");
  validateEffects(original,policy);
  for(const changes of[
    {name:"Never committed name"},
    {minimum_quantity:"2",quantity_increment:"2"},
    {allows_fractions:true},
    {status:"inactive"},
  ]) {
    const altered=structuredClone(original);
    Object.assign(altered.events[1].payload.presentation,changes);
    assert.throws(()=>validateEffects(altered,policy),e=>e instanceof assert.AssertionError && e.message.includes("E_BASE_SNAPSHOT"));
  }
  const missing=structuredClone(original);delete missing.base_presentation;
  assert.throws(()=>validateEffects(missing,policy),/E_BASE_RESULT/);
});
test("fresh history remains interpretable after later price and tax master mutations",()=>{
  const product=effect("transitionCatalogProduct").events[0];
  const retained=structuredClone(product),current=structuredClone(product);
  current.payload.product.name="Current name";current.payload.tax_definition.components[0].treatment="exempt";
  assert.notDeepEqual(interpretKnown(current),interpretKnown(retained));
  assert.equal(interpretKnown(retained).product.name,"Producto de ejemplo");
  assert.equal(interpretKnown(retained).tax_definition.components[0].treatment,"taxable");
  const c=effect("createPresentationPrice"),captured=structuredClone(c.events[0]);
  c.response.amount="999";c.response.valid_to="2026-10-16T00:00:00Z";
  assert.equal(interpretKnown(captured).price.amount,"12.5");
  assert.equal(interpretKnown(captured).price.valid_to,null);
  validateEvent(captured,policy);
});
test("semantic rejection requires a domain assertion, never accidental TypeError",()=>{
  for(const [mutate,reason]of[
    [c=>delete c.request,"E_REQUEST"],
    [c=>c.events=null,"E_EVENTS"],
    [c=>delete c.events[0].payload,"E_PAYLOAD"],
    [c=>c.events[0].schema_version=99,"E_UNSUPPORTED_PAIR"],
  ]){
    const c=effect("createCatalogProduct");mutate(c);
    assert.throws(()=>validateEffects(c,policy),e=>e instanceof assert.AssertionError && e.message.includes(reason));
  }
});
test("field/privacy and topology inventories cannot silently omit coverage",()=>{
  const a=read(directory+"catalog-events-v1.asyncapi.yaml"),data=read(directory+"catalog-event-data-v1.schema.json");
  const p=structuredClone(policy);p.field_inventory.pop();
  assert.throws(()=>validateInventory(p,manifest,a,data),/E_PRIVACY_INVENTORY/);
  const b=structuredClone(a);b.channels.catalogEvents["x-future-consumers"][0].consumer="web-pos";
  assert.throws(()=>validateInventory(policy,manifest,b,data),/E_TOPOLOGY/);
  const weaker=structuredClone(policy);weaker.field_inventory.find(f=>f.path.includes("tax_definition")).sensitivity="INTERNAL";
  assert.throws(()=>validateInventory(weaker,manifest,a,data),/E_FIELD_CLASSIFICATION/);
});
test("native schema extraction retains envelope constraints and resolves all references",()=>{
  for(const e of policy.events)for(const f of[e.schema,e.consumer_schema]){
    const schema=resolveSchema(f),source=JSON.stringify(schema);
    assert(!source.includes('"$ref"'));
    assert(source.includes('"additionalProperties":false'));
    assert(source.includes('"schema_version":{"const":1}'));
  }
});
