import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractDirectories = [resolve(root, "events"), resolve(root, "openapi")];

async function listJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listJsonFiles(path);
      return extname(entry.name) === ".json" ? [path] : [];
    }),
  );
  return nested.flat();
}

function decodePointerToken(token) {
  return decodeURIComponent(token).replaceAll("~1", "/").replaceAll("~0", "~");
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

const files = (await Promise.all(contractDirectories.map(listJsonFiles))).flat();
const documents = new Map();

for (const file of files) {
  try {
    documents.set(file, JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    throw new Error(`${file}: JSON inválido: ${error.message}`);
  }
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
