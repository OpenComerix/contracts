// Generated from identity/http/private/v2/identity-sales-authority-v2.yaml at 019a75d86fd12df53b433aebdc269e85a4064f73.


export type CanonicalRequest = ({
canonicalization_version: "sales-request-v1"
operation_id: "finalizeOnlineSale"
method: "POST"
path: string
query: {

}
body: Finalize
idempotency_key: string
} | {
canonicalization_version: "sales-request-v1"
operation_id: "getSaleFinalization"
method: "GET"
path: string
query: {

}
body: null
idempotency_key: null
} | {
canonicalization_version: "sales-request-v1"
operation_id: "getCompletedSale"
method: "GET"
path: string
query: {

}
body: null
idempotency_key: null
} | {
canonicalization_version: "sales-request-v1"
operation_id: "resumeSaleFinalization"
method: "POST"
path: string
query: {

}
body: Resume
idempotency_key: string
} | {
canonicalization_version: "sales-request-v1"
operation_id: "createSalesHistoryReadSession"
method: "POST"
path: string
query: {

}
body: HistoryRequest
idempotency_key: string
} | {
canonicalization_version: "sales-request-v1"
operation_id: "readSalesHistoryFacts"
method: "GET"
path: string
query: {
limit?: string
cursor?: string
}
body: null
idempotency_key: null
})
export type QuantityDecimal = string
export type TaxCode = string
export type PriceDecimal = string
export type ClientSignal = string

export interface IdentitySalesAuthorityV2Operations {
checkSalesAuthorization: {
method: "POST"
path: "/internal/identity/sales-authorizations"
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
code?: ("platform_dependency_unavailable" | "platform_capacity_exhausted")
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
createSalesDelegation: {
method: "POST"
path: "/internal/identity/sales-delegations"
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
code?: ("platform_dependency_unavailable" | "platform_capacity_exhausted")
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
authorized: true
decision_ref: string
account_ref: string
membership_ref: string
session_ref: string
device_ref: string
organization_id: string
operation_id: ("finalizeOnlineSale" | "getSaleFinalization" | "getCompletedSale" | "resumeSaleFinalization" | "createSalesHistoryReadSession" | "readSalesHistoryFacts")
permission: ("sales.finalize" | "sales.read" | "sales.process.resume" | "sales.history.read")
canonicalization_version: "sales-request-v1"
request_hash: string
checked_at: string
valid_for_ms: number
scope: {
organization_id: string
branch_ids: string[]
pos_ids: string[]
}
versions: {
account: string
session: string
credential: string
membership: string
authorization: string
device: string
approval: string
}
step_up_at: (string | null)
stock_difference?: {
permission: "inventory.sell_with_stock_difference"
granted: boolean
organization_id: string
operation_id: string
request_hash: string
lines: {
line_id: string
quantity: string
physical_presence_confirmed: true
}[]
}
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
client_signal: ClientSignal
delegation_jwt: string
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
export interface HistoryRequest {
operation_id: string
organization_id: string
reason_code: ("reconciliation" | "own_data_export" | "reconstruction")
families: ("sales.sale.completed.v2" | "sales.sale.completed.v3")[]
from_sequence: string
to_sequence: (string | null)
limit: number
}
export interface Delegation {
organization_id: string
operation_id: ("finalizeOnlineSale" | "getSaleFinalization" | "getCompletedSale" | "resumeSaleFinalization" | "createSalesHistoryReadSession" | "readSalesHistoryFacts")
request_hash: string
canonicalization_version: "sales-request-v1"
delegation_id: string
delegation_jwt: string
caller: "gateway-bff"
audience: "sales-pos.user-api"
issued_at: string
expires_at: string
}
export interface DelegationRequest {
request: CanonicalRequest
client_signal: ClientSignal
}
