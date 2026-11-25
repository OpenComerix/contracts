// Generated from sales/http/public/v3/pos-sales-v3.yaml at 019a75d86fd12df53b433aebdc269e85a4064f73.


export type QuantityDecimal = string
export type TaxCode = string
export type PriceDecimal = string

export interface PosSalesV3Operations {
finalizeOnlineSale: {
method: "POST"
path: "/sales/finalizations"
parameters: {
header: {
"Idempotency-Key": string
Origin: string
"X-CSRF-Token": string
}
}
responses: {
"202": {
content: {
"application/json": HttpAccepted
}
headers: {
"Cache-Control": "no-store"
"Idempotency-Replayed": boolean
Location: string
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("sales_online_invalid_request" | "sales_invalid_history_cursor")
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
code?: "identity_session_invalid_or_expired"
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
code?: ("identity_access_denied" | "identity_reauthentication_required" | "gateway_csrf_invalid")
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
code?: "sales_resource_not_found"
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
code?: ("sales_idempotency_key_reused" | "sales_operation_conflict" | "sales_version_conflict" | "sales_state_conflict" | "sales_idempotency_request_in_progress" | "sales_catalog_version_conflict" | "sales_history_coverage_changed")
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
code?: ("sales_totals_mismatch" | "sales_total_not_positive" | "sales_quantity_invalid" | "sales_fiscal_context_invalid" | "sales_snapshot_too_large")
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
code?: ("platform_dependency_unavailable" | "platform_capacity_exhausted")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
"Retry-After"?: string
}
}
"504": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 504
code?: "gateway_deadline_exceeded"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
}
requestBody: {
"application/json": Finalize
}
}
resumeSaleFinalization: {
method: "POST"
path: "/sales/finalizations/{operation_id}/resume"
parameters: {
path: {
operation_id: string
}
header: {
"Idempotency-Key": string
Origin: string
"X-CSRF-Token": string
}
}
responses: {
"202": {
content: {
"application/json": HttpAccepted
}
headers: {
"Cache-Control": "no-store"
"Idempotency-Replayed": boolean
Location: string
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: ("sales_online_invalid_request" | "sales_invalid_history_cursor")
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
code?: "identity_session_invalid_or_expired"
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
code?: ("identity_access_denied" | "identity_reauthentication_required" | "gateway_csrf_invalid")
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
code?: "sales_resource_not_found"
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
code?: ("sales_idempotency_key_reused" | "sales_operation_conflict" | "sales_version_conflict" | "sales_state_conflict" | "sales_idempotency_request_in_progress" | "sales_catalog_version_conflict" | "sales_history_coverage_changed")
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
code?: ("sales_totals_mismatch" | "sales_total_not_positive" | "sales_quantity_invalid" | "sales_fiscal_context_invalid" | "sales_snapshot_too_large")
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
code?: ("platform_dependency_unavailable" | "platform_capacity_exhausted")
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
"Retry-After"?: string
}
}
"504": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 504
code?: "gateway_deadline_exceeded"
[k: string]: unknown
})
}
headers: {
"Cache-Control": "no-store"
}
}
}
requestBody: {
"application/json": Resume
}
}
}
export interface HttpAccepted {
organization_id: string
operation_id: string
sale_id: string
process_id: string
version: number
status: "accepted"
accepted_at: string
[k: string]: unknown
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
export interface Finalize {
operation_id: string
sale_id: string
context: RequestContext
occurred_at: string
operating_date: OperatingDate
lines: {
reference: Reference
physical_presence_confirmed: boolean
}[]
observed_total: string
payment: {
payment_id: string
method: "cash"
currency: "ARS"
applied: string
received: string
}
}
export interface RequestContext {
organization_id: string
branch_id: string
pos_id: string
warehouse_id: string
location_id: string
cash_register_id: string
cash_shift_id: string
device_ref: string
}
export interface OperatingDate {
business_date: string
time_zone: string
date_policy_version: string
}
export interface Reference {
line_id: string
presentation_id: string
quantity: QuantityDecimal
product_version: number
presentation_version: number
price_id: string
price_version: number
price_list_id: string
price_list_version: number
classification_code: TaxCode
classification_version: number
observed_unit_price: PriceDecimal
barcode?: string
}
export interface Resume {
operation_id: string
expected_version: number
reason_code: ("dependency_restored" | "reconcile_unknown" | "retry_exhausted")
}
