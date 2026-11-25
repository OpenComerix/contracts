// Generated from identity/http/private/v1/identity-inventory-authority-v1-1.yaml at 0bff3a242784599c400875f37e1c2d3ef64f4538.


export type CanonicalRequest = ({
canonicalization_version: "inventory-request-v1"
operation_id: "createInitialWarehouse"
method: "POST"
path: string
query: {

}
body: WarehouseCreate
idempotency_key: string
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "listInventoryWarehouses"
method: "GET"
path: string
query: {
branch_id: string
limit?: string
cursor?: string
}
body: null
idempotency_key: null
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "getInventoryWarehouse"
method: "GET"
path: string
query: {

}
body: null
idempotency_key: null
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "adjustInventoryStock"
method: "POST"
path: string
query: {

}
body: AdjustmentRequest
idempotency_key: string
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "getInventoryAdjustment"
method: "GET"
path: string
query: {

}
body: null
idempotency_key: null
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "getInventoryPosition"
method: "GET"
path: string
query: {

}
body: null
idempotency_key: null
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "listInventoryPositions"
method: "GET"
path: string
query: {
limit?: string
cursor?: string
branch_id?: string
warehouse_id?: string
location_id?: string
variant_id?: string
}
body: null
idempotency_key: null
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "listInventoryReconciliations"
method: "GET"
path: string
query: {
limit?: string
cursor?: string
position_id?: string
status?: "open"
}
body: null
idempotency_key: null
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "getInventoryReconciliation"
method: "GET"
path: string
query: {
limit?: string
cursor?: string
}
body: null
idempotency_key: null
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "createInventoryHistoryReadSession"
method: "POST"
path: string
query: {

}
body: HistoryRequest
idempotency_key: string
} | {
canonicalization_version: "inventory-request-v1"
operation_id: "readInventoryHistoryFacts"
method: "GET"
path: string
query: {
limit?: string
cursor?: string
}
body: null
idempotency_key: null
})
export type ClientSignal = string

export interface IdentityInventoryAuthorityV11Operations {
checkInventoryAuthorization: {
method: "POST"
path: "/internal/identity/inventory-authorizations"
parameters: {

}
responses: {
"200": {
content: {
"application/json": Authorization
}
headers: {
"Cache-Control": "no-store"
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: "identity_invalid_request"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"401": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 401
code?: ("identity_session_invalid_or_expired" | "platform_workload_invalid")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"403": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 403
code?: ("identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"406": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 406
code?: "platform_not_acceptable"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"413": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 413
code?: "platform_payload_too_large"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"415": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 415
code?: "platform_unsupported_media_type"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"429": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 429
code?: "platform_rate_limited"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
"Retry-After"?: string
}
}
"500": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 500
code?: "platform_internal_error"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"503": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 503
code?: "platform_dependency_unavailable"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
"Retry-After"?: string
}
}
}
requestBody: {
"application/json": AuthorizationRequest
}
}
createInventoryDelegation: {
method: "POST"
path: "/internal/identity/inventory-delegations"
parameters: {

}
responses: {
"200": {
content: {
"application/json": Delegation
}
headers: {
"Cache-Control": "no-store"
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: "identity_invalid_request"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"401": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 401
code?: ("identity_session_invalid_or_expired" | "platform_workload_invalid")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"403": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 403
code?: ("identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"406": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 406
code?: "platform_not_acceptable"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"413": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 413
code?: "platform_payload_too_large"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"415": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 415
code?: "platform_unsupported_media_type"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"429": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 429
code?: "platform_rate_limited"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
"Retry-After"?: string
}
}
"500": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 500
code?: "platform_internal_error"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"503": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 503
code?: "platform_dependency_unavailable"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
"Retry-After"?: string
}
}
}
requestBody: {
"application/json": DelegationRequest
}
}
}
export interface Authorization {
organization_id: string
operation_id: ("createInitialWarehouse" | "listInventoryWarehouses" | "getInventoryWarehouse" | "adjustInventoryStock" | "getInventoryAdjustment" | "getInventoryPosition" | "listInventoryPositions" | "listInventoryReconciliations" | "getInventoryReconciliation" | "createInventoryHistoryReadSession" | "readInventoryHistoryFacts")
request_hash: string
canonicalization_version: "inventory-request-v1"
decision_id: string
authorized: true
account_ref: string
membership_ref: string
device_ref: string
session_version: string
membership_version: string
device_version: string
permission: ("inventory.configure" | "inventory.adjust" | "inventory.read" | "inventory.history.read")
scope: {
organization_id: string
branch_ids: string[]
warehouse_ids: string[]
pos_ids: string[]
}
checked_at: string
valid_for_ms: number
step_up_at: (string | null)
}
export interface ProblemDetailsV3 {
type: string
title: string
status: (400 | 401 | 403 | 404 | 406 | 409 | 410 | 413 | 415 | 422 | 429 | 500 | 503 | 504)
instance: string
code: string
trace_id: string
retryable: boolean
detail?: string
correlation_id?: string
errors?: {
path: string
code: string
message?: string
}[]
}
export interface AuthorizationRequest {
request: CanonicalRequest
delegation_jwt: string
client_signal: ClientSignal
}
export interface WarehouseCreate {
organization_id: string
branch_id: string
operation_id: string
name: string
}
export interface AdjustmentRequest {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
operation_id: string
reason_code: ("opening_stock" | "correction")
lines: {
line_id: string
presentation_id: string
product_version: number
presentation_version: number
quantity: string
direction: ("in" | "out")
expected_version: number
}[]
reconciliation_id?: string
}
export interface HistoryRequest {
organization_id: string
reason_code: "rebuild_own_inventory"
families: ("inventory.stock-adjustment.recorded.v1" | "inventory.sale-stock.posted.v2" | "inventory.sale-stock.compensated.v1" | "inventory.reconciliation-required.v2")[]
from_sequence: string
limit: number
to_sequence?: string
}
export interface Delegation {
organization_id: string
operation_id: ("createInitialWarehouse" | "listInventoryWarehouses" | "getInventoryWarehouse" | "adjustInventoryStock" | "getInventoryAdjustment" | "getInventoryPosition" | "listInventoryPositions" | "listInventoryReconciliations" | "getInventoryReconciliation" | "createInventoryHistoryReadSession" | "readInventoryHistoryFacts")
request_hash: string
canonicalization_version: "inventory-request-v1"
delegation_id: string
delegation_jwt: string
caller: "gateway-bff"
audience: "inventory.user-api"
issued_at: string
expires_at: string
}
export interface DelegationRequest {
request: CanonicalRequest
client_signal: ClientSignal
}
