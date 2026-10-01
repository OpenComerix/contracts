import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [bundlePath, outputPath, ...args] = process.argv.slice(2);
if (!bundlePath || !outputPath || args.some((arg) => arg !== "--self-test")) {
  throw new Error("usage: node scripts/prepare-device-registration-challenge-v2.mjs <identity-onboarding-v2-dereferenced.json> <output-dir> [--self-test]");
}
const selfTest = args.includes("--self-test");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const bundle = await readJson(resolve(bundlePath));
const manifestPath = resolve(root, "openapi/device-registration-challenge-v2-fixtures.json");
const manifest = await readJson(manifestPath);
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const expectedNames = ["challenge_registration_key_mismatch", "malformed_jwk", "missing_public_key", "private_jwk_member"];
const fixtureRoot = resolve(root, "openapi/examples");
const jwkNames = ["crv", "kty", "x", "y"];
const coordinate = /^[A-Za-z0-9_-]{43}$/;

function operation(api, descriptor) {
  const op = api.paths?.[descriptor.path]?.[descriptor.method];
  assert(op?.operationId === descriptor.operationId, `${descriptor.operationId}: expected method/path/operationId not found`);
  return op;
}
function requestSchema(api, descriptor) {
  const schema = operation(api, descriptor).requestBody?.content?.["application/json"]?.schema;
  assert(schema && typeof schema === "object", `${descriptor.operationId}: dereferenced request schema missing`);
  return schema;
}
function requestExample(api, descriptor) {
  const example = operation(api, descriptor).requestBody?.content?.["application/json"]?.example;
  assert(example && typeof example === "object", `${descriptor.operationId}: published request example missing`);
  return example;
}
function validateJwkSchema(schema, label) {
  assert(schema?.type === "object" && schema.additionalProperties === false, `${label}: public JWK must reject extra/private members`);
  assert(same([...(schema.required ?? [])].sort(), jwkNames), `${label}: public JWK required fields must be kty, crv, x and y only`);
  const props = schema.properties ?? {};
  assert(same(Object.keys(props).sort(), jwkNames), `${label}: public JWK property inventory must be minimal`);
  assert(props.kty?.const === "EC" && props.crv?.const === "P-256", `${label}: public JWK must be EC P-256`);
  assert(props.x?.type === "string" && props.x.pattern === "^[A-Za-z0-9_-]{43}$" && props.y?.type === "string" && props.y.pattern === "^[A-Za-z0-9_-]{43}$", `${label}: public JWK coordinates must be 32-byte base64url values`);
}
function validJwk(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    same(Object.keys(value).sort(), jwkNames) && value.kty === "EC" && value.crv === "P-256" &&
    typeof value.x === "string" && coordinate.test(value.x) && typeof value.y === "string" && coordinate.test(value.y);
}
function assertSameCandidateKey(challengeRequest, registrationRequest, label) {
  assert(same(challengeRequest?.public_key, registrationRequest?.public_key), `${label}: public_key mismatch with persisted challenge candidate`);
}
function validateContract(api, candidateManifest = manifest, fixtureValues) {
  assert(api.info?.version === "2.0.8", "public identity contract must be v2.0.8");
  assert(candidateManifest.version === "2.0.8", "device proof fixture manifest must target v2.0.8");
  assert(same(candidateManifest.operations, {
    challenge: { method: "post", path: "/identity/device-registration-challenges", operationId: "createDeviceRegistrationChallenge" },
    registration: { method: "post", path: "/identity/devices", operationId: "registerWebDevice" },
  }), "challenge/registration fixture operation inventory changed");
  const challenge = requestSchema(api, candidateManifest.operations.challenge);
  const registration = requestSchema(api, candidateManifest.operations.registration);
  assert(challenge.type === "object" && challenge.additionalProperties === false && ["key_algorithm", "public_key"].every((name) => challenge.required?.includes(name)), "challenge request schema must require key_algorithm and public_key");
  assert(challenge.properties?.key_algorithm?.const === "ECDSA_P256", "challenge request must retain ECDSA_P256");
  const component = api.components?.schemas?.DevicePublicJwk;
  assert(component, "dereferenced bundle must retain DevicePublicJwk component");
  validateJwkSchema(component, "DevicePublicJwk component");
  validateJwkSchema(challenge.properties?.public_key, "DeviceChallengeRequest.public_key");
  validateJwkSchema(registration.properties?.public_key, "DeviceRegistrationRequest.public_key");
  assert(same(challenge.properties.public_key, component) && same(registration.properties.public_key, component), "both requests must reuse exactly DevicePublicJwk");
  const challengeExample = requestExample(api, candidateManifest.operations.challenge);
  const registrationExample = requestExample(api, candidateManifest.operations.registration);
  assert(validJwk(challengeExample.public_key) && validJwk(registrationExample.public_key), "published challenge and registration examples must contain a minimal public EC P-256 JWK");
  assertSameCandidateKey(challengeExample, registrationExample, "published examples");
  const description = operation(api, candidateManifest.operations.challenge).description ?? "";
  assert(/WebCrypto/.test(description) && /JWK pública candidata/.test(description) && /no es exportable/.test(description) && /misma JWK pública/.test(description) && /candidata persistida antes de verificar la firma/.test(description), "challenge description must specify key generation, public candidate, private non-exportability and comparison before signature verification");
  const registrationDescription = operation(api, candidateManifest.operations.registration).description ?? "";
  assert(/misma JWK pública/.test(registrationDescription) && /candidata persistida antes de verificar la firma/.test(registrationDescription), "registration description must require the same public key and compare it with the persisted candidate before signature verification");
  assert(Array.isArray(candidateManifest.negative_fixtures) && candidateManifest.negative_fixtures.length === 4, "exactly four negative device proof fixtures are required");
  assert(same(candidateManifest.negative_fixtures.map((entry) => entry.name).sort(), expectedNames), "negative fixture inventory must cover missing key, private JWK, malformed JWK and mismatched challenge/registration keys");
  assert(new Set(candidateManifest.negative_fixtures.map((entry) => entry.file)).size === 4, "negative fixture paths must be unique");
  if (fixtureValues) {
    const byName = new Map(candidateManifest.negative_fixtures.map((entry) => [entry.name, entry]));
    const missing = fixtureValues.get("missing_public_key");
    const privateJwk = fixtureValues.get("private_jwk_member");
    const malformed = fixtureValues.get("malformed_jwk");
    const mismatch = fixtureValues.get("challenge_registration_key_mismatch");
    assert(byName.get("missing_public_key")?.kind === "challenge_request" && missing?.key_algorithm === "ECDSA_P256" && !Object.hasOwn(missing, "public_key"), "missing_public_key fixture must omit only the candidate key");
    assert(byName.get("private_jwk_member")?.kind === "challenge_request" && !validJwk(privateJwk?.public_key) && Object.hasOwn(privateJwk?.public_key ?? {}, "d"), "private JWK fixture must contain a forbidden private member");
    assert(byName.get("malformed_jwk")?.kind === "challenge_request" && !validJwk(malformed?.public_key), "malformed JWK fixture must violate the public EC P-256 shape");
    assert(byName.get("challenge_registration_key_mismatch")?.kind === "key_binding" && validJwk(mismatch?.challenge_request?.public_key) && validJwk(mismatch?.registration_request?.public_key) && !same(mismatch.challenge_request.public_key, mismatch.registration_request.public_key), "key mismatch fixture must contain two individually valid but discordant public keys");
    assert(mismatch.challenge_request.key_algorithm === "ECDSA_P256" && mismatch.registration_request.platform === "web", "key mismatch fixture must otherwise represent valid request shapes");
    let mismatchRejected = false;
    try { assertSameCandidateKey(mismatch.challenge_request, mismatch.registration_request, "negative mismatch fixture"); }
    catch (error) {
      assert(error instanceof Error && error.message.includes("public_key mismatch with persisted challenge candidate"), "mismatch fixture was rejected for an unexpected reason");
      mismatchRejected = true;
    }
    assert(mismatchRejected, "semantic key-binding gate did not reject discordant challenge/registration public keys");
  }
  return { challenge, registration, challengeExample, registrationExample };
}

const fixtureValues = new Map();
for (const entry of manifest.negative_fixtures ?? []) {
  const file = resolve(root, entry.file);
  assert(file.startsWith(fixtureRoot + sep), `fixture escapes openapi/examples: ${entry.file}`);
  fixtureValues.set(entry.name, await readJson(file));
}
const result = validateContract(bundle, manifest, fixtureValues);
const negatives = [];
async function expectFailure(fn, label, message) {
  try { fn(); } catch (error) {
    assert(error instanceof Error && error.message.includes(message), `${label}: failed for an unexpected reason`);
    negatives.push(label);
    return;
  }
  throw new Error(`negative control failed to reject ${label}`);
}
if (selfTest) {
  const missingRequired = structuredClone(bundle);
  missingRequired.paths[manifest.operations.challenge.path].post.requestBody.content["application/json"].schema.required = ["key_algorithm"];
  await expectFailure(() => validateContract(missingRequired, manifest, fixtureValues), "missing public_key requirement", "challenge request schema must require key_algorithm and public_key");
  const mismatchedExamples = structuredClone(bundle);
  mismatchedExamples.paths[manifest.operations.registration.path].post.requestBody.content["application/json"].example.public_key.x = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await expectFailure(() => validateContract(mismatchedExamples, manifest, fixtureValues), "discordant published examples", "public_key mismatch with persisted challenge candidate");
  const alteredJwk = structuredClone(bundle);
  alteredJwk.components.schemas.DevicePublicJwk.properties.d = { type: "string" };
  await expectFailure(() => validateContract(alteredJwk, manifest, fixtureValues), "private member allowed by JWK schema", "public JWK property inventory must be minimal");
  const unlisted = structuredClone(manifest); unlisted.negative_fixtures.pop();
  await expectFailure(() => validateContract(bundle, unlisted, fixtureValues), "negative fixture missing from inventory", "exactly four negative device proof fixtures are required");
}

const out = resolve(outputPath); await mkdir(out, { recursive: true });
const withDialect = (schema) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", ...schema });
const pairSchema = {
  type: "object", additionalProperties: false, required: ["challenge_request", "registration_request"],
  properties: { challenge_request: result.challenge, registration_request: result.registration },
};
const writeJson = async (name, value) => writeFile(resolve(out, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
await writeJson("schema-challenge-request.json", withDialect(result.challenge));
await writeJson("schema-registration-request.json", withDialect(result.registration));
await writeJson("schema-key-binding-shape.json", withDialect(pairSchema));
await writeJson("challenge-request-valid.json", result.challengeExample);
await writeJson("registration-request-valid.json", result.registrationExample);
for (const entry of manifest.negative_fixtures) await writeJson(entry.name + ".json", fixtureValues.get(entry.name));
console.log(`PF1-06A-R4 device challenge gate passed: public_contract=2.0.8; shared_DevicePublicJwk=2; published_key_pair_match=1; structural_negative_fixtures=3; key_binding_negative_fixtures=1; self_test_rejections=${negatives.length}; cryptographic_signature_verification=not_demonstrated (service PF1-06B).`);
