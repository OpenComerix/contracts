// Generated from sales/http/private/v1/sales-finance-step-authority-v1.yaml at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export interface SalesFinanceStepAuthorityV1Operations {
authorizeSaleProcessStep: {
method: "POST"
path: "/internal/sales/process-step-authorizations"
parameters: {

}
responses: {
"200": {
content: {
"application/json": Decision
}
headers: {
"Cache-Control": "no-store"
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: "sales_invalid_request"
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
code?: ("platform_workload_forbidden" | "sales_process_step_not_authorized")
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
"application/json": Request
}
}
}
export interface Decision {
organization_id: string
operation_id: string
process_id: string
process_version: number
step_id: string
step: "finance.record-sale-cash.v1"
command_id: string
target: "finance"
command_fingerprint: string
authorized: true
caller: "finance"
audience: "sales-pos.process-authority"
checked_at: string
valid_for_ms: number
stock: StockEvidence
authorized_responsible: {
account_ref: string
membership_ref: string
device_ref: string
cash_shift_id: string
}
}
export interface StockEvidence {
operation_id: string
result_id: string
command_id: string
status: "succeeded"
stock_status: ("posted" | "not_required")
reconciliation_required: boolean
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
process_id: string
process_version: number
step_id: string
step: "finance.record-sale-cash.v1"
command_id: string
target: "finance"
command_fingerprint: string
}
