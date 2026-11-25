// Generated from inventory/http/private/v1/inventory-internal-v1.yaml at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type ClientSignal = string
export type PhysicalSnapshot = {
line_id: string
product_id: string
variant_id: string
presentation_id: string
product_version: number
presentation_version: number
variant_version_source: "product_version"
product_type: ("STOCKED_GOOD" | "NON_STOCK_GOOD" | "SERVICE")
product_status: "active"
presentation_status: "active"
description: string
base_unit: UnitCode
presentation_unit: UnitCode
conversion_factor: ConversionFactor
allows_fractions: boolean
minimum_quantity: PositiveQuantity
quantity_increment: PositiveQuantity
}
export type UnitCode = ("unit" | "kg" | "g" | "l" | "ml" | "m" | "cm" | "m2")
export type ConversionFactor = string
export type PositiveQuantity = QuantityDecimal
export type QuantityDecimal = string
export type Cursor = string
export type PageLimit = number

export interface InventoryInternalV1Operations {
adjustInventoryStock: {
method: "POST"
path: "/inventory/adjustments"
parameters: {
header: {
"Idempotency-Key": string
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"201": {
content: {
"application/json": HttpAdjustment
}
headers: {
"Cache-Control": "no-store"
Location: string
"Idempotency-Replayed": boolean
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("inventory_invalid_request" | "inventory_invalid_history_cursor")
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
code?: ("inventory_delegation_invalid" | "identity_session_invalid_or_expired" | "platform_workload_invalid")
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
code?: ("inventory_delegation_request_mismatch" | "identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"404": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 404
code?: "inventory_resource_not_found"
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
"409": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 409
code?: ("inventory_version_conflict" | "inventory_state_conflict" | "inventory_operation_conflict" | "inventory_idempotency_key_reused" | "inventory_idempotency_request_in_progress" | "inventory_history_coverage_changed")
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
"422": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 422
code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid")
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
"application/json": AdjustmentRequest
}
}
createInitialWarehouse: {
method: "POST"
path: "/inventory/warehouses"
parameters: {
header: {
"Idempotency-Key": string
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"201": {
content: {
"application/json": HttpWarehouse
}
headers: {
"Cache-Control": "no-store"
Location: string
"Idempotency-Replayed": boolean
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("inventory_invalid_request" | "inventory_invalid_history_cursor")
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
code?: ("inventory_delegation_invalid" | "identity_session_invalid_or_expired" | "platform_workload_invalid")
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
code?: ("inventory_delegation_request_mismatch" | "identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"404": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 404
code?: "inventory_resource_not_found"
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
"409": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 409
code?: ("inventory_version_conflict" | "inventory_state_conflict" | "inventory_operation_conflict" | "inventory_idempotency_key_reused" | "inventory_idempotency_request_in_progress" | "inventory_history_coverage_changed")
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
"422": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 422
code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid")
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
"application/json": WarehouseCreate
}
}
getInventoryAdjustment: {
method: "GET"
path: "/inventory/adjustments/{adjustment_id}"
parameters: {
path: {
adjustment_id: string
}
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": HttpAdjustment
}
headers: {
"Cache-Control": "no-store"
ETag: string
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("inventory_invalid_request" | "inventory_invalid_history_cursor")
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
code?: ("inventory_delegation_invalid" | "identity_session_invalid_or_expired" | "platform_workload_invalid")
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
code?: ("inventory_delegation_request_mismatch" | "identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"404": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 404
code?: "inventory_resource_not_found"
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
"409": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 409
code?: ("inventory_version_conflict" | "inventory_state_conflict" | "inventory_operation_conflict" | "inventory_idempotency_key_reused" | "inventory_idempotency_request_in_progress" | "inventory_history_coverage_changed")
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
"422": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 422
code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid")
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
}
getInventoryReconciliation: {
method: "GET"
path: "/inventory/reconciliations/{reconciliation_id}"
parameters: {
path: {
reconciliation_id: string
}
header: {
"X-OC-Client-Signal": ClientSignal
}
query: {
limit?: number
cursor?: string
}
}
responses: {
"200": {
content: {
"application/json": HttpReconciliation
}
headers: {
"Cache-Control": "no-store"
ETag: string
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("inventory_invalid_request" | "inventory_invalid_history_cursor")
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
code?: ("inventory_delegation_invalid" | "identity_session_invalid_or_expired" | "platform_workload_invalid")
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
code?: ("inventory_delegation_request_mismatch" | "identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"404": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 404
code?: "inventory_resource_not_found"
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
"409": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 409
code?: ("inventory_version_conflict" | "inventory_state_conflict" | "inventory_operation_conflict" | "inventory_idempotency_key_reused" | "inventory_idempotency_request_in_progress" | "inventory_history_coverage_changed")
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
"422": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 422
code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid")
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
}
getInventoryWarehouse: {
method: "GET"
path: "/inventory/warehouses/{warehouse_id}"
parameters: {
path: {
warehouse_id: string
}
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": HttpWarehouse
}
headers: {
"Cache-Control": "no-store"
ETag: string
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("inventory_invalid_request" | "inventory_invalid_history_cursor")
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
code?: ("inventory_delegation_invalid" | "identity_session_invalid_or_expired" | "platform_workload_invalid")
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
code?: ("inventory_delegation_request_mismatch" | "identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"404": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 404
code?: "inventory_resource_not_found"
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
"409": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 409
code?: ("inventory_version_conflict" | "inventory_state_conflict" | "inventory_operation_conflict" | "inventory_idempotency_key_reused" | "inventory_idempotency_request_in_progress" | "inventory_history_coverage_changed")
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
"422": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 422
code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid")
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
}
listInventoryPositions: {
method: "GET"
path: "/inventory/positions"
parameters: {
header: {
"X-OC-Client-Signal": ClientSignal
}
query: {
limit?: number
cursor?: string
branch_id?: string
warehouse_id?: string
location_id?: string
variant_id?: string
}
}
responses: {
"200": {
content: {
"application/json": HttpPositions
}
headers: {
"Cache-Control": "no-store"
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("inventory_invalid_request" | "inventory_invalid_history_cursor")
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
code?: ("inventory_delegation_invalid" | "identity_session_invalid_or_expired" | "platform_workload_invalid")
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
code?: ("inventory_delegation_request_mismatch" | "identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"404": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 404
code?: "inventory_resource_not_found"
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
"409": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 409
code?: ("inventory_version_conflict" | "inventory_state_conflict" | "inventory_operation_conflict" | "inventory_idempotency_key_reused" | "inventory_idempotency_request_in_progress" | "inventory_history_coverage_changed")
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
"422": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 422
code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid")
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
}
listInventoryWarehouses: {
method: "GET"
path: "/inventory/warehouses"
parameters: {
header: {
"X-OC-Client-Signal": ClientSignal
}
query: {
limit?: number
cursor?: string
branch_id: string
}
}
responses: {
"200": {
content: {
"application/json": HttpWarehouses
}
headers: {
"Cache-Control": "no-store"
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("inventory_invalid_request" | "inventory_invalid_history_cursor")
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
code?: ("inventory_delegation_invalid" | "identity_session_invalid_or_expired" | "platform_workload_invalid")
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
code?: ("inventory_delegation_request_mismatch" | "identity_access_denied" | "identity_reauthentication_required" | "platform_workload_forbidden")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
"404": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 404
code?: "inventory_resource_not_found"
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
"409": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 409
code?: ("inventory_version_conflict" | "inventory_state_conflict" | "inventory_operation_conflict" | "inventory_idempotency_key_reused" | "inventory_idempotency_request_in_progress" | "inventory_history_coverage_changed")
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
"422": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 422
code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid")
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
}
}
export interface HttpAdjustment {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
operation_id: string
adjustment_id: string
version: number
reason_code: ("opening_stock" | "correction")
movements: Movement[]
recorded_at: string
reconciliation_id?: string
extensions?: {

}
[k: string]: unknown
}
export interface Movement {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
occurred_at: string
recorded_at: string
operational_date: string
time_zone: "America/Argentina/Buenos_Aires"
time_policy_version: string
movement_id: string
movement_version: number
operation_id: string
line_id: string
position_id: string
position_version: number
snapshot: PhysicalSnapshot
quantity: string
base_quantity: string
direction: ("in" | "out")
reason_code: ("opening_stock" | "correction" | "sale" | "technical_compensation")
before: string
after: string
original_movement_id?: string
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
export interface HttpWarehouse {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
name: string
version: number
initial: true
created_at: string
[k: string]: unknown
}
export interface WarehouseCreate {
organization_id: string
branch_id: string
operation_id: string
name: string
}
export interface HttpReconciliation {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
reconciliation_id: string
position_id: string
version: number
status: "open"
opened_at: string
occurrences: ReconciliationOccurrence[]
page: Page
[k: string]: unknown
}
export interface ReconciliationOccurrence {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
reconciliation_id: string
occurrence_id: string
operation_id: string
sale_id: string
position_id: string
movement_ids: string[]
difference: Difference
detected_at: string
compensation_operation_id?: string
extensions?: {

}
}
export interface Difference {
position_id: string
reconciliation_id: string
occurrence_id: string
line_ids: string[]
policy: "ALLOW_AND_ALERT"
policy_version: number
reason_code: "physical_product_present_stock_difference"
before: string
issued: string
after: string
}
export interface Page {
next_cursor: (Cursor | null)
has_more: boolean
limit: PageLimit
[k: string]: unknown
}
export interface HttpPositions {
items: Position[]
page: Page
[k: string]: unknown
}
export interface Position {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
position_id: string
product_id: string
variant_id: string
base_unit: UnitCode
on_hand: string
available: string
version: number
as_of: string
has_movements: boolean
}
export interface HttpWarehouses {
items: Warehouse[]
page: Page
[k: string]: unknown
}
export interface Warehouse {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
name: string
version: number
initial: true
created_at: string
}
