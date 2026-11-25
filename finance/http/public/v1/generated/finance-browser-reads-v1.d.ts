// Generated from finance/http/public/v1/finance-browser-reads-v1.yaml at 96d6e4909b08e7406c5bd0289e9cce1b04122349.


export interface FinanceBrowserReadsV1Operations {
getCashShift: {
method: "GET"
path: "/finance/cash-shifts/{cash_shift_id}"
parameters: {
path: {
cash_shift_id: string
}
header: {
Origin?: string
}
}
responses: {
"200": {
content: {
"application/json": HttpCashShift
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
}
getCashShiftExpected: {
method: "GET"
path: "/finance/cash-shifts/{cash_shift_id}/expected"
parameters: {
path: {
cash_shift_id: string
}
header: {
Origin?: string
}
}
responses: {
"200": {
content: {
"application/json": HttpExpected
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
}
getOpenCashShift: {
method: "GET"
path: "/finance/cash-registers/{cash_register_id}/open-shift"
parameters: {
path: {
cash_register_id: string
}
header: {
Origin?: string
}
}
responses: {
"200": {
content: {
"application/json": HttpOpenShift
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
code?: ("identity_access_denied" | "identity_reauthentication_required")
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
}
listCashRegisters: {
method: "GET"
path: "/finance/cash-registers"
parameters: {
query: {
pos_id: string
limit?: number
cursor?: string
}
header: {
Origin?: string
}
}
responses: {
"200": {
content: {
"application/json": HttpCashRegisters
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
}
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
export interface HttpExpected {
organization_id: string
cash_shift_id: string
cash_register_id: string
currency: "ARS"
method: "cash"
amount: string
shift_version: number
as_of: string
[k: string]: unknown
}
export interface HttpOpenShift {
organization_id: string
branch_id: string
pos_id: string
cash_register_id: string
cash_shift: (HttpOpenShiftRef | null)
[k: string]: unknown
}
export interface HttpOpenShiftRef {
cash_shift_id: string
version: number
[k: string]: unknown
}
export interface HttpCashRegisters {
items: CashRegister[]
page: Page
[k: string]: unknown
}
export interface CashRegister {
cash_register_id: string
organization_id: string
branch_id: string
pos_id: string
name: string
version: number
created_at: string
}
export interface Page {
next_cursor: (string | null)
has_more: boolean
limit: number
}
