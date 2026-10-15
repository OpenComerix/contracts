import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { eventTypes, effectOperations, validateEffects, interpretKnown } from "./event-v1-semantics.mjs";

export const root=path.resolve(import.meta.dirname,"../..");
export const directory="catalog/events/v1/";
export const fixtureDirectory="catalog/fixtures/events/v1/";
const dialect="https://json-schema.org/draft/2020-12/schema";
export const read=f=>JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(fs.readFileSync(path.join(root,f))));
const pointer=(v,p)=>p?p.slice(1).split("/").reduce((v,k)=>{
  k=k.replaceAll("~1","/").replaceAll("~0","~");
  assert(v && Object.hasOwn(v,k),"E_REFERENCE_POINTER");return v[k];
},v):v;

// Exact local JSON Schema reference closure for these acyclic candidates.
// This exports actual schemas for Sourcemeta; it does not validate instances.
export function resolveSchema(file,fragment="",trail=[]) {
  const key=file+"#"+fragment;
  assert(!trail.includes(key),"E_REFERENCE_CYCLE");
  const document=read(file), value=pointer(document,fragment);
  function visit(v) {
    if(Array.isArray(v))return v.map(visit);
    if(!v||typeof v!=="object")return v;
    const rest=Object.fromEntries(Object.entries(v).filter(([k])=>!["$id","$schema","$defs","$ref"].includes(k)).map(([k,x])=>[k,visit(x)]));
    if(!v.$ref)return rest;
    assert(typeof v.$ref==="string" && !/^[a-z]+:/i.test(v.$ref),"E_LOCAL_REF");
    const [relative,p=""]=v.$ref.split("#");
    const target=relative?path.posix.normalize(path.posix.join(path.posix.dirname(file),relative)):file;
    assert(!target.startsWith("../") && !path.posix.isAbsolute(target),"E_REF_ESCAPE");
    const resolved=resolveSchema(target,p,[...trail,key]);
    return Object.keys(rest).length?{allOf:[resolved,rest]}:resolved;
  }
  return visit(value);
}

export function validateInventory(policy,manifest,asyncapi,data) {
  assert.equal(policy.status,"candidate","E_ADMISSION");
  assert.equal(policy.format_version,1,"E_POLICY_VERSION");
  assert.equal(policy.producer,"catalog-pricing","E_PRODUCER");
  assert.equal(policy.maximum_bytes,131072,"E_LIMIT");
  assert.deepEqual(policy.events.map(x=>[x.key,x.event_type,x.schema_version,x.aggregate_type]),[
    ["category",eventTypes.category,1,"category"],["product",eventTypes.product,1,"product"],
    ["presentation",eventTypes.presentation,1,"presentation"],["price",eventTypes.price,1,"presentation_price"],
  ],"E_EVENT_INVENTORY");
  const expected=Object.entries(effectOperations).flatMap(([op,keys])=>keys.map(k=>[op,eventTypes[k],"committed"]));
  expected.push(["updateCatalogProduct",eventTypes.presentation,"base_unit_changed"]);
  const actual=policy.operation_effects.map(x=>[x.operation_id,x.event_type,x.condition]);
  assert.deepEqual(actual.map(JSON.stringify).sort(),expected.map(JSON.stringify).sort(),"E_MATRIX");
  const http=read("catalog/http/shared/v1/catalog-security-policy-v1.json");
  assert.deepEqual(http.operations.filter(x=>x.method!=="GET").map(x=>x.operation_id).sort(),Object.keys(effectOperations).sort(),"E_HTTP_MUTATION_COVERAGE");
  assert.equal(http.operations.filter(x=>x.method==="GET").length,12,"E_HTTP_QUERY_COUNT");
  assert.deepEqual(policy.compatibility,{admitted_revisions:[1],extension_zone:"/payload/extensions",active_extensions:[],synthetic_evolution_only:true,unknown_revision:"quarantine_without_effect",unknown_critical_enum:"quarantine_without_effect"},"E_COMPATIBILITY");
  assert.equal(manifest.format_version,1,"E_MANIFEST_VERSION");
  assert.equal(manifest.scope,"F1-07E","E_MANIFEST_SCOPE");
  assert.equal(manifest.runtime_demonstrated,false,"E_RUNTIME_LIMIT");
  assert.equal(policy.delivery.runtime_demonstrated,false,"E_RUNTIME_LIMIT");
  assert.equal(policy.delivery.status,"future_intention","E_RUNTIME_LIMIT");
  const expectedIds=[...Object.keys(effectOperations),"updateCatalogProduct-base-unit","createPresentationPrice-first","createPresentationPrice-first-existing-list","no-event-replay","no-event-rejected","no-event-rollback"].sort();
  assert.deepEqual(manifest.effects.map(x=>x.id).sort(),expectedIds,"E_EFFECT_FIXTURE_COVERAGE");
  assert.equal(new Set(manifest.effects.map(x=>x.fixture)).size,expectedIds.length,"E_FIXTURE_DUPLICATE");
  assert.deepEqual(asyncapi["x-filter-pairs"],policy.events.map(e=>({event_type:e.event_type,schema_version:1})),"E_ASYNC_FILTERS");
  assert.equal(asyncapi.asyncapi,"3.0.0","E_ASYNC_VERSION");
  assert.equal(asyncapi["x-status"],"candidate","E_ASYNC_ADMISSION");
  assert.equal(asyncapi.info.license.name,"Proprietary","E_LICENSE");
  assert.deepEqual(Object.keys(asyncapi.channels),["catalogEvents"],"E_TOPIC_INVENTORY");
  const channel=asyncapi.channels.catalogEvents;
  assert.equal(channel.address,policy.delivery.topic,"E_TOPIC");
  assert.deepEqual(channel["x-future-consumers"],[policy.delivery],"E_TOPOLOGY");
  assert.deepEqual(Object.keys(asyncapi.components.messages),policy.events.map(x=>x.key),"E_ASYNC_MESSAGES");
  assert.deepEqual(Object.keys(channel.messages),policy.events.map(x=>x.key),"E_ASYNC_MESSAGES");
  assert.deepEqual(asyncapi.operations,{publishCatalogChanges:{action:"send",channel:{$ref:"#/channels/catalogEvents"},messages:policy.events.map(e=>({$ref:"#/channels/catalogEvents/messages/"+e.key}))}},"E_ASYNC_OPERATIONS");
  for(const e of policy.events) {
    assert.equal(e.schema,directory+e.event_type+".schema.json","E_SCHEMA_PATH");
    assert.equal(e.consumer_schema,directory+e.event_type+".consumer.schema.json","E_SCHEMA_PATH");
    const message=asyncapi.components.messages[e.key];
    assert.equal(message.name,e.event_type,"E_ASYNC_TYPE");
    assert.deepEqual(message.payload,{schemaFormat:"application/schema+json;version=draft-2020-12",schema:{$ref:path.posix.basename(e.schema)}},"E_ASYNC_SCHEMA");
    assert.deepEqual(channel.messages[e.key],{$ref:"#/components/messages/"+e.key},"E_ASYNC_REFERENCE");
    for(const field of ["schema","consumer_schema"]) {
      const s=read(e[field]);
      assert.equal(s.$schema,dialect,"E_DIALECT");
      assert.equal(s.$id,"https://contracts.opencomerix.example/"+e[field],"E_SCHEMA_ID");
      assert.equal(s["x-log-policy"],"no-event-body-or-field-values","E_LOG_POLICY");
      assert(s["x-data-purpose"]?.length>0,"E_FIELD_PURPOSE");
      assert(s["x-retention-profile"]?.startsWith("TECHNICAL_SHORT (serialized transport only;"),"E_TRANSPORT_RETENTION");
      assert.deepEqual(s.allOf[0],{$ref:"../../../events/event-envelope-v1.schema.json"},"E_ENVELOPE_REUSE");
      const props=s.allOf[1].properties;
      for(const[k,v]of Object.entries({event_type:e.event_type,schema_version:1,producer:"catalog-pricing",aggregate_type:e.aggregate_type}))assert.equal(props[k].const,v,"E_PROFILE_BINDING");
      assert.deepEqual(s.allOf[1].required,["causation_id"],"E_CAUSE_REQUIRED");
      assert.equal(props.branch_id,false,"E_ORGANIZATION_SCOPE");assert.equal(props.pos_id,false,"E_ORGANIZATION_SCOPE");
    }
    const consumer=read(e.consumer_schema);
    assert.deepEqual(consumer.allOf[1].properties.payload.properties.extensions,{type:"object",maxProperties:0,additionalProperties:false},"E_EXTENSION_ZONE");
  }
  // Every snapshot definition stays aligned to all known source constraints,
  // with stricter object closure and no search-only matched_presentation_id.
  for(const [name,source]of Object.entries(policy.source_shapes)) {
    function shape(v,file) {
      if(Array.isArray(v))return v.map(x=>shape(x,file));
      if(!v||typeof v!=="object")return v;
      const out=Object.fromEntries(Object.entries(v).map(([k,x])=>{
        if(k!=="$ref")return[k,shape(x,file)];
        const [rel,ptr]=x.split("#");const target=rel?path.posix.join(path.posix.dirname(file),rel):file;
        const match=Object.entries(policy.source_shapes).find(([,s])=>s.file===target && s.pointer===ptr);
        assert(match,"E_SOURCE_REFERENCE");return[k,"#/$defs/"+match[0]];
      }));
      if(out.type==="object")out.additionalProperties=false;
      return out;
    }
    const expected=shape(pointer(read(source.file),source.pointer),source.file);
    if(name==="E_Product")delete expected.properties.matched_presentation_id;
    assert.deepEqual(data.$defs[name],expected,"E_SOURCE_SHAPE:"+name);
  }
  assert(Object.keys(policy.source_shapes).length>=20,"E_SOURCE_SHAPE_COVERAGE");
  assert.deepEqual(Object.keys(policy.source_shapes).sort(),Object.keys(data.$defs).filter(n=>/^[ECP]_/.test(n)).sort(),"E_SOURCE_SHAPE_INVENTORY");
  function leaves(v,p) {
    if(v.$ref)return leaves(pointer(data,v.$ref.slice(1)),p);
    if(v.type==="object")return Object.entries(v.properties??{}).flatMap(([k,s])=>leaves(s,p+"/"+k));
    if(v.type==="array")return leaves(v.items,p+"/*");
    if(v.anyOf)return leaves(v.anyOf.find(x=>x.type!=="null"),p);
    return[p];
  }
  const envelope=read("events/event-envelope-v1.schema.json");
  const fieldPaths=policy.events.flatMap(e=>[...new Set([
    ...Object.keys(envelope.properties).filter(k=>!["payload","branch_id","pos_id"].includes(k)).map(k=>"/"+k),
    ...leaves(data.$defs[e.payload_definition],"/payload"),
  ])].map(p=>e.event_type+":"+p)).sort();
  assert.deepEqual(policy.field_inventory.map(x=>x.event_type+":"+x.path).sort(),fieldPaths,"E_PRIVACY_INVENTORY");
  for(const field of policy.field_inventory) {
    const fiscal=/tax_classification|tax_definition|tax_included/.test(field.path);
    const technical=/(?:_id|version|_at|_from|_to|producer|aggregate_type|operation_id|event_type)$/.test(field.path);
    assert.equal(field.sensitivity,fiscal?"RESTRICTED":technical?"INTERNAL":"CONFIDENTIAL","E_FIELD_CLASSIFICATION");
    assert.deepEqual(field.categories,fiscal?["FISCAL","COMMERCIAL"]:technical?["OPERATIONAL"]:["COMMERCIAL"],"E_FIELD_CLASSIFICATION");
    assert.equal(field.owner,"catalog-pricing","E_FIELD_OWNER");
    assert.equal(field.access,"authorized-tenant-workloads","E_FIELD_ACCESS");
    assert(typeof field.purpose==="string"&&field.purpose.length>0,"E_FIELD_PURPOSE");
    assert.equal(field.retention_profile,"TECHNICAL_SHORT","E_FIELD_RETENTION");
    assert.equal(field.history_retention,"owner-policy-required-before-F1-08; holds and source obligations preserved","E_HISTORY_RETENTION");
    assert.equal(field.log_policy,"no-values","E_LOG_POLICY");
    assert.equal(field.encryption,"TLS-and-encrypted-at-rest","E_ENCRYPTION");
    assert.equal(field.base,"authorized-organization-operation-and-history","E_FIELD_PURPOSE");
    assert.deepEqual(field.consumers,["reporting.catalog-changes (future intention only)"],"E_FIELD_ACCESS");
    assert.equal(field.export_correction,"authorized-export; prospective-version-only","E_HISTORY_MUTABILITY");
    assert.equal(field.third_parties_regions,"none-authorized","E_FIELD_ACCESS");
  }
}

export function syntheticProfiles(schema) {
  const earlier=structuredClone(schema),later=structuredClone(schema);
  for(const s of [earlier,later])s.allOf[1].properties.schema_version.const=2;
  const optional={type:"object",properties:{display_label:{type:"string",minLength:1,maxLength:80}},additionalProperties:false};
  // Earlier reader validates the declared extension zone but does not interpret
  // its new optional member; later reader knows that member. Both validate all
  // original commercial fields. Revision 2 is test-only, never admitted.
  earlier.allOf[1].properties.payload.properties.extensions={type:"object",propertyNames:{enum:["display_label"]},additionalProperties:{type:"string",minLength:1,maxLength:80},maxProperties:1};
  later.allOf[1].properties.payload.properties.extensions=optional;
  return {earlier,later};
}

function list(relative) {
  return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).flatMap(e=>{
    assert(!e.isSymbolicLink(),"E_FIXTURE_LINK");const f=relative+e.name;
    return e.isDirectory()?list(f+"/"):[f];
  });
}
export function validateEvents(output,selfTest=false) {
  const policy=read(directory+"catalog-event-policy-v1.json"),manifest=read(fixtureDirectory+"catalog-event-v1-fixtures.json"),asyncapi=read(directory+"catalog-events-v1.asyncapi.yaml"),data=read(directory+"catalog-event-data-v1.schema.json");
  validateInventory(policy,manifest,asyncapi,data);
  const expectedFiles=[fixtureDirectory+"catalog-event-v1-fixtures.json",fixtureDirectory+"event-v1-vectors.json",...manifest.effects.map(x=>x.fixture)];
  assert.deepEqual(list(fixtureDirectory).sort(),expectedFiles.sort(),"E_FIXTURE_FILES");
  const cases=[], contexts=new Map();
  for(const row of manifest.effects) {
    const c=read(row.fixture); contexts.set(row.id,c);validateEffects(c,policy);
    for(const[index,event]of c.events.entries()) {
      const d=policy.events.find(e=>e.event_type===event.event_type);
      for(const profile of["schema","consumer_schema"])cases.push({id:row.id+"-"+index+"-"+profile,schema:resolveSchema(d[profile]),value:event,expected:"accept"});
    }
  }
  const vectors=read(fixtureDirectory+"event-v1-vectors.json");
  assert.equal(vectors.format_version,1,"E_VECTOR_FORMAT");
  const ids=vectors.cases.map(x=>x.id);assert.equal(new Set(ids).size,ids.length,"E_VECTOR_DUPLICATE");
  for(const row of vectors.cases) {
    const c=structuredClone(contexts.get(row.context));assert(c,"E_VECTOR_CONTEXT");
    for(const patch of row.patches) {
      const parent=pointer(c,patch.path.slice(0,patch.path.lastIndexOf("/"))),key=patch.path.slice(patch.path.lastIndexOf("/")+1);
      assert(parent && typeof parent==="object","E_PATCH_PARENT");
      if(patch.op==="remove"){assert(Object.hasOwn(parent,key),"E_PATCH_TARGET");delete parent[key];}
      else if(patch.op==="repeat") {
        assert(typeof patch.value==="string" && Number.isSafeInteger(patch.count) && patch.count<=131073,"E_PATCH_REPEAT");
        parent[key]=patch.value.repeat(patch.count);
      } else {assert.equal(patch.op,"set","E_PATCH_OPERATION");parent[key]=structuredClone(patch.value);}
    }
    if(row.kind==="semantic") {
      assert.throws(()=>validateEffects(c,policy),e=>e instanceof assert.AssertionError && e.message.includes(row.reason),"E_NEGATIVE_REASON:"+row.id);
    } else {
      const e=c.events[row.event_index??0],d=policy.events.find(x=>x.key===row.type);
      assert(d,"E_VECTOR_TYPE");assert(["producer","consumer"].includes(row.profile),"E_VECTOR_PROFILE");
      cases.push({id:row.id,schema:resolveSchema(row.profile==="producer"?d.schema:d.consumer_schema),value:e,expected:row.expected});
    }
  }
  const required=["tenant","aggregate-id","aggregate-version","tax-definition","price-sequence","price-contiguity","causation","missing-sibling","extra-event-replay","base-pair","barcode-presentation","http-price","http-snapshot","unknown-pair","size","base-snapshot-name","base-snapshot-quantities","base-snapshot-fractions","base-snapshot-state","base-snapshot-missing-result"];
  for(const id of required)assert(ids.includes(id),"E_NEGATIVE_COVERAGE:"+id);
  for(const d of policy.events) {
    const event=structuredClone([...contexts.values()].flatMap(x=>x.events).find(e=>e.event_type===d.event_type));
    const baseline=interpretKnown(event),{earlier,later}=syntheticProfiles(resolveSchema(d.consumer_schema));
    for(const hasExtension of [false,true]) {
      const v=structuredClone(event);v.schema_version=2;
      if(hasExtension)v.payload.extensions={display_label:"Synthetic compatible label"};
      assert.deepEqual(interpretKnown(v),baseline,"E_COMPATIBLE_INTERPRETATION");
      for(const[reader,schema]of Object.entries({earlier,later}))cases.push({id:"synthetic-"+d.key+"-"+reader+"-"+hasExtension,schema,value:v,expected:"accept"});
    }
    const v=structuredClone(event);v.schema_version=2;v.payload.extensions={display_label:42};
    for(const[reader,schema]of Object.entries({earlier,later}))cases.push({id:"synthetic-"+d.key+"-"+reader+"-invalid",schema,value:v,expected:"reject"});
    cases.push({id:"real-"+d.key+"-rejects-test-revision",schema:resolveSchema(d.consumer_schema),value:v,expected:"reject"});
    // Retained input is copied before any later master change; the interpreter
    // takes no current-master dependency. This is a static contract assertion.
    const retained=JSON.stringify(event),futureMaster=interpretKnown(event);
    if(futureMaster.product)futureMaster.product.name="Changed after capture";
    else if(futureMaster.price)futureMaster.price.amount="999";
    else if(futureMaster.presentation)futureMaster.presentation.conversion_factor="999";
    else futureMaster.name="Changed after capture";
    assert.deepEqual(interpretKnown(JSON.parse(retained)),baseline,"E_HISTORY_CAPTURE");
  }
  if(selfTest) {
    for(const mutate of[p=>p.events.pop(),p=>p.operation_effects.pop(),p=>p.compatibility.admitted_revisions.push(2),p=>p.maximum_bytes++]){
      const altered=structuredClone(policy);mutate(altered);
      assert.throws(()=>validateInventory(altered,manifest,asyncapi,data),e=>e instanceof assert.AssertionError && /E_/.test(e.message),"E_SELF_TEST_REASON");
    }
  }
  if(output) {
    fs.mkdirSync(output,{recursive:true});
    const lines=[];
    for(const c of cases) {
      assert(/^[A-Za-z0-9_-]+$/.test(c.id),"E_CASE_ID");
      for(const[file,v]of[[c.id+".schema.json",{$schema:dialect,...c.schema}],[c.id+".json",c.value]])fs.writeFileSync(path.join(output,file),JSON.stringify(v,null,2)+"\n",{flag:"wx"});
      lines.push([c.id,c.expected,c.id+".schema.json",c.id+".json"].join("\t"));
    }
    fs.writeFileSync(path.join(output,"cases.tsv"),lines.join("\n")+"\n",{flag:"wx"});
  }
  const result={events:4,effects:contexts.size,schema_cases:cases.length,semantic_negatives:vectors.cases.filter(x=>x.kind==="semantic").length,runtime_demonstrated:false};
  console.log("F1-07E contract gate passed: "+JSON.stringify(result));return result;
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href){
  const positional=process.argv.slice(2).filter(x=>!x.startsWith("--"));
  assert.equal(positional.length,1,"usage: node scripts/catalog/validate-events-v1.mjs <new-output-directory> [--self-test]");
  validateEvents(path.resolve(positional[0]),process.argv.includes("--self-test"));
}
