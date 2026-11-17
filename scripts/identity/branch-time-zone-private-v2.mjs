import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createGitReader} from '../../tools/architecture/git-source.mjs';
import {domainIndex} from '../../tools/architecture/registry.mjs';
import {privateZoneAdmissionScopeFiles,projectPrivateZoneAdmissionFile,projectPrivateZoneAdmissionDocument,withPrivateZoneAdmissionScope} from './branch-time-zone-private-v2-admission.mjs';

export const root=path.resolve(import.meta.dirname,'../..');
export const privateZoneBase='714a5b33035c45ba4b1eeb01d1488e8674dc364c';
export const privateZoneSource=createGitReader()(root,privateZoneBase);
export const privateZonePath='identity/http/private/v2/identity-branch-time-zone-v2.yaml';
export const privateZonePreviousPath='identity/http/private/v1/identity-branch-time-zone-v1.yaml';
export const privateZoneId='identity.f1-14e.private.identity-branch-time-zone-v2';
const registryPath='registry/contracts.json';
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const native=file=>fs.readFileSync(path.join(root,file));
export function privateZoneDocument(){
 const value=JSON.parse(privateZoneSource(privateZonePreviousPath));
 value.info.title='Identity branch time zone private v2';
 value.info.version='2.0.0';
 value.info.description='F1-14E private boundary successor. Gateway exclusively validates browser Origin and session-bound CSRF before forwarding; Identity independently validates its current delegated user, original session, signal, membership, device, MFA, branch scope and mutation permission. No shared CSRF secret, functional admission or runtime demonstrated. Public v1 and private v1 remain immutable.';
 const boundary=' Gateway validates browser Origin and session-bound X-CSRF-Token before forwarding each mutation; on GET it validates Origin when present. Identity does not receive or validate browser Origin/CSRF and cannot accept those headers as authority. Identity independently enforces the current delegated caller, original session, gateway-derived signal and all authority requirements above; no service-only access or authority fallback.';
 for(const operation of Object.values(value.paths['/tenancy/branches/{branch_id}/time-zone'])){
  operation.description+=boundary;
  operation.parameters=operation.parameters.filter(parameter=>parameter.name!=='Origin');
  if(operation.security)operation.security=operation.security.map(({csrfToken,...required})=>required);
  const codes=operation.responses['403'].content['application/problem+json'].schema.allOf[1].properties.code;
  codes.enum=codes.enum.filter(code=>code!=='gateway_csrf_invalid');
 }
 delete value.components.securitySchemes.csrfToken;
 value['x-browser-security-owner']='gateway-bff';
 value['x-browser-contract']='../../public/v1/identity-branch-time-zone-v1.yaml';
 return value;
}
const intention=Object.freeze({id:privateZoneId,domain:'identity',owner:'identity-tenancy',
 materializeIn:'F1-14E',status:'planned',version:'2.0.0',path:privateZonePath,
 operations:['getBranchTimeZone','configureBranchTimeZone'],
 constraint:'Private v2 source only: browser Origin/CSRF remains exclusively in Gateway under public v1; Identity retains delegated user/session/signal and current backend authority. Preserve all published sources and consumer pins. Publication, exact full CI and separate admission precede consumption; no runtime or functional admission.'});
export function privateZoneRegistry(){
 const value=JSON.parse(privateZoneSource(registryPath));
 return {...value,planned:[...value.planned,structuredClone(intention)]};
}
const suffix='\n## F1-14E — Límite privado de zona v2 (fuente candidata)\n\n'+
 '[Privado v2](http/private/v2/identity-branch-time-zone-v2.yaml) conserva ruta, operaciones, cuerpos, versiones, replay, permiso y scopes. '+
 'Gateway verifica Origin y CSRF de la superficie [pública v1](http/public/v1/identity-branch-time-zone-v1.yaml) antes de reenviar; '+
 'Identity comprueba delegado/sesión/signal y autoridad actual sin recibir secretos CSRF. El privado v2 no declara esos headers ni errores CSRF propios. '+
 'Publicados v1, schemas, políticas, fixtures y ocho consumidores/locks intactos; una intención planned adicional, sin admisión. '+
 '[Verificador y alcance](../scripts/identity/branch-time-zone-private-v2.mjs), [pruebas](../test/identity/branch-time-zone-private-v2.test.mjs): '+
 '`node --test test/identity/branch-time-zone-private-v2.test.mjs`. Redocly2.53.3 valida el nuevo OpenAPI una vez en el job Identity existente; '+
 'los schemas compartidos son idénticos al SHA base con CI completa. Auditoría/publicación/CI y admisión seleccionada preceden consumo/runtime; no se acredita seguridad ejecutada por fixtures.\n';
function workflow(){
 let value=text(privateZoneSource('.github/workflows/ci.yml'));
 const anchor='          node scripts/identity/operational-context-v1.mjs verify';
 assert.equal(value.split(anchor).length,2,'PRIVATE_ZONE_CI_ANCHOR');
 value=value.replace(anchor,
  '          node scripts/validate-redocly-no-warnings.mjs '+privateZonePath+'\n'+
  '          npx --yes @redocly/cli@2.53.3 bundle '+privateZonePath+' --dereferenced --ext json --output .ci-artifacts/branch-time-zone-private-v2.bundle.json\n'+anchor);
 const artifacts='for path in .ci-artifacts/f1-14a/ .ci-artifacts/f1-14a-ci/';
 assert.equal(value.split(artifacts).length,2,'PRIVATE_ZONE_CI_ARTIFACT_ANCHOR');
 return Buffer.from(value.replace(artifacts,artifacts+' .ci-artifacts/branch-time-zone-private-v2.bundle.json'));
}
const metadata=new Map([[registryPath,encode(privateZoneRegistry())],
 ['identity/index.json',encode(domainIndex(privateZoneRegistry(),'identity'))],
 ['identity/README.md',Buffer.from(text(privateZoneSource('identity/README.md'))+suffix)],
 ['.github/workflows/ci.yml',workflow()]]);
const delta=new Map([...metadata,[privateZonePath,encode(privateZoneDocument())]]);
export const privateZoneSourceFiles=Object.freeze([...delta.keys()]);
export const privateZoneScopeFiles=Object.freeze([...new Set([...privateZoneAdmissionScopeFiles,...privateZoneSourceFiles])]);
export const privateZoneMetadata=()=>new Map([...delta].map(([file,bytes])=>[file,Buffer.from(bytes)]));
export function validatePrivateZoneInput(file,bytes){
 bytes=projectPrivateZoneAdmissionFile(file,bytes);
 assert(delta.has(file),'PRIVATE_ZONE_UNKNOWN_INPUT:'+file);
 assert.equal(text(bytes),text(delta.get(file)),'PRIVATE_ZONE_BYTES:'+file);
}
const previous=JSON.parse(privateZoneSource(registryPath));
export const privateZoneProtectedPaths=Object.freeze([...new Set([
 ...[...previous.contracts,...previous.preservedFiles].map(row=>row.path),
 'package.json','pnpm-lock.yaml','registry/consumers/index.json',
 ...previous.requiredConsumers.map(owner=>'registry/consumers/'+owner+'.json'),
])]);
const protectedPaths=new Set(privateZoneProtectedPaths);
export function validatePrivateZonePreservedInput(file,bytes){
 bytes=projectPrivateZoneAdmissionFile(file,bytes);
 assert(protectedPaths.has(file),'PRIVATE_ZONE_UNKNOWN_PROTECTED_INPUT:'+file);
 assert.equal(text(bytes),text(privateZoneSource(file)),'PRIVATE_ZONE_PRESERVATION:'+file);
}
export function validatePrivateZone(read=native){
 for(const file of privateZoneSourceFiles)validatePrivateZoneInput(file,read(file));
 for(const file of protectedPaths)validatePrivateZonePreservedInput(file,read(file));
 return {roots:234,planned:3,added:1,consumers:8,protectedFiles:protectedPaths.size,functionalAdmission:false,runtimeDemonstrated:false};
}
// Pure exact-value projection; does not read or authorize other live inputs.
export function projectPrivateZoneFile(file,bytes){
 bytes=projectPrivateZoneAdmissionFile(file,bytes);
 const expected=metadata.get(file);if(!expected)return bytes;
 try{return text(bytes)===text(expected)?privateZoneSource(file):bytes;}catch{return bytes;}
}
export function projectPrivateZoneDocument(file,value){
 value=projectPrivateZoneAdmissionDocument(file,value);
 const expected=metadata.get(file);if(!expected||!file.endsWith('.json'))return value;
 return isDeepStrictEqual(value,JSON.parse(expected))?JSON.parse(privateZoneSource(file)):value;
}
// One bounded current delta per invocation; no historical full gate per input.
export function withPrivateZoneScope(paths,read,verify,label='PRIVATE_ZONE_BYTES'){
 return withPrivateZoneAdmissionScope(paths,read,(paths,read)=>withSourceScope(paths,read,verify,label),label);
}
function withSourceScope(paths,read,verify,label){
 let active=true;const current=new Map();
 const raw=file=>{assert(active,'PRIVATE_ZONE_CONTEXT_CLOSED');if(!current.has(file))current.set(file,Buffer.from(read(file)));return Buffer.from(current.get(file));};
 try{
  const bytes=raw(registryPath);let value;try{value=JSON.parse(bytes);}catch{throw Error(label+':'+registryPath);}
  if(!isDeepStrictEqual(value,privateZoneRegistry())){
   assert(![...(value.planned??[]),...(value.contracts??[])].some(row=>row.id===privateZoneId),'PRIVATE_ZONE_PARTIAL_SCOPE');
   const result=verify(paths,raw);assert(!result||typeof result.then!=='function','PRIVATE_ZONE_SYNCHRONOUS');return result;
  }
  for(const file of privateZoneSourceFiles)validatePrivateZoneInput(file,raw(file));
  const result=verify([...new Set([...paths,...privateZoneSourceFiles])],file=>projectPrivateZoneFile(file,raw(file)));
  assert(!result||typeof result.then!=='function','PRIVATE_ZONE_SYNCHRONOUS');return result;
 }finally{active=false;current.clear();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,2,'PRIVATE_ZONE_OPTIONS');console.log(JSON.stringify(validatePrivateZone()));
}
