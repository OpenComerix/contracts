// Generated from identity/http/private/v1/identity-finance-authority-v1.yaml at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type CanonicalRequest = ({
canonicalization_version: "finance-request-v1"
operation_id: "createPosCashRegister"
method: "POST"
path: string
query: {

}
body: CashRegisterCreate
idempotency_key: string
} | {
canonicalization_version: "finance-request-v1"
operation_id: "listCashRegisters"
method: "GET"
path: string
query: {
pos_id: string
limit?: string
cursor?: string
}
body: null
idempotency_key: null
} | {
canonicalization_version: "finance-request-v1"
operation_id: "openCashShift"
method: "POST"
path: string
query: {

}
body: OpenShiftRequest
idempotency_key: string
} | {
canonicalization_version: "finance-request-v1"
operation_id: "getCashShift"
method: "GET"
path: string
query: {

}
body: null
idempotency_key: null
} | {
canonicalization_version: "finance-request-v1"
operation_id: "getCashShiftExpected"
method: "GET"
path: string
query: {

}
body: null
idempotency_key: null
} | {
canonicalization_version: "finance-request-v1"
operation_id: "createFinanceHistoryReadSession"
method: "POST"
path: string
query: {

}
body: HistoryRequest
idempotency_key: string
} | {
canonicalization_version: "finance-request-v1"
operation_id: "readFinanceHistoryFacts"
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

export interface IdentityFinanceAuthorityV1Operations {
checkFinanceAuthorization: {
method: "POST"
path: "/internal/identity/finance-authorizations"
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
createFinanceDelegation: {
method: "POST"
path: "/internal/identity/finance-delegations"
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
operation_id: ("createPosCashRegister" | "listCashRegisters" | "openCashShift" | "getCashShift" | "getCashShiftExpected" | "createFinanceHistoryReadSession" | "readFinanceHistoryFacts")
permission: ("finance.cash.configure" | "finance.cash.read" | "finance.cash.open" | "finance.history.read")
canonicalization_version: "finance-request-v1"
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
export interface CashRegisterCreate {
operation_id: string
organization_id: string
branch_id: string
pos_id: string
name: string
}
export interface OpenShiftRequest {
operation_id: string
organization_id: string
branch_id: string
pos_id: string
cash_register_id: string
currency: "ARS"
opening_float: string
}
export interface HistoryRequest {
operation_id: string
organization_id: string
reason_code: ("reconciliation" | "own_data_export" | "reconstruction")
families: ("finance.cash-shift.opened.v1" | "finance.cash-movement.recorded.v1" | "finance.sale-payment.recorded.v2")[]
from_sequence: string
to_sequence: (string | null)
limit: number
}
export interface Delegation {
organization_id: string
operation_id: ("createPosCashRegister" | "listCashRegisters" | "openCashShift" | "getCashShift" | "getCashShiftExpected" | "createFinanceHistoryReadSession" | "readFinanceHistoryFacts")
request_hash: string
canonicalization_version: "finance-request-v1"
delegation_id: string
delegation_jwt: string
caller: "gateway-bff"
audience: "finance.user-api"
issued_at: string
expires_at: string
}
export interface DelegationRequest {
request: CanonicalRequest
client_signal: ClientSignal
}
