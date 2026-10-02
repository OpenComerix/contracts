import { assert, parse, manifestPath, root, validateContract, validateSemantics } from "./session-step-up-v1-common.mjs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const positional = args.filter((arg) => arg !== "--self-test");
const [publicFile, privateFile] = positional;
if (!publicFile || !privateFile) throw new Error("usage: node scripts/validate-session-step-up-v1.mjs <public-dereferenced-bundle.json> <private-dereferenced-bundle.json> [--self-test]");
const [publicApi, privateApi, policy, manifest] = await Promise.all([
  parse(resolve(publicFile)), parse(resolve(privateFile)),
  parse(resolve(root, "openapi/identity-gateway-delegation-policy-v2.json")), parse(manifestPath),
]);
const result = await validateContract(publicApi, privateApi, policy, manifest);
const scenarioResults = [];
for (const scenario of manifest.semantic_scenarios) {
  try {
    validateSemantics(scenario);
    assert(scenario.expected === "accept", `${scenario.id}: semantic scenario unexpectedly accepted`);
    scenarioResults.push(`${scenario.id}=accepted`);
  } catch (error) {
    if (scenario.expected !== "reject" || typeof scenario.invariant !== "string" || !error.message.startsWith(`${scenario.invariant}:`)) throw error;
    scenarioResults.push(`${scenario.id}=rejected(${scenario.invariant})`);
  }
}
if (selfTest) {
  let controlsRun = 0;
  const controls = [
    ["missing-session-binding", (x) => { delete x.session.id; }, "session.account_binding"],
    ["wrong-purpose-is-rate-limit-bucket", (x) => { x.challenge.purpose = "session_step_up"; }, "challenge.purpose"],
    ["authority-added", (x) => { x.effect.active_tenant = "org-unapproved"; x.effect.permissions = ["owner"]; }, "effect.authority_preserved"],
    ["stepup-expiry-extended", (x) => { x.effect.expires_at = "2026-10-02T12:20:00Z"; }, "effect.expires_at"],
  ];
  for (const [id, mutate, expected] of controls) {
    const scenario = structuredClone(manifest.semantic_scenarios.find((item) => item.expected === "accept" && item.session.status === "restricted"));
    mutate(scenario);
    let rejected = false;
    try { validateSemantics(scenario); } catch (error) { rejected = error.message.startsWith(`${expected}:`); }
    assert(rejected, `self-test ${id} failed: expected semantic invariant ${expected}`);
    controlsRun += 1;
  }
  const transitionControls = [
    ["expired-challenge", (x) => { x.at = "2026-10-02T12:06:00Z"; x.effect.reauthenticated_at = x.at; }, "challenge.not_expired"],
    ["confirmation-before-challenge-creation", (x) => { x.at = "2026-10-02T12:00:00Z"; x.challenge.created_at = "2026-10-02T12:03:00Z"; x.effect.reauthenticated_at = x.at; }, "challenge.confirmation_not_before_creation"],
    ["prior-step-up-metadata-required", (x) => { delete x.effect.prior_step_up_expires_at_before; }, "effect.prior_step_up_preserved"],
    ["pending-challenge-must-be-substituted", (x) => { x.previous_pending_challenge = null; x.effect.previous_pending_challenge_substituted = true; }, "challenge.previous_pending_substituted"],
    ["recovery-expiry-cannot-be-paired-extension", (x) => { x.effect.expires_at = "2026-10-02T12:30:00Z"; x.replay.original_effect_expires_at = x.effect.expires_at; }, "replay.original_effect_expiry"],
    ["recovery-original-confirmation-before-challenge-expiry", (x) => { x.effect.reauthenticated_at = "2026-10-02T12:06:00Z"; }, "replay.original_confirmation_before_challenge_expiry"],
    ["recovery-original-confirmation-not-after-recovery", (x) => { x.effect.reauthenticated_at = "2026-10-02T12:10:00Z"; }, "replay.original_confirmation_not_future"],
  ];
  for (const [id, mutate, expected] of transitionControls) {
    const templateId = id === "prior-step-up-metadata-required" || id === "pending-challenge-must-be-substituted" ? "challenge_create_restricted" : id.startsWith("recovery") ? "private_recovery_restricted" : "confirmation_restricted";
    const scenario = structuredClone(manifest.transition_templates[templateId]);
    if (id === "prior-step-up-metadata-required" || id === "pending-challenge-must-be-substituted") {
      scenario.previous_pending_challenge = { id: "challenge-old-a", account_id: "account-a", session_id: "session-a", status: "pending" };
      scenario.effect.previous_pending_challenge_substituted = true;
      scenario.effect.prior_step_up_valid_before = true; scenario.effect.prior_step_up_valid_after = true;
      scenario.effect.prior_step_up_expires_at_before = "2026-10-02T12:30:00Z";
      scenario.effect.prior_step_up_expires_at_after = "2026-10-02T12:30:00Z";
      if (id === "pending-challenge-must-be-substituted") { scenario.previous_pending_challenge = null; }
    }
    mutate(scenario);
    let rejected = false;
    try { validateSemantics(scenario); } catch (error) { rejected = error.message.startsWith(`${expected}:`); }
    assert(rejected, `self-test ${id} failed: expected transition invariant ${expected}`);
    controlsRun += 1;
  }
  const contractControl = async (id, mutate, expected) => {
    const nextPublic = structuredClone(publicApi), nextPrivate = structuredClone(privateApi), nextManifest = structuredClone(manifest);
    mutate(nextPublic, nextPrivate, nextManifest);
    let rejected = false;
    try { await validateContract(nextPublic, nextPrivate, policy, nextManifest, { fixtureLoader: async (path) => mutate.fixtureLoader ? mutate.fixtureLoader(path) : parse(path) }); }
    catch (error) { rejected = error.message.startsWith(expected); }
    assert(rejected, `self-test ${id} failed: expected contract invariant ${expected}`);
    controlsRun += 1;
  };
  await contractControl("fifth-credential-unrestricted", (a, b) => { const branch = b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp"); branch.properties.session_credential = { type: "string" }; }, "completeSessionStepUp: replay credential must remain canonical");
  await contractControl("fifth-branch-additional-properties", (a, b) => { b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp").additionalProperties = true; }, "completeSessionStepUp response: replay branch must be a strict object");
  await contractControl("fifth-original-request-diverged", (a, b) => { b.paths["/api/v1/internal/identity/session-rotation-replays"].post.requestBody.content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp").properties.original_request.properties.code.maxLength = 6; }, "completeSessionStepUp: replay original_request must be identical");
  await contractControl("fifth-result-status-changed", (a, b) => { b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp").properties.public_status.const = 201; }, "completeSessionStepUp: replay result must match");
  await contractControl("fifth-result-body-changed", (a, b) => { b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp").properties.public_body.required.pop(); }, "completeSessionStepUp: replay result must match");
  await contractControl("fifth-replay-marker-changed", (a, b) => { b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp").properties.replayed.const = false; }, "completeSessionStepUp: replay result must match");
  await contractControl("fifth-credential-sensitive-removed", (a, b) => { delete b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp").properties.session_credential["x-sensitive"]; }, "completeSessionStepUp: replay credential must remain canonical");
  await contractControl("fifth-credential-pattern-weakened", (a, b) => { b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp").properties.session_credential.pattern = ".*"; }, "completeSessionStepUp: replay credential must remain canonical");
  await contractControl("challenge-password-writeonly-removed", (a) => { a.paths["/identity/step-up-challenges"].post.requestBody.content["application/json"].schema.properties.password.writeOnly = false; }, "createSessionStepUpChallenge: must require only a writeOnly local password");
  await contractControl("confirmation-code-limit-weakened", (a) => { a.paths["/identity/step-up-confirmations"].post.requestBody.content["application/json"].schema.properties.code.maxLength = 999; }, "completeSessionStepUp: confirmation must bind challenge_id and a writeOnly TOTP/recovery code");
  await contractControl("confirmation-description-confuses-purpose-and-bucket", (a) => { a.paths["/identity/step-up-confirmations"].post.description = "Consume el desafío session_step_up; el bucket es step_up."; }, "completeSessionStepUp: description must distinguish challenge purpose");
  await contractControl("challenge-response-extra-property", (a) => { a.paths["/identity/step-up-challenges"].post.responses["201"].content["application/json"].schema.properties.extra = { type: "string" }; }, "createSessionStepUpChallenge: 201 response must be a strict object");
  await contractControl("challenge-id-not-uuidv7", (a) => { a.paths["/identity/step-up-challenges"].post.responses["201"].content["application/json"].schema.properties.challenge_id.pattern = "^.*$"; }, "createSessionStepUpChallenge: response challenge id/status/expiry wire constraints");
  await contractControl("replay-header-not-boolean", (a) => { a.paths["/identity/step-up-challenges"].post.responses["201"].headers["Idempotency-Replayed"].schema.type = "string"; }, "challenge: Idempotency-Replayed must be boolean");
  await contractControl("replay-header-examples-inverted", (a) => { a.paths["/identity/step-up-challenges"].post.responses["201"].headers["Idempotency-Replayed"].examples.first_effect.value = true; }, "challenge: Idempotency-Replayed examples must be boolean false/true");
  await contractControl("replay-header-removed", (a) => { delete a.paths["/identity/step-up-challenges"].post.responses["201"].headers["Idempotency-Replayed"]; }, "challenge: Idempotency-Replayed must be required");
  await contractControl("challenge-cookie-rotation-added", (a) => { a.paths["/identity/step-up-challenges"].post.responses["201"].headers["Set-Cookie"] = { schema: { type: "string" } }; }, "challenge creation must not rotate session cookie");
  await contractControl("confirmation-cookie-header-removed", (a) => { delete a.paths["/identity/step-up-confirmations"].post.responses["200"].headers["Set-Cookie"]; }, "confirmation 200 must rotate cookie/CSRF");
  await contractControl("confirmation-csrf-header-removed", (a) => { delete a.paths["/identity/step-up-confirmations"].post.responses["200"].headers["X-CSRF-Token"]; }, "confirmation 200 must rotate cookie/CSRF");
  await contractControl("challenge-location-pattern-weakened", (a) => { a.paths["/identity/step-up-challenges"].post.responses["201"].headers.Location.schema.pattern = "^/wrong$"; }, "challenge 201 Location must retain its exact UUIDv7 route pattern");
  await contractControl("public-credential-added", (a) => { a.paths["/identity/step-up-confirmations"].post.responses["200"].content["application/json"].schema.properties.session_credential = { type: "string" }; }, "public contract must not expose session_credential");
  await contractControl("confirmation-422-removed", (a) => { delete a.paths["/identity/step-up-confirmations"].post.responses["422"]; }, "completeSessionStepUp: missing required cataloged response 422");
  await contractControl("challenge-location-wrong", (a) => { a.paths["/identity/step-up-challenges"].post.responses["201"].headers.Location.example = "/wrong"; }, "challenge Location example must match");
  const successSchemaAt = (api) => api.paths["/identity/step-up-confirmations"].post.responses["200"].content["application/json"].schema;
  for (const timestamp of ["reauthenticated_at", "expires_at"]) {
    await contractControl(`public-${timestamp}-required-removed`, (a) => { successSchemaAt(a).required = successSchemaAt(a).required.filter((name) => name !== timestamp); }, "completeSessionStepUp: 200 fixed schema");
    await contractControl(`public-${timestamp}-type-weakened`, (a) => { successSchemaAt(a).properties[timestamp].type = "integer"; }, "completeSessionStepUp: 200 fixed schema");
    await contractControl(`public-${timestamp}-format-weakened`, (a) => { successSchemaAt(a).properties[timestamp].format = "date"; }, "completeSessionStepUp: 200 fixed schema");
  }
  await contractControl("public-private-success-schema-coherently-weakened", (a, b) => {
    const schema = successSchemaAt(a); schema.required = ["status"];
    const branch = b.paths["/api/v1/internal/identity/session-rotation-replays"].post.responses["200"].content["application/json"].schema.oneOf.find((item) => item.properties?.operation_id?.const === "completeSessionStepUp");
    branch.properties.public_body = structuredClone(schema);
  }, "completeSessionStepUp: 200 fixed schema");
  await contractControl("problem-example-missing", (a) => { delete a.paths["/identity/step-up-confirmations"].post.responses["500"].content["application/problem+json"].examples.internal_error; }, "published example missing from contract");
  await contractControl("problem-example-additional", (a) => { a.paths["/identity/step-up-challenges"].post.requestBody.content["application/json"].examples.uninventoried = { value: { password: "ejemplo-seguro-no-real" } }; }, "published step-up examples and manifest inventory differ bidirectionally");
  await contractControl("problem-example-altered", (a) => { a.paths["/identity/step-up-confirmations"].post.responses["503"].content["application/problem+json"].examples.dependency_unavailable.value.title = "alterado"; }, "completeSessionStepUp: published example differs from static fixture problem-dependency-unavailable.json");
  await contractControl("problem-example-duplicated", (a, b, m) => { m.published_examples.push(structuredClone(m.published_examples.find((row) => row.example_name === "rate_limited"))); }, "published example inventory duplicated");
  const wrongStatus = structuredClone(publicApi), wrongStatusManifest = structuredClone(manifest);
  wrongStatus.paths["/identity/step-up-challenges"].post.responses["401"].content["application/problem+json"].examples.session_invalid.value.status = 403;
  let catalogRejected = false;
  try {
    await validateContract(wrongStatus, privateApi, policy, wrongStatusManifest, { fixtureLoader: async (path) => { const fixture = await parse(path); if (path.endsWith("problem-session-invalid.json")) fixture.status = 403; return fixture; } });
  } catch (error) { catalogRejected = error.message.startsWith("createSessionStepUpChallenge: Problem Details code/status/retryable differs from error catalog v5"); }
  assert(catalogRejected, "self-test Problem Details status mutation was not rejected by the catalog v5 invariant");
  controlsRun += 1;
  const wrongCode = structuredClone(publicApi);
  wrongCode.paths["/identity/step-up-challenges"].post.responses["400"].content["application/problem+json"].example.code = "identity_mfa_required";
  let codeRejected = false;
  try {
    await validateContract(wrongCode, privateApi, policy, structuredClone(manifest), { fixtureLoader: async (path) => { const fixture = await parse(path); if (path.endsWith("problem-invalid-request.json")) fixture.code = "identity_mfa_required"; return fixture; } });
  } catch (error) { codeRejected = error.message.startsWith("createSessionStepUpChallenge: Problem Details code/status/retryable differs from error catalog v5"); }
  assert(codeRejected, "self-test Problem Details code mutation was not rejected by the approved catalog inventory");
  controlsRun += 1;
  const wrongCasePath = structuredClone(manifest);
  wrongCasePath.cases[0].path = "/wrong";
  let selectorRejected = false;
  try { await validateContract(publicApi, privateApi, policy, wrongCasePath); } catch (error) { selectorRejected = /operationId\/method\/path selector/.test(error.message); }
  assert(selectorRejected, "self-test case path mutation was not rejected by its exact operation selector invariant");
  controlsRun += 1;
  const wrongResponseStatus = structuredClone(manifest);
  wrongResponseStatus.cases.find((item) => item.status === "201").status = "200";
  selectorRejected = false;
  try { await validateContract(publicApi, privateApi, policy, wrongResponseStatus); } catch (error) { selectorRejected = /exact success status/.test(error.message); }
  assert(selectorRejected, "self-test response status mutation was not rejected by its exact operation status invariant");
  controlsRun += 1;
  const mutated = structuredClone(manifest);
  mutated.published_examples.pop();
  let rejected = false;
  try { await validateContract(publicApi, privateApi, policy, mutated); } catch (error) { rejected = /bidirectionally/.test(error.message); }
  assert(rejected, "self-test failed: removing an inventoried published example was not rejected");
  controlsRun += 1;
  globalThis.__sessionStepUpAutocontrols = controlsRun;
}
console.log(`Session step-up contract gate passed: operations=21 matrix=4+17 examples=${result.actualExamples} problem_examples=${result.problemExamples} structural_cases=${result.cases} semantic=${result.semantics}; autocontrols=${selfTest ? globalThis.__sessionStepUpAutocontrols : 0} rejected by expected invariants`);
for (const outcome of scenarioResults) console.log(`semantic ${outcome}`);
for (const outcome of result.transitionResults) console.log(`transition ${outcome}`);
