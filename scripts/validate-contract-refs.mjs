import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contractDirectories } from "../tools/architecture/layout.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directories = contractDirectories(root);

async function listJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "examples") return [];
        return listJsonFiles(path);
      }
      return extname(entry.name) === ".json" ? [path] : [];
    }),
  );
  return nested.flat();
}

function decodePointerToken(token) {
  return decodeURIComponent(token).replaceAll("~1", "/").replaceAll("~0", "~");
}

function rejectDuplicateObjectKeys(source, file) {
  let offset = 0;
  const fail = (message) => { throw new Error(`${file}: ${message} (offset ${offset})`); };
  const whitespace = () => { while (/\s/.test(source[offset] ?? "")) offset++; };
  const string = () => {
    if (source[offset++] !== '"') fail("expected JSON string");
    let value = "";
    while (offset < source.length) {
      const char = source[offset++];
      if (char === '"') return value;
      if (char === "\\") {
        const escaped = source[offset++];
        if (escaped === "u") {
          const hex = source.slice(offset, offset + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid unicode escape");
          value += String.fromCharCode(parseInt(hex, 16)); offset += 4;
        } else {
          const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
          if (!(escaped in map)) fail("invalid string escape");
          value += map[escaped];
        }
      } else {
        if (char.charCodeAt(0) < 0x20) fail("control character in JSON string");
        value += char;
      }
    }
    fail("unterminated JSON string");
  };
  const value = () => {
    whitespace();
    if (source[offset] === "{") {
      offset++; whitespace(); const keys = new Set();
      if (source[offset] === "}") { offset++; return; }
      while (offset < source.length) {
        whitespace(); if (source[offset] !== '"') fail("expected object key");
        const key = string();
        if (keys.has(key)) fail(`duplicate JSON object key ${JSON.stringify(key)}`);
        keys.add(key); whitespace(); if (source[offset++] !== ":") fail("expected colon");
        value(); whitespace();
        if (source[offset] === "}") { offset++; return; }
        if (source[offset++] !== ",") fail("expected comma or object end");
      }
      fail("unterminated JSON object");
    } else if (source[offset] === "[") {
      offset++; whitespace(); if (source[offset] === "]") { offset++; return; }
      while (offset < source.length) { value(); whitespace(); if (source[offset] === "]") { offset++; return; } if (source[offset++] !== ",") fail("expected comma or array end"); }
      fail("unterminated JSON array");
    } else if (source[offset] === '"') string();
    else {
      const start = offset;
      while (offset < source.length && !/[\s,}\]]/.test(source[offset])) offset++;
      if (start === offset) fail("expected JSON value");
    }
  };
  value(); whitespace(); if (offset !== source.length) fail("trailing JSON content");
}

if (process.argv.includes("--self-test")) {
  const validFixture = '{"outer":{"escaped\\\"key":1},"items":[true,null,3]}';
  rejectDuplicateObjectKeys(validFixture, "duplicate-key self-test valid fixture");
  let duplicateRejected = false;
  try { rejectDuplicateObjectKeys('{"outer":{"x":1,"x":2}}', "duplicate-key self-test negative fixture"); }
  catch (error) { duplicateRejected = error.message.includes("duplicate JSON object key"); }
  if (!duplicateRejected) throw new Error("duplicate JSON key negative control was not rejected");
}

function resolvePointer(document, fragment, source) {
  if (!fragment) return;
  if (!fragment.startsWith("/")) {
    throw new Error(`${source}: fragmento no compatible #${fragment}`);
  }

  let current = document;
  for (const rawToken of fragment.slice(1).split("/")) {
    const token = decodePointerToken(rawToken);
    if (current === null || typeof current !== "object" || !(token in current)) {
      throw new Error(`${source}: no existe el destino #${fragment}`);
    }
    current = current[token];
  }
}

function collectReferences(value, references = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references);
  } else if (value !== null && typeof value === "object") {
    if (typeof value.$ref === "string") references.push(value.$ref);
    for (const item of Object.values(value)) collectReferences(item, references);
  }
  return references;
}

const files = (await Promise.all(directories.map(listJsonFiles))).flat();
const documents = new Map();

for (const file of files) {
  try {
    const source = await readFile(file, "utf8");
    rejectDuplicateObjectKeys(source, file);
    documents.set(file, JSON.parse(source));
  } catch (error) {
    throw new Error(`${file}: JSON inválido: ${error.message}`);
  }
}

const approvalExamplePath = resolve(root, "commands/examples/notifications.send-device-approval.v1.example.json");
let approvalExample;
try {
  const source = await readFile(approvalExamplePath, "utf8");
  rejectDuplicateObjectKeys(source, approvalExamplePath);
  approvalExample = JSON.parse(source);
} catch (error) {
  throw new Error(`${approvalExamplePath}: required approval command example is missing or invalid: ${error.message}`);
}

function assertApprovalOrganizationIdsAgree(command, source) {
  if (command?.organization_id !== command?.payload?.organization_id) {
    throw new Error(`${source}: envelope organization_id must equal payload.organization_id`);
  }
}

assertApprovalOrganizationIdsAgree(approvalExample, approvalExamplePath);

if (process.argv.includes("--self-test")) {
  const mismatched = structuredClone(approvalExample);
  mismatched.payload.organization_id = "018f0000-0000-7000-8000-000000000099";
  let mismatchRejected = false;
  try { assertApprovalOrganizationIdsAgree(mismatched, "approval command cross-field negative control"); }
  catch (error) { mismatchRejected = error.message.includes("envelope organization_id must equal payload.organization_id"); }
  if (!mismatchRejected) throw new Error("approval command cross-field organization_id negative control was not rejected");
}

for (const [file, document] of documents) {
  for (const reference of collectReferences(document)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) continue;

    const [relativePath, fragment = ""] = reference.split("#", 2);
    const targetFile = relativePath ? resolve(dirname(file), relativePath) : file;
    const targetDocument = documents.get(targetFile);
    if (!targetDocument) {
      throw new Error(`${file}: no existe el archivo referenciado ${relativePath}`);
    }
    resolvePointer(targetDocument, fragment, `${file} -> ${reference}`);
  }
}

console.log(`Contratos JSON válidos: ${files.length} archivos y referencias locales resueltas.`);

await import('./validate-identity-onboarding.mjs');
