import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepare,read} from './integration-schema-v1.mjs';
import {root,integrationPath} from './release-v1.mjs';
import {validateConnected,validateRecovery,validateCashReplay} from './integration-v1.mjs';
const [mode,...extra]=process.argv.slice(2);assert.equal(extra.length,0,'E_GATE_ARGUMENTS');
if(mode==='semantics') {
  const ids=read(integrationPath+'scenarios.json').scenarios;
  for(const id of ids)validateConnected(read(integrationPath+id+'.json'));
  const normal=read(integrationPath+'normal.json');
  for(const owner of ['inventory','finance'])validateRecovery(normal,read(integrationPath+'recovery-'+owner+'.json'));
  validateCashReplay(normal,read(integrationPath+'cash-replay.json'));
  console.log(JSON.stringify({result:'passed',scenarios:ids.length,recovery:2,cash_replay:1,runtime_demonstrated:false}));
} else if(mode==='schema') {
  const pack=prepare(),directory=path.join(root,pack.output);
  const result=spawnSync('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--mount',`type=bind,source=${directory},target=/work`,'--workdir','/work','--entrypoint','sh','ghcr.io/sourcemeta/jsonschema:v16.10.0','gate.sh','.'],
    {cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
  fs.writeFileSync(path.join(directory,'sourcemeta.log'),JSON.stringify({exit:result.status,error:result.error?.message??null,stdout:result.stdout??'',stderr:result.stderr??''})+'\n');
  if(result.stderr)process.stderr.write(result.stderr);if(result.error)throw result.error;
  if(result.status!==0){if(result.stdout)process.stdout.write(result.stdout);throw Error('E_SCHEMA_FAILED:'+result.status);}
  const summary=/schemas=(\d+) accepted=(\d+) invalid_rejected=(\d+)/u.exec(result.stdout);
  assert(summary,'E_SCHEMA_SUMMARY');assert.deepEqual(summary.slice(1).map(Number),[pack.schemas,pack.positive,pack.negative],'E_SCHEMA_COUNTS');
  console.log(JSON.stringify({...pack,validator:'Sourcemeta 16.10.0',result:'passed'}));
} else throw Error('E_GATE_MODE');
