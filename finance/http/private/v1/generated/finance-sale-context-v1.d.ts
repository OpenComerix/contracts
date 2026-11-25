// Generated from finance/http/private/v1/finance-sale-context-v1.yaml at 748cb69b9301243a32c169b01e2c340b7102f020.


export interface FinanceSaleContextV1Operations {
checkFinanceSaleContext: {
method: "POST"
path: "/internal/finance/sale-context-checks"
parameters: {

}
responses: {
"200": {
content: {
"application/json": Result
}
headers: {
"Cache-Control": "no-store"
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: "finance_invalid_request"
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
code?: "platform_workload_invalid"
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
code?: ("platform_workload_forbidden" | "identity_access_denied")
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
code?: "finance_resource_not_found"
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
code?: ("finance_version_conflict" | "finance_state_conflict" | "finance_cash_shift_not_open")
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
}
}
}
requestBody: {
"application/json": Request
}
}
}
export interface Result {
organization_id: string
operation_id: string
preparation_id: string
request_hash: string
context_fingerprint: string
branch_id: string
pos_id: string
cash_register_id: string
cash_shift_id: string
register_version: number
shift_version: number
shift_status: "open"
currency: "ARS"
responsibility_verified: true
checked_at: string
valid_for_ms: number
verified: true
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
export interface Request {
organization_id: string
operation_id: string
preparation_id: string
request_hash: string
branch_id: string
pos_id: string
cash_register_id: string
cash_shift_id: string
expected_register_version?: number
expected_shift_version?: number
}
