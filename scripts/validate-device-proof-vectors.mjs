import { readFile } from "node:fs/promises";
import { createPublicKey, verify } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vector = JSON.parse(await readFile(resolve(root, "openapi/device-proof-v1-vectors.json"), "utf8"));
const messageFor = (id, challenge) => Buffer.from(`OpenComerix/device-proof/v1\n${id}\n${challenge}\n`, "utf8");
const decode = (encoded, expectedBytes) => {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.includes("=")) throw new Error("base64url value is malformed or padded");
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length !== expectedBytes || bytes.toString("base64url") !== encoded) throw new Error(`expected canonical base64url ${expectedBytes}-byte value`);
  return bytes;
};

if (vector.algorithm !== "ECDSA_P256" || vector.hash !== "SHA-256") throw new Error("unexpected device proof algorithm");
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(vector.challenge_id)) throw new Error("challenge_id must be canonical lowercase UUIDv7");
decode(vector.challenge, 32);
const message = messageFor(vector.challenge_id, vector.challenge);
if (message.toString("utf8") !== vector.signing_message_utf8) throw new Error("canonical UTF-8 signing message mismatch");
if (vector.public_key_jwk.kty !== "EC" || vector.public_key_jwk.crv !== "P-256" || "d" in vector.public_key_jwk) throw new Error("public JWK must be minimal EC P-256 and contain no private parameter");
decode(vector.public_key_jwk.x, 32); decode(vector.public_key_jwk.y, 32);
const publicKey = createPublicKey({ key: vector.public_key_jwk, format: "jwk" });
const signature = decode(vector.signature, 64);
if (!verify("sha256", message, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature)) throw new Error("valid proof vector did not verify");

let rejected = 0;
for (const negative of vector.negative_vectors) {
  if (negative.expected === "reject_cryptographic_verification") {
    const alteredChallenge = negative.challenge ?? vector.challenge;
    const alteredSignature = negative.signature ?? vector.signature;
    const valid = verify("sha256", messageFor(vector.challenge_id, alteredChallenge), { key: publicKey, dsaEncoding: "ieee-p1363" }, decode(alteredSignature, 64));
    if (valid) throw new Error(`${negative.name} unexpectedly verified`);
  } else if (negative.expected === "reject_server_side_binding") {
    const altered = { ...vector.bindings, ...Object.fromEntries(Object.entries(negative).filter(([key]) => key !== "name" && key !== "expected")) };
    const matches = Object.keys(vector.bindings).every((key) => altered[key] === vector.bindings[key]);
    if (matches) throw new Error(`${negative.name} server-side binding mismatch was not detected`);
  } else throw new Error(`unknown negative vector expectation: ${negative.expected}`);
  rejected++;
}
console.log(`Device proof vectors passed: valid signature 1; rejected negatives ${rejected} (2 cryptographic, 3 server-side binding). JSON Schema does not prove cryptography.`);
