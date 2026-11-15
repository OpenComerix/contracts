import {projectOperationalConsumerFile,projectOperationalConsumerDocument,projectOperationalConsumerToolingFile,withOperationalConsumersScope} from './operational-context-consumers-v1.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import tooling from '../../tools/architecture/validation-tooling.json' with {type:'json'};

const root=path.resolve(import.meta.dirname,'../..');
export const operationalBase='73dfe6f1011b472e1520cf5328c1f1d7e1a37fc4';
const source=createGitReader()(root,operationalBase);
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const hash=bytes=>createHash('sha256').update(text(bytes)).digest('hex');
// Filled from the concrete candidate before review. No mutable manifest can
// extend the path inventory or replace these expectations.
export const operationalHashes=Object.freeze({
  ".github/workflows/ci.yml": "73cc3e84f9bc084a3b40434c8fc43f13ee0e5fbba0881b92ac9a1ddc34914178",
  "finance/README.md": "d5ec612fa0dcd016f8abbccf4397ad6f1fac4a1723687d55e9c11cbf530f9da6",
  "finance/fixtures/open-shift/v1/private-read-headers.json": "cb0626e3dcd45e262446f5a3f04457062ffe429db9afa28864d0ad438df11956",
  "finance/fixtures/open-shift/v1/responses.json": "b1a3dde4eac7ba074115ce107690f34d37188ab39d0654fc85547c489e9b6937",
  "finance/http/private/v1/finance-open-shift-v1.yaml": "ff7302c2a3b13abdd774a8eda91bbdc6e325b05f3d0bb20ca18eb4ff74e869a9",
  "finance/http/public/v1/finance-open-shift-v1.yaml": "efbfaa3fe913e9ecce6e4ca0ae804e704ff302e25ab7a15db429b4a4d92105b5",
  "finance/http/shared/v1/finance-open-shift-v1.schema.json": "7a16878bcd79486bafca62dfd9e211d8340fca3dead1d7114f49adfc5125b648",
  "finance/index.json": "ca7bdd38fb88300aaaa6c90cb4fa95d12fac531f84d95ef4267ff5053bbcebf2",
  "identity/README.md": "273ac8d750b5a600d1baf62b2f6c3bf6f45208aefb63dba9a694352195fe2da8",
  "identity/fixtures/finance-operational-authority/v1/requests-and-results.json": "b4133cfe9d2e545bdb9c36b715ecf721f1902c24d1142acfcced2e61b4516d04",
  "identity/fixtures/operational-options/v1/authority-cases.json": "4e16b5a43ccdbf6936940ab7349b71f39fa7f0ef530a59ef96e24eabf3e83b18",
  "identity/fixtures/operational-options/v1/consumption-map.json": "925cd5e16b991eeb4e798d256455e248e5ef4dbc0fa6a17c53c1e9937327e01a",
  "identity/fixtures/operational-options/v1/problems.json": "8e90eb7712c5cf2a9c4d2f9dd18fcf3e7ecdcc6b6b2c0d88e06f08b18d87e0e4",
  "identity/fixtures/operational-options/v1/responses.json": "af4446d3268f737df7569a1f36e9e0b423f0adec698d7a7c81e5321f1c5de1c3",
  "identity/http/private/v1/identity-finance-operational-authority-v1.yaml": "ac139b6fee86a6202ba825b34d84cca667437bddea43cdabc43f41f6af5448b9",
  "identity/http/private/v1/identity-operational-options-v1.yaml": "72ef698e2545aa922b46fcf4f2f36af9e927c49612754855df29ed3957811b39",
  "identity/http/public/v1/identity-operational-options-v1.yaml": "8edea46d9258f8e4a30d683ae68595e9a55f194840a7e67b1b8867eb1914dbc8",
  "identity/http/shared/v1/identity-finance-operational-authority-v1.schema.json": "046786af08440725626e5b8e7dcc04f3f1a6c6280b5fba5c146bde4d15a4f0e3",
  "identity/http/shared/v1/identity-operational-context-policy-v1.json": "0c2860ead95ac4a207d7cd1f5d36291256588c315e5e92931bad1f3c5e51dfc8",
  "identity/http/shared/v1/identity-operational-options-v1.schema.json": "5849d2a2bd3e836776607209b3660fc4b48b876085e0c5eb9ec3547b6486cb03",
  "identity/index.json": "ec8bcdb9a76f10d0741477bfc6f2fb137dd710b01b6d439938e3cf2086bb01fb",
  "registry/README.md": "99d57706168213b4127c033b1f958223cf0993fa57bd980aa1025630bb70003b",
  "registry/contracts.json": "f8e6a3f9e4d7732c8cf143f6b5483a3ebc5bd87bbc3eab4e2e16eaccc4e27063",
  "scripts/identity/operational-context-admission-v1.mjs": "fb1f514aa35379b4e39ec9feba8d31b357732ef574335fcf02266b7b348ab363",
  "scripts/identity/operational-context-v1.mjs": "97dac8b21bd63aee7e5f985530f7dcb43e8dd5fbb2c9ba9d1144d0047b72c062",
  "scripts/sales/recovery-consumer-v1.mjs": "48559b93d2282b1e8505a8dc6fb342c240428bdc8fb54651636dd75f7fd87d4f",
  "test/architecture/internal-auth-v2-history.test.mjs": "011e215e5f56409f756113029d7226c481678cc1f33e79e6fd3947e3b6a3ff3e",
  "test/architecture/sales-acceptance-consumer.test.mjs": "aab28fe9d28b193cd933f0498ab8593039bcec6315bba837026bc5606240e3a1",
  "test/architecture/sales-coordination-consumer.test.mjs": "4cbbbda6ebb7aa2bf17c7cd1e2514776f09671b32736f93e603ad65ca5d19118",
  "test/architecture/sales-recovery-consumer.test.mjs": "c2b2a261a15dd0c4f5e15b5fa45994c7732fbf2dee954daefd505db6471ad7bf",
  "test/identity/operational-context-admission-v1.test.mjs": "4ce1ccdeb2798cfb0465dddadfc466b4188504d2ca5865cadb3e3533e103f648",
  "test/identity/operational-context-v1.test.mjs": "2a4027bf2eae17888ff2ed5aa534a225ad827f58df60e063035465dda535b2c3",
  "test/sales/inventory-step-consumer-v1.test.mjs": "21bf288609cfb0ca6ae53f11ba4f1f1357d9930fae36c1b0c513e89e27d8f3f8"
});
export const operationalModified=Object.freeze([
  ".github/workflows/ci.yml",
  "finance/README.md",
  "finance/index.json",
  "identity/README.md",
  "identity/index.json",
  "registry/README.md",
  "registry/contracts.json",
  "scripts/sales/recovery-consumer-v1.mjs",
  "test/architecture/internal-auth-v2-history.test.mjs",
  "test/architecture/sales-acceptance-consumer.test.mjs",
  "test/architecture/sales-coordination-consumer.test.mjs",
  "test/architecture/sales-recovery-consumer.test.mjs",
  "test/sales/inventory-step-consumer-v1.test.mjs"
]);
export const operationalFiles=Object.freeze([...Object.keys(operationalHashes),'scripts/identity/operational-context-history-v1.mjs']);
export function projectOperationalFile(file,bytes){
 bytes=projectOperationalConsumerFile(file,bytes);
 // Only A's frozen input inventory needs the tooling view. Later code guards
 // still receive current bytes (notably the Finance cash tooling guard).
 if(Object.hasOwn(operationalHashes,file))bytes=projectOperationalConsumerToolingFile(file,bytes);
 if(!operationalModified.includes(file)||hash(bytes)!==operationalHashes[file])return bytes;
 return source(file);
}
export function projectOperationalDocument(file,value){
 value=projectOperationalConsumerDocument(file,value);
 if(!operationalModified.includes(file)||!file.endsWith('.json'))return value;
 try{const bytes=JSON.stringify(value,null,2)+'\n';if(!isDeepStrictEqual(value,JSON.parse(bytes))||hash(Buffer.from(bytes))!==operationalHashes[file])return value;return JSON.parse(source(file));}catch{return value;}
}
// A single synchronous owner context. Pure projections never invoke a gate;
// current hashes are reread here and are not retained after the callback.
export function withOperationalScope(paths,read,verify){
 let active=true;
 const current=new Map();const raw=file=>{assert(active,'OPERATIONAL_CONTEXT_CLOSED');if(!current.has(file))current.set(file,read(file));return Buffer.from(current.get(file));};
 try{
  const registry=raw('registry/contracts.json');
  if(hash(registry)!==operationalHashes['registry/contracts.json']){
   const value=JSON.parse(text(registry));
   assert(![...(value.planned??[]),...(value.contracts??[])].some(row=>row.materializeIn==='F1-14A'||/^(identity|finance)\.f1-14a\./.test(row.id)),'OPERATIONAL_PARTIAL_SCOPE');
   return verify(paths,read);
  }
  return withOperationalConsumersScope(paths,raw,(paths,read)=>{
  for(const [file,expected]of Object.entries(operationalHashes))assert.equal(hash(projectOperationalConsumerToolingFile(file,read(file))),expected,'OPERATIONAL_CURRENT_BYTES:'+file);
  const helper='scripts/identity/operational-context-history-v1.mjs';assert.equal(hash(raw(helper)),tooling[helper],'OPERATIONAL_TOOLING_BYTES');
  const result=verify([...paths,...operationalFiles],file=>{assert(active,'OPERATIONAL_CONTEXT_CLOSED');return projectOperationalFile(file,read(file));});
  assert(!result||typeof result.then!=='function','OPERATIONAL_SYNCHRONOUS');return result;
  },'OPERATIONAL_CURRENT_BYTES');
 }finally{active=false;current.clear();}
}
