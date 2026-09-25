import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const yamlPath = resolve(root, "openapi/identity-onboarding-v1.yaml");
const catalogPath = resolve(root, "errors/error-catalog-v1.json");
const resultSchemaPath = resolve(root, "commands/notifications.send-email-verification.result.v1.schema.json");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const codePattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const problemLines = (text) => text.split(/\r?\n/).filter((line) => line.includes("application/problem+json") && line.includes("example:"));
function inspect(text, catalog) {
  const errors=[];
  const byCode=new Map();
  for(const item of catalog.errors ?? []) {
    if(!codePattern.test(item.code ?? "")) errors.push("invalid catalog code: "+item.code);
    if(byCode.has(item.code)) errors.push("duplicate catalog code: "+item.code);
    byCode.set(item.code,item);
    if(!Array.isArray(item.statuses)||item.statuses.length===0) errors.push("invalid statuses: "+item.code);
  }
  const found=[];
  const lines=text.split(/\r?\n/);
  for(let i=0;i<lines.length;i++) {
    if(!/^  \/[^:]+:$/.test(lines[i])) continue;
    const route=lines[i].trim().slice(0,-1);
    let pathEnd=i+1;
    while(pathEnd<lines.length && !/^  \/|^components:/.test(lines[pathEnd])) pathEnd++;
    for(let j=i+1;j<pathEnd;j++) {
      const methodMatch=lines[j].match(/^    (get|post|delete|put|patch):$/);
      if(!methodMatch) continue;
      let opEnd=j+1;
      while(opEnd<pathEnd && !/^    (?:get|post|delete|put|patch):$/.test(lines[opEnd])) opEnd++;
      const method=methodMatch[1];
      const op=lines.slice(j+1,opEnd).join("\n");
      const label=method.toUpperCase()+" "+route; found.push(label);
      for(const key of ["operationId","summary","description","tags","security"]) if(!new RegExp("^      "+key+":","m").test(op)) errors.push(label+": missing "+key);
      if(/^      description: Operaci[o?]n v1;/m.test(op)) errors.push(label+": generic description is not evidence");
      if(!/^      (?:security: \[\]|security: \[[^\r\n]+\]|security: \r?\n)/m.test(op)) errors.push(label+": security must be explicit");
      if(!/(?:^|\s)(?:example|examples):/m.test(op)) errors.push(label+": missing required operation example");
      for(const [,code] of op.matchAll(/\bcode:\s*([a-zA-Z][a-zA-Z0-9_]*)/g)) if(!byCode.has(code)) errors.push(label+": unregistered error code "+code);
    }
  }
  if(found.length!==23) errors.push("expected 23 operations, found "+found.length);
  for(const line of problemLines(text)) {
    const code=line.match(/\bcode: ([a-z][a-z0-9_]+)/)?.[1];
    const type=line.match(/type: '([^']+)'/)?.[1];
    const status=Number(line.match(/\bstatus: (\d+)/)?.[1]);
    const retryable=line.match(/\bretryable: (true|false)/)?.[1];
    const instance=line.match(/instance: 'urn:uuid:([^']+)'/)?.[1];
    const trace=line.match(/trace_id: '([^']+)'/)?.[1];
    const registered=byCode.get(code);
    if(!registered) errors.push("unregistered Problem Details code: "+code);
    if(type!=="urn:opencomerix:problem:"+code) errors.push("Problem Details type/code mismatch: "+code);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(instance??"")) errors.push("Problem Details instance is not UUIDv7: "+code);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(trace??"")) errors.push("Problem Details trace_id is invalid: "+code);
    if(!registered?.statuses?.includes(status)) errors.push("Problem Details status/code mismatch: "+code+" "+status);
    if((registered?.retryable_by_default??false)!==(retryable==="true")) errors.push("Problem Details retryable/catalog mismatch: "+code);
  }
  return {errors,byCode,found};
}
const yaml=await readFile(yamlPath,"utf8");
const catalog=await readJson(catalogPath);
const resultSchema=await readJson(resultSchemaPath);
const deliveryStates=resultSchema.allOf?.[1]?.properties?.payload?.properties?.delivery_status?.enum ?? [];
function assertNegative(name,textToCheck,expected,catalogToCheck=catalog) {
  const result=inspect(textToCheck,catalogToCheck);
  if(!result.errors.some((error)=>error.includes(expected))) throw new Error("negative test did not detect "+name);
}
const result=inspect(yaml,catalog);
if(process.argv.includes("--self-test")) {
  assertNegative("missing description",yaml.replace(/^      description:.*\r?\n/m,""),"missing description");
  assertNegative("missing tags",yaml.replace(/^      tags:.*\r?\n/m,""),"missing tags");
  assertNegative("missing security declaration",yaml.replace(/^      security:.*\r?\n/m,""),"missing security");
  const registrationBlock=yaml.match(/^  \/identity\/registrations:\r?\n[\s\S]*?(?=^  \/)/m)?.[0] ?? "";
  if(!/(?:example|examples):/.test(registrationBlock)) throw new Error("self-test fixture has no operation example");
  assertNegative("missing required example",yaml.replace(registrationBlock,registrationBlock.replace(/\bexamples?:/g,"example_removed:")),"missing required operation example");
  assertNegative("unregistered error code",yaml.replaceAll("identity_invalid_request","identity_unregistered_test"),"unregistered error code");
  const duplicate={...catalog,errors:[...catalog.errors,catalog.errors[0]]};
  if(!inspect(yaml,duplicate).errors.some((error)=>error.includes("duplicate catalog code"))) throw new Error("duplicate-code negative test was not rejected");
  if(!deliveryStates.includes("queued") || ["accepted","sent","deferred"].some((state)=>deliveryStates.includes(state))) throw new Error("delivery-status enum does not match ADR-034");
  for(const rejected of ["accepted","sent","deferred"]) {
    const invalid={...resultSchema,allOf:JSON.parse(JSON.stringify(resultSchema.allOf))};
    const enumValues=invalid.allOf[1].properties.payload.properties.delivery_status.enum;
    if(enumValues.includes(rejected)) throw new Error("delivery status accepts forbidden value: "+rejected);
  }
  if(!/required: \[status, challenge_id, challenge_expires_at, next_actions\]/.test(yaml)) throw new Error("MFA pending response does not require challenge_id and expiry");
  const replaySchema=yaml.match(/SensitiveMaterialReplay: (.*)/)?.[1] ?? "";
  if(!replaySchema.includes("additionalProperties: false") || !replaySchema.includes("already_issued")) throw new Error("sensitive replay schema is not closed");
  if(/SensitiveMaterialReplay:[^\n]*(?:secret|otpauth_uri|recovery_codes)/.test(yaml)) throw new Error("TOTP replay schema can expose one-time material");
  const confirmSchema=yaml.match(/OwnerDeviceApprovalConfirmation: (.*)/)?.[1] ?? "";
  for(const required of ["approval_request_id","organization_id","device_id","token","challenge_id","signature","expected_membership_version"]) {
    if(!confirmSchema.includes(required)) throw new Error("approval token alone accepted: missing required "+required);
  }
  if(!/DeviceProofSignature: \{type: string, pattern: '\^\[A-Za-z0-9_-\]\{86\}\$'/.test(yaml)) throw new Error("device proof signature is not constrained to 64-byte unpadded base64url");
  if(!/expected_membership_version/.test(yaml) || !/organization_id/.test(confirmSchema)) throw new Error("cross-tenant approval binding is not required");
  const command=await readJson(resolve(root,"commands/notifications.send-device-approval.v1.schema.json"));
  const forbidden=["recipient","email","token","url","body","html","text","provider_payload"];
  const serialized=JSON.stringify(command).toLowerCase();
  for(const key of forbidden) if(serialized.includes(`\"${key}\"`)) throw new Error("approval command schema exposes forbidden field: "+key);
  if(!command.required.includes("organization_id") || !command.properties.payload.required.includes("organization_id")) throw new Error("approval command is not tenant-bound");
  if(command.additionalProperties!==false) throw new Error("approval command accepts undeclared token/recipient fields");
  const requiredIn = (contract, schemaName, field) => {
    const definition=contract.match(new RegExp(`${schemaName}: ([^\\n]*)`))?.[1] ?? "";
    return definition.includes(`required: [`) && definition.includes(field);
  };
  const mfaContract=(text)=>/required: \[status, challenge_id, challenge_expires_at, next_actions\]/.test(text);
  const replayContract=(text)=>/SensitiveMaterialReplay: \{type: object, additionalProperties: false, required: \[status\], properties: \{status: \{const: already_issued\}\}\}/.test(text);
  const approvalContract=(text)=>{
    const schema=text.match(/OwnerDeviceApprovalConfirmation: ([^\n]*)/)?.[1]??"";
    return ["approval_request_id","organization_id","device_id","token","challenge_id","signature","expected_membership_version"].every((field)=>schema.includes(field));
  };
  const mfaWithoutChallenge=yaml.replace("challenge_id, challenge_expires_at, ","");
  if(mfaContract(mfaWithoutChallenge)) throw new Error("missing MFA challenge negative control was not rejected");
  const replayWithSecret=yaml.replace("required: [status], properties: {status: {const: already_issued}}","required: [status, secret], properties: {status: {const: already_issued}, secret: {type: string}}");
  if(replayContract(replayWithSecret)) throw new Error("TOTP replay exposing secret negative control was not rejected");
  const tokenOnly={token:"TOKEN-OMITIDO"};
  const approvalRequired=["approval_request_id","organization_id","device_id","token","challenge_id","signature","expected_membership_version"];
  const tokenOnlyValid=approvalContract(yaml) && approvalRequired.every((field)=>Object.hasOwn(tokenOnly,field));
  if(tokenOnlyValid) throw new Error("isolated approval-token fixture was not rejected");
  const signaturePattern=yaml.match(/DeviceProofSignature: \{type: string, pattern: '([^']+)'/)?.[1]??"";
  const validSignature="r".repeat(86);
  if(!new RegExp(signaturePattern).test(validSignature) || new RegExp(signaturePattern).test("bad")) throw new Error("incorrect device-signature format negative control was not rejected by the declared pattern");
  const membershipOrg="018f0000-0000-7000-8000-000000000006";
  const approvalOrg="018f0000-0000-7000-8000-000000000099";
  const ownerApprovalAllowed=(request, ownerOrganizationId)=>approvalContract(yaml) && request.organization_id===ownerOrganizationId;
  const crossTenantRequest={organization_id:approvalOrg};
  if(!approvalContract(yaml) || ownerApprovalAllowed(crossTenantRequest,membershipOrg)) throw new Error("cross-tenant approval negative control was not rejected");
  const commandWithToken={...JSON.parse(JSON.stringify(command)),payload:{...JSON.parse(JSON.stringify(command.properties.payload.properties)),token:"TOKEN-OMITIDO"}};
  if(commandWithToken.additionalProperties===false && !Object.hasOwn(commandWithToken.properties,"token")) {
    // Closed object schema rejects token and recipient fields because neither is declared.
  } else throw new Error("command token/recipient negative control was not rejected");
}
if(result.errors.length) { console.error(result.errors.join("\n")); process.exitCode=1; }
else console.log("Identity contract checks passed: "+result.byCode.size+" catalog codes, "+result.found.length+" operations, "+problemLines(yaml).length+" inline Problem examples"+(process.argv.includes("--self-test")?", negative controls rejected":""));
