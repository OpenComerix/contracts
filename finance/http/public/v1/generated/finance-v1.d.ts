// Generated from finance/http/public/v1/finance-v1.yaml at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export interface FinanceV1Operations {
createPosCashRegister: {
method: "POST"
path: "/finance/cash-registers"
parameters: {
header: {
"Idempotency-Key": string
Origin: string
"X-CSRF-Token": string
}
}
responses: {
"201": {
content: {
"application/json": HttpCashRegister
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
code?: ("finance_cash_shift_required" | "finance_cash_shift_not_open" | "finance_cash_shift_already_open" | "finance_version_conflict" | "finance_state_conflict" | "finance_operation_conflict" | "finance_idempotency_key_reused" | "finance_idempotency_request_in_progress" | "finance_history_coverage_changed")
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
"application/json": CashRegisterCreate
}
}
openCashShift: {
method: "POST"
path: "/finance/cash-shifts"
parameters: {
header: {
"Idempotency-Key": string
Origin: string
"X-CSRF-Token": string
}
}
responses: {
"201": {
content: {
"application/json": HttpCashShift
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
code?: ("finance_cash_shift_required" | "finance_cash_shift_not_open" | "finance_cash_shift_already_open" | "finance_version_conflict" | "finance_state_conflict" | "finance_operation_conflict" | "finance_idempotency_key_reused" | "finance_idempotency_request_in_progress" | "finance_history_coverage_changed")
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
code?: ("finance_cash_amount_invalid" | "finance_currency_unsupported")
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
"application/json": OpenShiftRequest
}
}
}
export interface HttpCashRegister {
cash_register_id: string
organization_id: string
branch_id: string
pos_id: string
name: string
version: number
created_at: string
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
export interface CashRegisterCreate {
operation_id: string
organization_id: string
branch_id: string
pos_id: string
name: string
}
export interface HttpCashShift {
cash_shift_id: string
organization_id: string
branch_id: string
pos_id: string
cash_register_id: string
operation_id: string
responsible_account_ref: string
responsible_membership_ref: string
device_ref: string
currency: "ARS"
opening_float: string
opening_movement_id: (string | null)
opened_at: string
operating_date: OperatingDate
status: ("open" | "closed")
version: number
[k: string]: unknown
}
export interface OperatingDate {
business_date: string
time_zone: string
date_policy_version: string
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
