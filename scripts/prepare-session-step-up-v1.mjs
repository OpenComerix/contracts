import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assert, at, manifestPath, parse, root, validateContract } from "./session-step-up-v1-common.mjs";

const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const positional = args.filter((arg) => arg !== "--self-test");
const [publicFile, privateFile, output] = positional;
if (!publicFile || !privateFile || !output) throw new Error("usage: node scripts/prepare-session-step-up-v1.mjs <public-bundle.json> <private-bundle.json> <output-dir> [--self-test]");
const [publicApi, privateApi, policy, manifest] = await Promise.all([
  parse(resolve(publicFile)), parse(resolve(privateFile)),
  parse(resolve(root, "openapi/identity-gateway-delegation-policy-v2.json")), parse(manifestPath),
]);
const baseline = await validateContract(publicApi, privateApi, policy, manifest);
if (selfTest) {
  const wrongPath = structuredClone(manifest);
  wrongPath.operations[0].path = "/wrong";
  let rejected = false;
  try { await validateContract(publicApi, privateApi, policy, wrongPath); } catch (error) { rejected = /method\/path mismatch/.test(error.message); }
  assert(rejected, "self-test failed: exact path selector mutation was not rejected by its invariant");
  const extraPublished = structuredClone(publicApi);
  extraPublished.paths["/identity/step-up-challenges"].post.requestBody.content["application/json"].examples.uninventoried = { value: { password: "ejemplo-seguro-no-real" } };
  rejected = false;
  try { await validateContract(extraPublished, privateApi, policy, manifest); } catch (error) { rejected = /bidirectionally/.test(error.message); }
  assert(rejected, "self-test failed: unindexed published example was not rejected by its invariant");
  const badSemantics = structuredClone(manifest.semantic_scenarios[0]);
  badSemantics.effect.expires_at = "2026-10-02T12:20:00Z";
  rejected = false;
  try { const { validateSemantics } = await import("./session-step-up-v1-common.mjs"); validateSemantics(badSemantics); } catch (error) { rejected = /effect\.expires_at/.test(error.message); }
  assert(rejected, "self-test failed: semantic expiry mutation was not rejected by its invariant");
}

const dir = resolve(output);
await mkdir(dir, { recursive: true });
const cases = [];
const schemas = new Map();
const problemExampleCases = manifest.published_examples
  .filter((item) => item.media_type === "application/problem+json")
  .map((item) => ({ ...item, id: `problem-${item.operation_id.replace(/([a-z0-9])([A-Z])/g, "$1-$2")}-${item.status}-${item.example_name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"), expectation: "valid" }));
const allCases = [...manifest.cases, ...problemExampleCases];
for (const item of allCases) {
  const api = item.operation_id === "recoverSessionRotationReplay" ? privateApi : publicApi;
  const schema = at(api, item.schema_pointer);
  assert(schema && typeof schema === "object" && !schema.$ref, `${item.id}: exact dereferenced selector did not yield a schema`);
  const body = await parse(resolve(root, manifest.fixture_directory, item.fixture));
  const fixtureName = `${item.id}.json`;
  await writeFile(resolve(dir, fixtureName), `${JSON.stringify(body, null, 2)}\n`, "utf8");
  let schemaName = schemas.get(item.schema_pointer);
  if (!schemaName) {
    schemaName = `schema-${schemas.size + 1}.json`;
    await writeFile(resolve(dir, schemaName), `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...schema }, null, 2)}\n`, "utf8");
    schemas.set(item.schema_pointer, schemaName);
  }
  cases.push([item.id, item.expectation, schemaName, fixtureName, item.schema_pointer].join("\t"));
}
await writeFile(resolve(dir, "cases.tsv"), `${cases.join("\n")}\n`, "utf8");
await writeFile(resolve(dir, "semantics.json"), `${JSON.stringify({ semantic_scenarios: manifest.semantic_scenarios, transition_templates: manifest.transition_templates, transition_scenarios: manifest.transition_scenarios }, null, 2)}\n`, "utf8");
console.log(`Session step-up fixtures prepared from real dereferenced bundles: examples=${baseline.actualExamples} problem_examples=${baseline.problemExamples} cases=${allCases.length} structural_positive=${allCases.filter((item) => item.expectation === "valid").length} structural_negative=${allCases.filter((item) => item.expectation === "invalid").length} semantic_scenarios=${manifest.semantic_scenarios.length} transition_scenarios=${manifest.transition_scenarios.length} extracted_schemas=${schemas.size}; negative controls=3 rejected`);
