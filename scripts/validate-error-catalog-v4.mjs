import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseline = JSON.parse(readFileSync(resolve(root, "errors/error-catalog-v3.json"), "utf8"));
const candidate = JSON.parse(readFileSync(resolve(root, "errors/error-catalog-v4.json"), "utf8"));

function validate(previous, next) {
  if (previous.version !== 3 || next.version !== 4) throw new Error("catalog versions must be 3 and 4");
  if (next.errors.length !== previous.errors.length + 3) throw new Error("v4 must add exactly three errors");
  if (JSON.stringify(next.errors.slice(0, -3)) !== JSON.stringify(previous.errors))
    throw new Error("v4 must preserve every v3 entry unchanged and in order");
  if (new Set(next.errors.map((entry) => entry.code)).size !== next.errors.length)
    throw new Error("error codes must be unique");
  const additions = next.errors.slice(-3);
  const expected = [
    ["identity_access_denied", 403],
    ["identity_device_proof_invalid", 422],
    ["identity_reauthentication_required", 403],
  ];
  if (additions.some((entry, index) =>
    entry.code !== expected[index][0] ||
    entry.owner !== "identity-tenancy" ||
    JSON.stringify(entry.statuses) !== JSON.stringify([expected[index][1]]) ||
    entry.exposure !== "restricted" ||
    entry.retryable_by_default !== false))
    throw new Error("v4 additions must match the three restricted identity errors");
}

validate(baseline, candidate);
const bundlePath = process.argv.slice(2).find((arg) => arg !== "--self-test");
if (bundlePath) {
  const api = JSON.parse(readFileSync(resolve(bundlePath), "utf8"));
  function validateMembershipMfa(document) {
    if (document.info?.version !== "2.0.7") throw new Error("public identity contract must be v2.0.7");
    const response = document.paths?.["/tenancy/memberships"]?.get?.responses?.["403"];
    const content = response?.content?.["application/problem+json"];
    const example = content?.example;
    const required = content?.schema?.required;
    if (!response || !Array.isArray(required) ||
        !["type", "title", "status", "instance", "code", "trace_id", "retryable"].every((key) => required.includes(key)) ||
        example?.code !== "identity_mfa_required" || example?.status !== 403 ||
        example?.type !== "urn:opencomerix:problem:identity_mfa_required" ||
        example?.retryable !== false)
      throw new Error("listMyMemberships must publish 403 identity_mfa_required as Problem Details");
  }
  validateMembershipMfa(api);
  if (process.argv.includes("--self-test")) {
    for (const changed of [
      { ...api, paths: { ...api.paths, "/tenancy/memberships": { get: { responses: {} } } } },
      { ...api, paths: { ...api.paths, "/tenancy/memberships": { get: { responses: { "403": { content: { "application/problem+json": { schema: api.paths["/tenancy/memberships"].get.responses["403"].content["application/problem+json"].schema, example: { code: "identity_device_not_approved", status: 403 } } } } } } } } },
    ]) {
      let rejected = false;
      try { validateMembershipMfa(changed); } catch { rejected = true; }
      if (!rejected) throw new Error("membership MFA negative control was accepted");
    }
  }
}
if (process.argv.includes("--self-test")) {
  for (const changed of [
    { ...candidate, errors: candidate.errors.slice(1) },
    { ...candidate, errors: [...candidate.errors, candidate.errors.at(-1)] },
    { ...candidate, errors: [...candidate.errors.slice(0, -1), { ...candidate.errors.at(-1), statuses: [404] }] },
  ]) {
    let rejected = false;
    try { validate(baseline, changed); } catch { rejected = true; }
    if (!rejected) throw new Error("catalog negative control was accepted");
  }
}
console.log(`error catalog v4: ${candidate.errors.length} entries; v3 preserved; three restricted identity errors; membership MFA 403=${Boolean(bundlePath)}`);
