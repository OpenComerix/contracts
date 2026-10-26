import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const publicApi=read('inventory/http/public/v1/inventory-v1.yaml'),privateApi=read('inventory/http/private/v1/inventory-internal-v1.yaml');
const operations=document=>Object.entries(document.paths).flatMap(([p,item])=>Object.entries(item).map(([method,value])=>({path:p,method:method.toUpperCase(),...value})));
const human=[
 ['createInitialWarehouse','POST','/inventory/warehouses','inventory.configure','201'],
 ['listInventoryWarehouses','GET','/inventory/warehouses','inventory.read','200'],
 ['getInventoryWarehouse','GET','/inventory/warehouses/{warehouse_id}','inventory.read','200'],
 ['adjustInventoryStock','POST','/inventory/adjustments','inventory.adjust','201'],
 ['getInventoryAdjustment','GET','/inventory/adjustments/{adjustment_id}','inventory.read','200'],
 ['getInventoryPosition','GET','/inventory/positions/{position_id}','inventory.read','200'],
 ['listInventoryPositions','GET','/inventory/positions','inventory.read','200'],
 ['listInventoryReconciliations','GET','/inventory/reconciliations','inventory.read','200'],
 ['getInventoryReconciliation','GET','/inventory/reconciliations/{reconciliation_id}','inventory.read','200'],
 ['createInventoryHistoryReadSession','POST','/inventory/history-read-sessions','inventory.history.read','201'],
 ['readInventoryHistoryFacts','GET','/inventory/history-read-sessions/{read_session_id}/facts','inventory.history.read','200'],
];
test('public inventory surface has exactly the approved eleven human operations and private mirrors',()=>{
 assert.deepEqual(operations(publicApi).map(x=>x.operationId).sort(),human.map(x=>x[0]).sort());assert.equal(operations(privateApi).length,13);
 for(const [id,method,p,permission,status] of human)for(const document of [publicApi,privateApi]){const op=document.paths[p][method.toLowerCase()];assert.equal(op.operationId,id);assert.equal(op['x-permission'],permission);assert(op.responses[status]);assert(!op.responses['202']);}
});
test('public mutations require cookie, Origin, CSRF and idempotency; private credentials stay private',()=>{
 assert.equal(publicApi.components.securitySchemes.session.name,'__Host-oc_session');assert.deepEqual(publicApi.security,[{session:[]}]);
 for(const op of operations(publicApi).filter(x=>x.method==='POST'))for(const name of ['Origin','X-CSRF-Token','Idempotency-Key'])assert(op.parameters.some(p=>p.name===name&&p.required));
 for(const op of operations(privateApi).filter(x=>!x.path.startsWith('/internal/'))){assert.deepEqual(op.security,[{workload:[],delegated:[]}]);assert.equal(op['x-caller'],'gateway-bff');assert.equal(op['x-audience'],'inventory.user-api');assert(op.parameters.some(p=>p.name==='X-OC-Client-Signal'&&p.required));}
 assert(!Object.hasOwn(privateApi.components.securitySchemes,'session'));
});
test('created warehouse and adjustment Locations have approved authorized individual queries',()=>{
 for(const [create,p,get] of [['/inventory/warehouses','/inventory/warehouses/{warehouse_id}','getInventoryWarehouse'],['/inventory/adjustments','/inventory/adjustments/{adjustment_id}','getInventoryAdjustment']]){assert(publicApi.paths[create].post.responses['201'].headers.Location.required);assert.equal(publicApi.paths[p].get.operationId,get);assert.equal(publicApi.paths[p].get['x-permission'],'inventory.read');}
});
test('query/collection shapes are bounded and all response surfaces prohibit cache',()=>{
 for(const document of [publicApi,privateApi])for(const op of operations(document))for(const response of Object.values(op.responses))assert.equal(response.headers['Cache-Control'].schema.const,'no-store');
 for(const op of operations(publicApi))for(const p of op.parameters.filter(x=>x.name==='limit')){assert.equal(p.schema.default,50);assert.equal(p.schema.maximum,100);}
 assert.equal(privateApi.paths['/internal/inventory/sale-stock-results/{operation_id}'].get['x-caller'],'sales-pos');
 assert(!operations(publicApi).some(x=>x.operationId==='getInventorySaleStockResult'));
});
test('prerequisite ports retain separate callers/audiences and no functional admission',()=>{
 const cases=[['identity/http/private/v1/identity-inventory-authority-v1.yaml','/internal/identity/inventory-delegations','gateway-bff','identity-tenancy.gateway'],['identity/http/private/v1/identity-inventory-authority-v1.yaml','/internal/identity/inventory-authorizations','inventory','identity-tenancy.inventory-authority'],['catalog/http/private/v1/catalog-inventory-capture-v1.yaml','/internal/catalog/inventory-captures','inventory','catalog-pricing.inventory-capture'],['sales/http/private/v1/sales-inventory-step-authority-v1.yaml','/internal/sales/process-step-authorizations','inventory','sales-pos.process-authority']];
 for(const [file,p,caller,audience] of cases){const doc=read(file),op=doc.paths[p].post;assert.equal(op['x-caller'],caller);assert.equal(op['x-audience'],audience);assert.equal(doc['x-status'],'candidate');assert.equal(doc['x-runtime-demonstrated'],false);assert.equal(doc.info.license.identifier,'LicenseRef-Proprietary');}
});
test('all declared HTTP problems reference an existing code with matching status; dependencies use their own errors',()=>{
 const errors=read('common/errors/v9/error-catalog-v9.json');
 for(const file of ['inventory/http/public/v1/inventory-v1.yaml','inventory/http/private/v1/inventory-internal-v1.yaml','identity/http/private/v1/identity-inventory-authority-v1.yaml','catalog/http/private/v1/catalog-inventory-capture-v1.yaml','sales/http/private/v1/sales-inventory-step-authority-v1.yaml'])for(const op of operations(read(file)))for(const [status,response] of Object.entries(op.responses)){const problem=response.content?.['application/problem+json'];if(!problem)continue;for(const code of problem.schema.allOf[1].properties.code.enum){assert(errors.errors.some(x=>x.code===code&&x.statuses.includes(Number(status))),file+':'+code);if(!file.startsWith('inventory/'))assert(!code.startsWith('inventory_'),'B_ERROR_OWNER');}}
});
