import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [bundleArg, ...args] = process.argv.slice(2);
if (!bundleArg || args.some((arg) => arg !== "--self-test")) throw new Error("usage: node scripts/validate-owner-session-flow-v1.mjs <public-v2-dereferenced.json> [--self-test]");
const api = JSON.parse(await readFile(resolve(bundleArg), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "openapi/owner-session-flow-v1-fixtures.json"), "utf8"));
const selfTest = args.includes("--self-test");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const fixture = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
function operation(document, row) {
  const op = document.paths?.[row.path]?.[row.method];
  assert(op?.operationId === row.operationId, `${row.id}: exact method/path must map to ${row.operationId}`);
  return op;
}
function contextInvariant(value, label, transition = {}) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label}: SessionContext must be an object`);
  const restricted = value.session?.status === "restricted" || value.session?.status === "mfa_pending";
  if (restricted) {
    assert(value.active_organization === null, `${label}: restricted session must not contain active_organization`);
    assert(value.active_membership === null, `${label}: restricted session must not contain active_membership`);
    assert(Array.isArray(value.permissions) && value.permissions.length === 0, `${label}: restricted session must not contain tenant permissions`);
    assert(Array.isArray(value.scopes) && value.scopes.length === 0, `${label}: restricted session must not contain tenant scopes`);
  }
  if (value.session?.status === "active" && value.active_organization && value.active_membership) {
    assert(value.active_organization.organization_id === value.active_membership.organization_id, `${label}: active organization and membership must agree`);
    assert(value.active_membership.status === "active", `${label}: active context requires an active membership`);
    assert(value.device?.status === "approved", `${label}: active context requires the session-bound device to be approved`);
    assert(value.mfa?.status === "enrolled", `${label}: active context requires eligible MFA`);
    assert(value.permissions?.length > 0 && value.scopes?.some((scope) => scope.scope_type === "organization" && scope.scope_id === value.active_organization.organization_id), `${label}: active context requires effective permissions and matching organization scope`);
  }
  if (transition.requires_tested_device_binding === true) {
    assert(typeof transition.tested_device_id === "string" && transition.tested_device_id.length > 0, `${label}: tested_device_id is required to prove session/device binding`);
    assert(value.device?.device_id === transition.tested_device_id, `${label}: tested device must match the device bound to the session`);
  }
  if (transition.destination_organization_id) assert(value.active_organization?.organization_id === transition.destination_organization_id, `${label}: active organization must match the explicit challenge destination`);
  assert(Array.isArray(value.next_actions) && value.next_actions.every((item) => typeof item === "string"), `${label}: next_actions must remain navigation strings`);
  if (transition.navigation) validateNavigation(value, transition.navigation, label);
  return restricted;
}
function validateNavigation(value, p, label) {
  assert(p && typeof p === "object" && !Array.isArray(p), `${label}: navigation preconditions metadata is required`);
  for (const key of ["email_verified", "mfa_eligible", "login_challenge_pending", "session_device_linked", "first_bootstrap_eligible", "candidate_pending_linked", "owner_membership_active", "other_device_usable_approved", "session_device_globally_approved"]) {
    assert(typeof p[key] === "boolean", `${label}: navigation precondition ${key} must be explicit boolean metadata`);
  }
  const actions = value.next_actions;
  const restricted = value.session?.status === "restricted";
  const eligible = {
    verify_email: p.email_verified === false,
    enroll_mfa: value.mfa?.status === "required" || p.mfa_eligible === false,
    complete_mfa: value.session?.status === "mfa_pending" && p.login_challenge_pending === true,
    register_device: p.email_verified && p.mfa_eligible && !p.login_challenge_pending && !p.session_device_linked,
    create_organization: restricted && p.email_verified && p.mfa_eligible && p.first_bootstrap_eligible,
    approve_device: restricted && p.candidate_pending_linked && p.owner_membership_active && p.other_device_usable_approved,
    select_organization: p.mfa_eligible && p.session_device_linked && p.session_device_globally_approved && value.device?.status === "approved",
  };
  for (const action of actions) {
    assert(Object.hasOwn(eligible, action), `${label}: unknown next_action ${action}`);
    assert(eligible[action], `${label}: next_actions ${action} contradicts its required navigation preconditions`);
    if (action === "approve_device") {
      assert(typeof p.candidate_device_id === "string" && p.candidate_device_id === value.device?.device_id && typeof p.owner_organization_id === "string", `${label}: approve_device requires an explicitly linked pending candidate and OWNER organization`);
      assert(typeof p.owner_membership_id === "string" && p.owner_membership_role === "OWNER" && p.owner_membership_status === "active" && p.owner_membership_organization_id === p.owner_organization_id, `${label}: approve_device requires an identified active OWNER membership in the pending device organization`);
      assert(typeof p.other_device_id === "string" && p.other_device_id !== p.candidate_device_id && p.other_device_organization_id === p.owner_organization_id && p.other_device_status === "approved" && p.other_device_usable_approved === true, `${label}: approve_device requires a distinct usable approved device in the same OWNER organization`);
    }
    if (action === "create_organization") {
      assert(Number.isInteger(p.membership_count) && p.membership_count >= 0 && typeof p.bootstrap_previously_completed === "boolean" && p.first_bootstrap_eligible === (p.membership_count === 0 && !p.bootstrap_previously_completed), `${label}: create_organization requires explicit zero-membership, no-prior-bootstrap eligibility`);
    }
    if (action === "select_organization") {
      assert(typeof p.tested_device_id === "string" && p.tested_device_id === value.device?.device_id && p.session_device_linked === true, `${label}: select_organization requires a tested, session-bound device`);
    }
  }
}
function loginNavigationInvariant(value, p, label) {
  assert(value && (value.status === "restricted" || value.status === "mfa_pending"), `${label}: LoginResponse status is required for navigation evaluation`);
  const context = {
    session: { status: value.status },
    mfa: { status: p?.mfa_status ?? (p?.mfa_eligible ? "enrolled" : "required") },
    device: p?.session_device_linked ? { device_id: p.device_id ?? "test-device", status: p.device_status ?? "approved" } : { status: "not_registered" },
    next_actions: value.next_actions,
  };
  validateNavigation(context, p, label);
}
const requiredDescriptions = [
  ["registerGlobalAccount", /no vincula implícitamente una sesión/i],
  ["createSession", /nunca conceden autoridad tenant/i],
  ["completeMfaChallenge", /no concede autoridad tenant/i],
  ["getCurrentSession", /register_device requiere[\s\S]*create_organization requiere[\s\S]*approve_device requiere[\s\S]*select_organization requiere/i],
  ["proveRegisteredDevicePossession", /sin organization_id explícito[\s\S]*permanece restricted/i],
  ["proveRegisteredDevicePossession", /renew_session[\s\S]*conserva el mismo dispositivo y tenant activos/i],
  ["requestOwnerDeviceSelfApproval", /huella de idempotencia/i],
  ["createInitialOrganization", /camino atómico propio/i],
  ["selectActiveOrganization", /sesión restricted elegible[\s\S]*membresía activa y versión[\s\S]*aprobación vigente/i],
];
function validate(document, candidate, filenames, bodies) {
  assert(document.info?.version === "2.1.0", "public OpenAPI version must be 2.1.0");
  assert(candidate.fixture_set === "owner-session-flow-v1", "fixture manifest id mismatch");
  const fixtureRows = [...candidate.scenarios.filter((row) => row.fixture), ...candidate.semantic_negatives];
  const scenarioIds = candidate.scenarios.map((row) => row.id).concat(candidate.semantic_negatives.map((row) => row.id));
  assert(scenarioIds.every(Boolean) && new Set(scenarioIds).size === scenarioIds.length, "scenario identifiers must be present and unique");
  const paths = fixtureRows.map((row) => row.fixture);
  assert(new Set(paths).size === paths.length, "fixture manifest contains a duplicate path");
  const indexed = paths.map((path) => path.split("/").at(-1)).sort();
  const published = filenames.filter((name) => name.startsWith("owner-session-flow-v1-") && name.endsWith(".json")).sort();
  assert(same(indexed, published), "owner-session-flow fixture inventory has an extra or missing artifact");
  for (const row of candidate.scenarios.filter((item) => item.fixture_schema)) {
    assert(row.role === "http_response" || row.role === "session_observation", `${row.id}: fixture role must distinguish immediate response from GET session observation`);
    assert(row.media_type === "application/json", `${row.id}: exact response media type must be application/json`);
    const op = operation(document, row);
    const response = op.responses?.[row.status];
    const selected = response?.content?.[row.media_type]?.schema;
    const schema = document.components?.schemas?.[row.schema ?? row.fixture_schema];
    assert(response && selected && !selected.$ref && schema && same(selected, schema), `${row.id}: exact method/path/status/media type response schema mismatch`);
    assert(row.schema === row.fixture_schema, `${row.id}: fixture schema mapping mismatch`);
    assert(bodies.has(row.fixture), `${row.id}: fixture is not loaded from the manifest`);
  }
  for (const [id, pattern] of requiredDescriptions) {
    const row = candidate.scenarios.find((item) => item.operationId === id) ?? candidate.semantic_negatives.find((item) => item.operationId === id);
    assert(row, `${id}: manifest operation row missing`);
    const op = operation(document, row);
    assert(pattern.test(op.description ?? ""), `${id}: normative description was removed or weakened`);
  }
  const ownerDescription = operation(document, candidate.scenarios.find((row) => row.operationId === "requestOwnerDeviceSelfApproval")).description ?? "";
  for (const clause of ["OwnerDeviceApprovalPending original", "no reenvía correo", "no extiende"]) assert(ownerDescription.includes(clause), `requestOwnerDeviceSelfApproval: required clause missing: ${clause}`);
  const ownerRequirements = `${ownerDescription}\n${operation(document, candidate.scenarios.find((row) => row.operationId === "requestOwnerDeviceSelfApproval"))["x-owner-session-flow-r8"] ?? ""}`;
  assert(/otro dispositivo aprobado y utilizable en esa organizaci[oó]n/i.test(ownerRequirements) && /sin el otro dispositivo utilizable la recuperaci[oó]n excepcional permanece cerrada/i.test(ownerRequirements), "requestOwnerDeviceSelfApproval: must require an alternate usable approved device and keep exceptional recovery closed without it");
  const confirmationOperation = operation(document, candidate.scenarios.find((row) => row.operationId === "confirmOwnerDeviceSelfApproval"));
  const confirmationDescription = `${confirmationOperation.description ?? ""}\n${confirmationOperation["x-owner-session-flow-r8"] ?? ""}`;
  assert(/otro dispositivo aprobado y utilizable en esa organizaci[oó]n/i.test(confirmationDescription) && /dentro de la transacci[oó]n revalida/i.test(confirmationDescription) && /sin ese dispositivo, la recuperaci[oó]n excepcional permanece cerrada/i.test(confirmationDescription), "confirmOwnerDeviceSelfApproval: must revalidate alternate-device eligibility transactionally and fail closed");
  assert(/vincula el candidato probado a esta sesi[oó]n/i.test(confirmationDescription) && /no crea un v[ií]nculo gen[eé]rico de cuenta/i.test(confirmationDescription) && /permanece restricted/i.test(confirmationDescription), "confirmOwnerDeviceSelfApproval: session binding and restricted post-effect requirements missing");
  const contextRows = candidate.scenarios.filter((row) => row.kind === "context");
  for (const row of contextRows) {
    const op = operation(document, row);
    const response = op.responses?.[row.status];
    const publishedSchema = response?.content?.["application/json"]?.schema;
    assert(response && publishedSchema && !publishedSchema.$ref, `${row.id}: exact response status/schema must be dereferenced`);
    const exactSchema = document.components?.schemas?.[row.schema];
    assert(exactSchema && same(publishedSchema, exactSchema), `${row.id}: manifest schema must equal the operation response schema`);
    const body = bodies.get(row.fixture);
    assert(body, `${row.id}: fixture must be loaded`);
    if (row.schema === "SessionContext") {
      const isRestricted = contextInvariant(body, row.id, row.transition);
      assert(row.transition?.navigation, `${row.id}: every published SessionContext requires explicit navigation preconditions`);
      assert((row.state === "restricted") === isRestricted, `${row.id}: fixture state differs from its scenario`);
      if (row.explicit_destination) assert(row.state === "active", `${row.id}: explicit destination must produce active context after all checks`);
      if (row.id === "restricted-after-mfa") {
        assert(row.transition?.email_verified === true && row.transition?.mfa_eligible === true && row.transition?.session_device_linked === false, `${row.id}: post-MFA no-device transition metadata is incomplete`);
        assert(body.account.email_status === "verified" && body.mfa.status === "enrolled" && !body.device.device_id && same(body.next_actions, ["register_device", "create_organization"]), `${row.id}: no-device post-MFA navigation must offer registration/bootstrap only`);
        assert(!body.next_actions.includes("approve_device") && !body.next_actions.includes("select_organization"), `${row.id}: no-device post-MFA state cannot offer approval or selection`);
      }
      if (row.explicit_destination) {
        const t = row.transition ?? {};
        assert(t.membership_active === true && t.membership_version_current === true && t.mfa_eligible === true && t.organization_device_approval === true && t.permissions_and_scopes_valid === true, `${row.id}: destination activation requires every approved authorization precondition`);
      }
      if (row.challenge_purpose === "renew_session") {
        const prior = bodies.get(row.prior_tenant_fixture);
        assert(prior && !contextInvariant(prior, `${row.id} prior state`), `${row.id}: prior tenant context must be active`);
        assert(same(body.device, prior.device) && same(body.active_organization, prior.active_organization) && same(body.active_membership, prior.active_membership) && same(body.permissions, prior.permissions) && same(body.scopes, prior.scopes), `${row.id}: renew_session must preserve the existing device and tenant context`);
      }
      const examples = response.content["application/json"].examples;
      if (row.published_examples) {
        assert(same(Object.keys(examples ?? {}).sort(), [...row.published_examples].sort()), `${row.id}: published example inventory changed`);
        for (const name of row.published_examples) assert(same(examples[name]?.value, body), `${row.id}: published example ${name} differs from complete fixture`);
      }
    }
    if (row.current_context_example) {
      const current = document.paths?.["/identity/session"]?.get;
      const currentResponse = current?.responses?.["200"];
      const currentSchema = currentResponse?.content?.["application/json"]?.schema;
      assert(current?.operationId === "getCurrentSession" && currentSchema && same(currentSchema, document.components?.schemas?.SessionContext), `${row.id}: GET /identity/session must publish exact SessionContext schema`);
      const currentExamples = currentResponse.content["application/json"].examples;
      assert(currentExamples?.[row.current_context_example]?.value && same(currentExamples[row.current_context_example].value, body), `${row.id}: current-session example differs from complete fixture`);
    }
  }
  for (const row of candidate.scenarios.filter((item) => item.current_context_example && item.kind !== "context")) {
    const body = bodies.get(row.fixture);
    contextInvariant(body, row.id, row.transition);
    assert(row.transition?.navigation, `${row.id}: every observed SessionContext requires explicit navigation preconditions`);
    const current = document.paths?.["/identity/session"]?.get;
    const response = current?.responses?.["200"];
    const schema = response?.content?.["application/json"]?.schema;
    assert(current?.operationId === "getCurrentSession" && schema && same(schema, document.components?.schemas?.SessionContext), `${row.id}: GET /identity/session must publish exact SessionContext schema`);
    const example = response.content["application/json"].examples?.[row.current_context_example];
    assert(example?.value && same(example.value, body), `${row.id}: current-session example differs from complete fixture`);
  }
  for (const row of candidate.scenarios.filter((item) => item.schema === "LoginResponse")) {
    const body = bodies.get(row.fixture);
    assert(row.transition?.navigation, `${row.id}: LoginResponse requires explicit navigation preconditions`);
    loginNavigationInvariant(body, row.transition.navigation, row.id);
  }
  const proofDescription = operation(document, candidate.scenarios.find((row) => row.operationId === "proveRegisteredDevicePossession")).description ?? "";
  assert(/prueba válida vincula el dispositivo probado a la sesión/i.test(proofDescription) && /cookie siempre se rota/i.test(proofDescription), "proveRegisteredDevicePossession: successful proof must bind the tested device to its session and rotate atomically");
  const publishedInventory = new Map();
  const addPublished = (row, name) => {
    const key = `${row.operationId}|${row.method}|${row.path}|${row.status}|${row.media_type}`;
    const names = publishedInventory.get(key) ?? new Map();
    assert(!names.has(name), `${row.id}: duplicate published example inventory key ${name}`);
    names.set(name, { fixture: row.fixture, source: row.published_source ?? row.fixture, pointer: row.published_source_pointer ?? null }); publishedInventory.set(key, names);
  };
  for (const row of candidate.scenarios) {
    for (const name of row.published_examples ?? []) addPublished(row, name);
    if (row.current_context_example) addPublished({ ...row, operationId: "getCurrentSession", method: "get", path: "/identity/session", status: "200", media_type: "application/json" }, row.current_context_example);
  }
  for (const [key, expected] of publishedInventory) {
    const [operationId, method, path, status, mediaType] = key.split("|");
    const op = document.paths?.[path]?.[method];
    assert(op?.operationId === operationId, `published example inventory selector changed: ${key}`);
    const examples = op.responses?.[status]?.content?.[mediaType]?.examples ?? {};
    assert(same(Object.keys(examples).sort(), [...expected.keys()].sort()), `${operationId}: published response example inventory has a missing, altered or unindexed example (expected ${[...expected.keys()].sort().join(",")}; found ${Object.keys(examples).sort().join(",")})`);
    for (const [name, source] of expected) {
      const entry = examples[name]; const body = bodies.get(source.fixture);
      const sourceBody = bodies.get(source.source);
      const published = source.pointer ? sourceBody?.[source.pointer] : sourceBody;
      assert(body && same(published, body) && (entry?.value ? same(entry.value, body) : entry?.externalValue === source.source.replace(/^openapi\//, "")), `${operationId}: published response example ${name} differs from its complete inventoried fixture`);
    }
  }
  const request = candidate.scenarios.find((row) => row.operationId === "requestOwnerDeviceSelfApproval" && row.kind === "pending");
  assert(request, "owner request pending response fixture missing");
  const ownerOp = operation(document, request);
  const ownerResponse = ownerOp.responses?.[request.status];
  const ownerSchema = ownerResponse?.content?.["application/json"]?.schema;
  assert(ownerResponse && ownerSchema && !ownerSchema.$ref, "owner request exact response status/schema must be present and dereferenced");
  assert(request.schema === "OwnerDeviceApprovalPending" && ownerSchema && same(ownerSchema, document.components.schemas[request.schema]), "requestOwnerDeviceSelfApproval must retain its exact OwnerDeviceApprovalPending schema");
  const idem = ownerResponse.headers?.["Idempotency-Replayed"];
  assert(idem?.schema?.type === "boolean" && !Object.hasOwn(idem.schema, "enum"), "owner Idempotency-Replayed must be boolean");
  assert(idem.examples?.first_effect?.value === false && typeof idem.examples.first_effect.value === "boolean" && idem.examples?.exact_replay?.value === true && typeof idem.examples.exact_replay.value === "boolean", "owner Idempotency-Replayed examples must be boolean false/true");
  assert(!ownerResponse.headers?.["Set-Cookie"] && !ownerResponse.headers?.["X-CSRF-Token"], "owner approval request must not declare rotation headers");
  const pending = bodies.get(request.fixture);
  assert(pending?.status === "pending_approval" && pending.approval_request_id && pending.organization_id && pending.device_id && pending.expires_at && Number.isInteger(pending.version), "owner pending fixture must preserve the complete original response");
  assert(pending.device_id === request.transition?.candidate_device_id && pending.organization_id === request.transition?.organization_id && request.transition?.other_device_usable_approved === true && request.transition?.owner_membership_active === true && request.transition?.mfa_eligible === true, "owner request transition requires a matching candidate, explicit organization, OWNER membership, eligible MFA and another usable approved device");
  assert(!Object.hasOwn(pending, "already_issued") && !Object.hasOwn(pending, "idempotency_replayed"), "owner pending body must not contain replay metadata or already_issued");
  const bootstrapScenario = candidate.scenarios.find((row) => row.id === "active-after-atomic-bootstrap");
  const bootstrapOperation = bootstrapScenario && operation(document, bootstrapScenario);
  const bootstrapRequest = bootstrapOperation?.requestBody?.content?.["application/json"]?.example;
  const bootstrapResponse = bootstrapScenario && bodies.get(bootstrapScenario.fixture);
  assert(bootstrapScenario?.atomic_bootstrap === true && bootstrapScenario.transition?.first_owner_without_memberships === true && bootstrapScenario.transition?.email_verified === true && bootstrapScenario.transition?.mfa_eligible === true && bootstrapScenario.transition?.device_possession_proven_in_transaction === true, "bootstrap scenario must retain its own eligible first-owner atomic path");
  assert(bootstrapRequest?.device_id === bootstrapResponse?.device_approval?.device_id && bootstrapResponse?.device_approval?.status === "approved", "bootstrap request and response must bind the same tested device and atomically approve it");
  const confirmationScenario = candidate.scenarios.find((row) => row.operationId === "confirmOwnerDeviceSelfApproval");
  const confirmation = confirmationScenario && operation(document, confirmationScenario);
  const confirmationExample = confirmation?.requestBody?.content?.["application/json"]?.example;
  const confirmationResponse = confirmationScenario && bodies.get(confirmationScenario.fixture);
  assert(confirmationExample?.device_id && confirmationExample.device_id === confirmationResponse?.device_id, "OWNER confirmation response fixture must keep the candidate device proven by its request");
  assert(pending.device_id === confirmationExample.device_id && pending.organization_id === confirmationExample.organization_id && pending.approval_request_id === confirmationExample.approval_request_id, "OWNER pending response and confirmation request must keep the same request, organization and proven candidate device");
  assert(confirmationResponse.organization_id === pending.organization_id && confirmationResponse.device_id === pending.device_id, "OWNER confirmation response must bind the same organization and candidate device");
  assert(confirmationScenario.transition?.candidate_device_id === pending.device_id && confirmationScenario.transition?.organization_id === pending.organization_id && confirmationScenario.transition?.other_device_usable_approved === true && confirmationScenario.transition?.owner_membership_active === true && confirmationScenario.transition?.mfa_eligible === true && confirmationScenario.transition?.transaction_revalidates_other_device === true, "OWNER confirmation must revalidate its alternate usable-device and OWNER/MFA conditions in its transaction");
  const confirmationObservation = candidate.scenarios.find((row) => row.observes_transition_id === confirmationScenario.transition_id);
  const observedConfirmation = confirmationObservation && bodies.get(confirmationObservation.fixture);
  assert(confirmationObservation?.role === "session_observation" && confirmationObservation.journey_id === confirmationScenario.journey_id && confirmationObservation.account_id === confirmationScenario.account_id, "OWNER confirmation observation must link to the same journey/account and immediate transition");
  assert(observedConfirmation?.account?.account_id === confirmationScenario.account_id && observedConfirmation?.device?.device_id === confirmationScenario.transition.candidate_device_id && observedConfirmation?.device?.status === "approved", "OWNER confirmation observation must retain the same account and approved candidate device as its immediate response");
  assert(observedConfirmation.session?.status === "restricted" && observedConfirmation.active_organization === null && observedConfirmation.active_membership === null && observedConfirmation.permissions?.length === 0 && observedConfirmation.scopes?.length === 0, "OWNER confirmation observation must remain restricted with null tenant and empty permissions/scopes");
  assert(confirmationObservation.transition?.candidate_device_id === confirmationScenario.transition.candidate_device_id && confirmationObservation.transition?.tested_device_id === confirmationResponse.device_id, "OWNER confirmation observation metadata must require the immediate candidate device binding");
  const selectionScenario = candidate.scenarios.find((row) => row.id === "active-after-selection");
  const selectionContext = bodies.get(selectionScenario.fixture);
  const selectionRequest = operation(document, selectionScenario).requestBody?.content?.["application/json"]?.example;
  const selectionReplayRequest = bodies.get("openapi/examples/identity-session-rotation-replay-v5-request-select-organization.json");
  const selectionReplayResponse = bodies.get("openapi/examples/identity-session-rotation-replay-v5-response-select-organization.json");
  const selectedMembership = selectionContext?.active_membership;
  assert(selectionScenario.journey_id === "owner-flow-906" && selectionContext.device?.device_id === confirmationResponse.device_id && selectionContext.active_organization?.organization_id === "018f0000-0000-7000-8000-000000000906", "selection context must remain linked to the declared owner journey/device/organization");
  assert(selectionRequest?.membership_id === "018f0000-0000-7000-8000-000000000914" && selectionRequest?.expected_version === 1 && selectionReplayRequest?.operation_id === "selectActiveOrganization" && selectionReplayRequest.original_request?.membership_id === selectionRequest.membership_id && selectionReplayRequest.original_request?.expected_version === selectionRequest.expected_version, "public selection and private R5 replay request must use membership 914/version 1");
  assert(selectedMembership?.membership_id === selectionRequest.membership_id && selectedMembership?.version === selectionRequest.expected_version && selectionReplayResponse?.operation_id === "selectActiveOrganization" && selectionReplayResponse?.public_status === 200 && same(selectionReplayResponse.public_body, selectionContext), "selection request, active membership result and private replay public_body must agree exactly");
  const bodyExamples = ownerResponse.content?.["application/json"]?.examples;
  assert(same(Object.keys(bodyExamples ?? {}).sort(), ["exact_replay", "first_effect"]), "owner response examples must inventory first effect and replay");
  for (const name of ["first_effect", "exact_replay"]) assert(same(bodyExamples[name]?.value, pending), `owner ${name} published body example differs from static fixture`);
  const headers = candidate.scenarios.filter((row) => row.kind === "header");
  assert(headers.length === 2 && headers.some((row) => row.value === false) && headers.some((row) => row.value === true), "manifest must inventory both owner replay header values");
  for (const row of headers) {
    const op = operation(document, row);
    assert(row.method === "post" && row.path === "/identity/devices/{deviceId}/owner-approval-requests" && row.operationId === "requestOwnerDeviceSelfApproval" && row.status === "200" && row.header === "Idempotency-Replayed", `${row.id}: header selector must bind exact operation/method/path/status/name`);
    const response = op.responses?.[row.status];
    const header = response?.headers?.[row.header];
    assert(response && header?.schema?.type === "boolean" && header.examples?.first_effect?.value === false && header.examples?.exact_replay?.value === true && header.examples?.[row.value === false ? "first_effect" : "exact_replay"]?.value === row.value && typeof header.examples?.[row.value === false ? "first_effect" : "exact_replay"]?.value === "boolean", `${row.id}: selected response header must have exact boolean schema/examples matching its inventory value`);
  }
  assert(same(headers.map((row) => row.value).sort(), [false, true]), "owner replay header inventory must contain exactly one boolean false and one true row");
  for (const row of candidate.semantic_negatives) {
    const value = bodies.get(row.fixture);
    assert(value && typeof value === "object", `${row.id}: static negative fixture is missing`);
    const expected = row.id;
    let expectedError;
    try {
      if (row.schema === "SessionContext") contextInvariant(value, expected, row.transition);
      if (["restricted-organization", "restricted-membership", "restricted-permissions", "device-context-contradiction", "active-pending-device"].includes(expected)) contextInvariant(value, expected, row.transition);
      else if (expected === "global-approval-activation" || expected === "local-reference-activation") {
        const context = value;
        contextInvariant(context, expected);
        assert(context.session.status !== "active" || row.transition?.organization_approval === "approved_for_organization", `${expected}: active context requires approval for this exact organization`);
      }
      else if (expected === "confirmation-activates-tenant") { const context = value.context ?? value; assert(context.session?.status === "restricted" && context.active_organization === null && context.active_membership === null, `${expected}: confirmation must leave the session restricted without tenant context`); }
      else if (expected === "challenge-destination-dropped") assert(value.challenge?.organization_id === value.response_context?.active_organization?.organization_id && value.response_context?.session?.status === "active", `${expected}: challenge organization must remain the explicit destination`);
      else if (expected === "selection-missing-preconditions") assert(Object.values(value.preconditions ?? {}).every(Boolean), `${expected}: selection preconditions are incomplete`);
      else if (expected === "confirmation-changes-device") assert(value.existing_device_id === value.candidate_device_id, `${expected}: existing device binding must match candidate`);
      else if (expected === "request-replay-already-issued") assert(same(value, bodies.get(candidate.scenarios.find((s) => s.id === "owner-request-first-response")?.fixture)), `${expected}: replay must reproduce the complete OwnerDeviceApprovalPending response`);
      else if (expected === "request-replay-changed-expiry") assert(same(value.first_effect, value.exact_replay), `${expected}: replay must preserve every response field including expires_at`);
      else if (expected === "request-replay-changed-ids") assert(same(value.first_effect, value.exact_replay), `${expected}: replay must preserve original request, organization and device IDs`);
      else if (expected === "unknown-next-action") assert(value.next_actions?.every((item) => ["verify_email", "enroll_mfa", "complete_mfa", "register_device", "approve_device", "create_organization", "select_organization"].includes(item)), `${expected}: next_actions contains an unknown action`);
      else if (expected === "authority-next-action") validateNavigation(value, value.preconditions, expected);
      else assert(false, `${expected}: unknown semantic negative`);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith(`${expected}:`)) throw new Error(`${expected}: self-check failed for an unexpected reason: ${error instanceof Error ? error.message : String(error)}`);
      expectedError = error.message;
    }
    assert(expectedError, `${expected}: negative fixture was not rejected by its intended invariant`);
    if (row.invariant_error) assert(expectedError.includes(row.invariant_error), `${expected}: rejection did not come from the expected invariant ${row.invariant_error}; got ${expectedError}`);
  }
  return { contexts: contextRows.length, semanticNegatives: candidate.semantic_negatives.length, headerExamples: headers.length };
}

const names = await readdir(resolve(root, "openapi/examples"));
const fixtureRows = [...manifest.scenarios.filter((row) => row.fixture), ...manifest.semantic_negatives];
const bodies = new Map();
for (const path of new Set(fixtureRows.map((row) => row.fixture))) bodies.set(path, await fixture(path));
for (const path of manifest.related_fixtures ?? []) bodies.set(path, await fixture(path));
for (const row of manifest.scenarios) if (row.published_source && !bodies.has(row.published_source)) bodies.set(row.published_source, await fixture(row.published_source));
const check = (candidate, document = api, filenames = names, loaded = bodies) => validate(document, candidate, filenames, loaded);
const counts = check(manifest);
const confirmationObservationForTests = manifest.scenarios.find((row) => row.observes_transition_id === "owner-confirmation-904");
const observedConfirmationForTests = bodies.get(confirmationObservationForTests.fixture);
const selectionReplayRequestForTests = bodies.get("openapi/examples/identity-session-rotation-replay-v5-request-select-organization.json");
let rejected = 0;
async function expectReject(label, expected, run) {
  try { run(); } catch (error) {
    assert(error instanceof Error && error.message.includes(expected) && !error.message.includes("undefined") && !error.message.includes("Cannot read"), `${label}: expected invariant rejection ${expected}; got ${error instanceof Error ? error.message : String(error)}`);
    rejected += 1; return;
  }
  throw new Error(`${label}: self-test did not reject expected invariant ${expected}`);
}
if (selfTest) {
  const missingHeader = structuredClone(api); delete missingHeader.paths["/identity/devices/{deviceId}/owner-approval-requests"].post.responses["200"].headers["Idempotency-Replayed"];
  expectReject("missing header", "owner Idempotency-Replayed must be boolean", () => check(manifest, missingHeader));
  const stringHeader = structuredClone(api); stringHeader.paths["/identity/devices/{deviceId}/owner-approval-requests"].post.responses["200"].headers["Idempotency-Replayed"].schema = { type: "string", enum: ["false", "true"] };
  expectReject("string header", "owner Idempotency-Replayed must be boolean", () => check(manifest, stringHeader));
  const alteredExample = structuredClone(api); alteredExample.paths["/identity/devices/{deviceId}/owner-approval-requests"].post.responses["200"].content["application/json"].examples.exact_replay.value.version = 99;
  expectReject("altered example", "owner exact_replay published body example differs from static fixture", () => check(manifest, alteredExample));
  const missingExample = structuredClone(api); delete missingExample.paths["/identity/devices/{deviceId}/owner-approval-requests"].post.responses["200"].content["application/json"].examples.exact_replay;
  expectReject("missing example", "owner response examples must inventory first effect and replay", () => check(manifest, missingExample));
  expectReject("extra fixture", "fixture inventory has an extra or missing artifact", () => check(manifest, api, [...names, "owner-session-flow-v1-unindexed.json"]));
  const duplicate = structuredClone(manifest); duplicate.semantic_negatives.push({ ...duplicate.semantic_negatives[0], id: `${duplicate.semantic_negatives[0].id}-duplicate-row` });
  expectReject("duplicate fixture", "fixture manifest contains a duplicate path", () => check(duplicate));
  const wrongPath = structuredClone(manifest); wrongPath.scenarios.find((row) => row.operationId === "requestOwnerDeviceSelfApproval").path = "/wrong";
  expectReject("operation/path mismatch", "exact method/path must map", () => check(wrongPath));
  const wrongStatus = structuredClone(manifest); wrongStatus.scenarios.find((row) => row.kind === "pending").status = "201";
  expectReject("status mismatch", "exact method/path/status/media type response schema mismatch", () => check(wrongStatus));
  const wrongSchema = structuredClone(manifest); wrongSchema.scenarios.find((row) => row.kind === "pending").schema = "DeviceApprovalStatus";
  expectReject("schema mismatch", "exact method/path/status/media type response schema mismatch", () => check(wrongSchema));
  const wrongBootstrapSchema = structuredClone(manifest); const bootstrap = wrongBootstrapSchema.scenarios.find((row) => row.id === "active-after-atomic-bootstrap"); bootstrap.schema = "RegistrationAccepted"; bootstrap.fixture_schema = "RegistrationAccepted";
  expectReject("bootstrap mapped to RegistrationAccepted", "exact method/path/status/media type response schema mismatch", () => check(wrongBootstrapSchema));
  const registration299 = structuredClone(manifest); registration299.scenarios.find((row) => row.id === "registration-does-not-bind-session").status = "299";
  expectReject("registration status 299", "exact method/path/status/media type response schema mismatch", () => check(registration299));
  const registrationMappedPending = structuredClone(manifest); const registration = registrationMappedPending.scenarios.find((row) => row.id === "registration-does-not-bind-session"); registration.schema = "OwnerDeviceApprovalPending"; registration.fixture_schema = "OwnerDeviceApprovalPending";
  expectReject("registration mapped to OwnerDeviceApprovalPending", "exact method/path/status/media type response schema mismatch", () => check(registrationMappedPending));
  const ownerWithoutOtherDevice = structuredClone(manifest); ownerWithoutOtherDevice.scenarios.find((row) => row.id === "owner-request-first-response").transition.other_device_usable_approved = false;
  expectReject("owner request missing alternate usable device", "owner request transition requires", () => check(ownerWithoutOtherDevice));
  const confirmWithoutTransactionalRecheck = structuredClone(manifest); confirmWithoutTransactionalRecheck.scenarios.find((row) => row.id === "restricted-after-owner-confirmation").transition.transaction_revalidates_other_device = false;
  expectReject("confirmation missing transactional alternate-device recheck", "OWNER confirmation must revalidate", () => check(confirmWithoutTransactionalRecheck));
  const extraSessionExample = structuredClone(api); extraSessionExample.paths["/identity/session"].get.responses["200"].content["application/json"].examples.unindexed_extra = { value: bodies.get("openapi/examples/owner-session-flow-v1-restricted-after-login.json") };
  expectReject("unindexed GET /identity/session example", "published response example inventory has a missing, altered or unindexed example", () => check(manifest, extraSessionExample));
  const weakened = structuredClone(api); weakened.paths["/identity/device-approval-confirmations"].post.description = "Confirma la aprobación."; delete weakened.paths["/identity/device-approval-confirmations"].post["x-owner-session-flow-r8"];
  expectReject("weakened normative description", "must revalidate alternate-device eligibility transactionally", () => check(manifest, weakened));
  const missingNextActionRules = structuredClone(api); missingNextActionRules.paths["/identity/session"].get.description = "Devuelve el estado de la sesión.";
  expectReject("missing next_actions preconditions", "normative description was removed or weakened", () => check(manifest, missingNextActionRules));
  const wrongHeaderRoute = structuredClone(manifest); wrongHeaderRoute.scenarios.find((row) => row.id === "owner-request-header-first").path = "/wrong";
  expectReject("wrong OWNER header route", "exact method/path must map", () => check(wrongHeaderRoute));
  const wrongHeaderMethod = structuredClone(manifest); wrongHeaderMethod.scenarios.find((row) => row.id === "owner-request-header-first").method = "get";
  expectReject("wrong OWNER header method", "exact method/path must map", () => check(wrongHeaderMethod));
  const wrongHeaderStatus = structuredClone(manifest); wrongHeaderStatus.scenarios.find((row) => row.id === "owner-request-header-first").status = "299";
  expectReject("wrong OWNER header status", "header selector must bind exact", () => check(wrongHeaderStatus));
  const wrongHeaderOperation = structuredClone(manifest); wrongHeaderOperation.scenarios.find((row) => row.id === "owner-request-header-first").operationId = "createSession";
  expectReject("wrong OWNER header operation", "exact method/path must map", () => check(wrongHeaderOperation));
  const wrongHeaderValue = structuredClone(api); wrongHeaderValue.paths["/identity/devices/{deviceId}/owner-approval-requests"].post.responses["200"].headers["Idempotency-Replayed"].examples.first_effect.value = true;
  expectReject("wrong OWNER header example boolean", "owner Idempotency-Replayed examples must be boolean false/true", () => check(manifest, wrongHeaderValue));
  const missingTestedDevice = structuredClone(manifest); delete missingTestedDevice.scenarios.find((row) => row.id === "restricted-device-proof-without-destination").transition.tested_device_id;
  expectReject("missing proof tested_device_id", "tested_device_id is required", () => check(missingTestedDevice));
  const selectionDivergence = new Map(bodies); const changedSelectionRequest = structuredClone(selectionReplayRequestForTests); changedSelectionRequest.original_request.membership_id = "018f0000-0000-7000-8000-000000000014"; selectionDivergence.set("openapi/examples/identity-session-rotation-replay-v5-request-select-organization.json", changedSelectionRequest);
  expectReject("selection/replay membership divergence", "public selection and private R5 replay request", () => check(manifest, api, names, selectionDivergence));
  const versionDivergence = new Map(bodies); const changedSelectionVersion = structuredClone(selectionReplayRequestForTests); changedSelectionVersion.original_request.expected_version = 2; versionDivergence.set("openapi/examples/identity-session-rotation-replay-v5-request-select-organization.json", changedSelectionVersion);
  expectReject("selection/replay expected_version divergence", "public selection and private R5 replay request", () => check(manifest, api, names, versionDivergence));
  const resultDivergence = new Map(bodies); const changedSelectionResult = structuredClone(bodies.get("openapi/examples/owner-session-flow-v1-active-selection.json")); changedSelectionResult.active_membership.membership_id = "018f0000-0000-7000-8000-000000000014"; resultDivergence.set("openapi/examples/owner-session-flow-v1-active-selection.json", changedSelectionResult);
  const changedRenewalContext = structuredClone(bodies.get("openapi/examples/owner-session-flow-v1-active-renewal.json")); changedRenewalContext.active_membership.membership_id = changedSelectionResult.active_membership.membership_id; resultDivergence.set("openapi/examples/owner-session-flow-v1-active-renewal.json", changedRenewalContext);
  const changedSelectionReplay = structuredClone(bodies.get("openapi/examples/identity-session-rotation-replay-v5-response-select-organization.json")); changedSelectionReplay.public_body = changedSelectionResult; resultDivergence.set("openapi/examples/identity-session-rotation-replay-v5-response-select-organization.json", changedSelectionReplay);
  const selectionApi = structuredClone(api); const selectionExamples = selectionApi.paths["/tenancy/context-selections"].post.responses["200"].content["application/json"].examples; for (const name of ["first_effect", "exact_replay"]) selectionExamples[name].value = changedSelectionResult;
  expectReject("selection/result membership divergence", "selection request, active membership result and private replay public_body", () => check(manifest, selectionApi, names, resultDivergence));
  const wrongConfirmationDevice = new Map(bodies); const changedObservation = structuredClone(observedConfirmationForTests); changedObservation.device.device_id = "018f0000-0000-7000-8000-000000000999"; wrongConfirmationDevice.set(confirmationObservationForTests.fixture, changedObservation);
  const confirmationApi = structuredClone(api); confirmationApi.paths["/identity/session"].get.responses["200"].content["application/json"].examples.restricted_after_owner_confirmation.value = changedObservation;
  expectReject("confirmation observation device mismatch", "tested device must match the device bound to the session", () => check(manifest, confirmationApi, names, wrongConfirmationDevice));
  const badLoginNavigation = new Map(bodies); const badLoginContext = structuredClone(bodies.get("openapi/examples/owner-session-flow-v1-restricted-after-login.json")); badLoginContext.next_actions = ["select_organization"]; badLoginNavigation.set("openapi/examples/owner-session-flow-v1-restricted-after-login.json", badLoginContext);
  const loginApi = structuredClone(api); loginApi.paths["/identity/session"].get.responses["200"].content["application/json"].examples.restricted_after_login.value = badLoginContext;
  expectReject("login MFA navigation contradiction", "next_actions select_organization contradicts", () => check(manifest, loginApi, names, badLoginNavigation));
  const pendingConfirmation = new Map(bodies); const pendingDeviceObservation = structuredClone(observedConfirmationForTests); pendingDeviceObservation.device.status = "pending_approval"; pendingConfirmation.set(confirmationObservationForTests.fixture, pendingDeviceObservation);
  const pendingApi = structuredClone(api); pendingApi.paths["/identity/session"].get.responses["200"].content["application/json"].examples.restricted_after_owner_confirmation.value = pendingDeviceObservation;
  expectReject("confirmation pending device navigation contradiction", "next_actions select_organization contradicts", () => check(manifest, pendingApi, names, pendingConfirmation));
  const loginMetadata = structuredClone(manifest); loginMetadata.scenarios.find((row) => row.id === "login-mfa-pending").transition.navigation.login_challenge_pending = false;
  expectReject("complete MFA without pending challenge", "next_actions complete_mfa contradicts", () => check(loginMetadata));
  const wrongVerifyEmail = new Map(bodies); const emailActionLogin = structuredClone(bodies.get("openapi/examples/owner-session-flow-v1-login-response.json")); emailActionLogin.next_actions = ["verify_email"]; wrongVerifyEmail.set("openapi/examples/owner-session-flow-v1-login-response.json", emailActionLogin);
  const emailActionApi = structuredClone(api); emailActionApi.paths["/identity/sessions"].post.responses["200"].content["application/json"].examples.authenticated_restricted.value = emailActionLogin;
  expectReject("verify email after verified login", "next_actions verify_email contradicts", () => check(manifest, emailActionApi, names, wrongVerifyEmail));
  const enrolledMfa = structuredClone(manifest); const loginRow = enrolledMfa.scenarios.find((row) => row.id === "restricted-after-login"); loginRow.transition.navigation.mfa_eligible = true; loginRow.transition.navigation.mfa_status = "enrolled";
  expectReject("enroll MFA after enrollment", "next_actions enroll_mfa contradicts", () => check(enrolledMfa));
}
console.log(`owner-session-flow-v1 gate passed: public=2.1.0; session_context_scenarios=${counts.contexts}; semantic_negatives=${counts.semanticNegatives}; replay_header_values=${counts.headerExamples}; self_test_rejections=${rejected}; runtime authorization demonstrated=false.`);
