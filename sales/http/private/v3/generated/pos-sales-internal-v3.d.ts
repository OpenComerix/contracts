// Generated from sales/http/private/v3/pos-sales-internal-v3.yaml at 019a75d86fd12df53b433aebdc269e85a4064f73.


export type QuantityDecimal = string
export type TaxCode = string
export type PriceDecimal = string
export type HttpSale = {
sale_id: string
organization_id: string
operation_id: string
process_id: string
sale_version: 1
commercial_number: CommercialNumber
commercial_status: "completed"
context: Context
occurred_at: string
received_at: string
accepted_at: string
captured_at: string
completed_at: string
operating_date: OperatingDate
capture_id: string
currency: "ARS"
tax_included: true
calculation_policy_version: "sales-f1-ars-1"
lines: Line[]
totals: {
gross: string
discount: "0.00"
charges: "0.00"
commercial_total: string
}
fiscal_context: FiscalContext
stock: StockEffect
payment: PaymentEffect
provenance: {
catalog: "catalog-pricing.captureSaleCatalog.v1"
context: "backend_validated"
calculation: "sales-pos"
snapshot: "immutable_at_acceptance"
}
[k: string]: unknown
}
export type CommercialSnapshot = {
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
sku: CanonicalSku
barcode: (string | null)
price_id: string
price_list_id: string
price_version: number
price_list_version: number
unit_price: PriceDecimal
currency: "ARS"
tax_included: true
price_valid_from: string
price_valid_to: (string | null)
classification: Classification
}
export type UnitCode = ("unit" | "kg" | "g" | "l" | "ml" | "m" | "cm" | "m2")
export type ConversionFactor = string
export type PositiveQuantity = QuantityDecimal
export type CanonicalSku = string
export type TaxCode2 = string
export type AggregateVersion = number
export type Name160 = string
export type Quantity = string
export type BaseQuantity = string
export type FiscalContext = (FiscalPending | FiscalResolved)
export type Recipient = ({
kind: "identified"
identity: TaxIdentity
} | {
kind: "anonymous"
reason_code: "identification_not_required"
rule: Rule
})
export type Intermediate = string
export type SignedIntermediate = string
export type Money = string
export type HttpOperation = {
organization_id: string
operation_id: string
sale_id: string
process_id: string
version: number
status: ("accepted" | "stock_pending" | "payment_pending" | "completion_pending" | "compensating" | "completed" | "rejected" | "requires_attention")
accepted_at: string
updated_at: string
stock_step: ("not_requested" | "pending" | "unknown" | "succeeded" | "rejected" | "compensated")
payment_step: StepState
compensation_step: StepState
stock: (StockEffect | null)
payment: (PaymentEffect | null)
sale: (Sale | null)
problem: ({
owner: ("sales-pos" | "inventory" | "finance")
code: string
retryable: boolean
} | null)
next_action: ("wait" | "completed" | "review_purchase" | "resume" | "reconcile")
compensation: (CompensationEffect | null)
[k: string]: unknown
}
export type StepState = ("not_requested" | "pending" | "unknown" | "succeeded" | "rejected")
export type Sale = {
sale_id: string
organization_id: string
operation_id: string
process_id: string
sale_version: 1
commercial_number: CommercialNumber
commercial_status: "completed"
context: Context
occurred_at: string
received_at: string
accepted_at: string
captured_at: string
completed_at: string
operating_date: OperatingDate
capture_id: string
currency: "ARS"
tax_included: true
calculation_policy_version: "sales-f1-ars-1"
lines: Line[]
totals: {
gross: string
discount: "0.00"
charges: "0.00"
commercial_total: string
}
fiscal_context: FiscalContext
stock: StockEffect
payment: PaymentEffect
provenance: {
catalog: "catalog-pricing.captureSaleCatalog.v1"
context: "backend_validated"
calculation: "sales-pos"
snapshot: "immutable_at_acceptance"
}
}
export type CompensationEffect = {
operation_id: string
original_operation_id: string
command_id: string
result_id: (string | null)
status: ("pending" | "unknown" | "succeeded" | "rejected")
recorded_at: (string | null)
movements: {
movement_id: string
movement_version: number
}[]
}

export interface PosSalesInternalV3Operations {
finalizeOnlineSale: {
method: "POST"
path: "/sales/finalizations"
parameters: {
header: {
"Idempotency-Key": string
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
code?: ("sales_delegation_invalid" | "platform_workload_invalid")
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
code?: ("identity_access_denied" | "identity_reauthentication_required" | "sales_delegation_request_mismatch" | "platform_workload_forbidden")
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
getCompletedSale: {
method: "GET"
path: "/sales/{sale_id}"
parameters: {
path: {
sale_id: string
}
}
responses: {
"200": {
content: {
"application/json": HttpSale
}
headers: {
"Cache-Control": "no-store"
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
code?: ("sales_delegation_invalid" | "platform_workload_invalid")
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
code?: ("identity_access_denied" | "identity_reauthentication_required" | "sales_delegation_request_mismatch" | "platform_workload_forbidden")
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
}
getSaleFinalization: {
method: "GET"
path: "/sales/finalizations/{operation_id}"
parameters: {
path: {
operation_id: string
}
}
responses: {
"200": {
content: {
"application/json": HttpOperation
}
headers: {
"Cache-Control": "no-store"
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
code?: ("sales_delegation_invalid" | "platform_workload_invalid")
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
code?: ("identity_access_denied" | "identity_reauthentication_required" | "sales_delegation_request_mismatch" | "platform_workload_forbidden")
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
code?: ("sales_delegation_invalid" | "platform_workload_invalid")
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
code?: ("identity_access_denied" | "identity_reauthentication_required" | "sales_delegation_request_mismatch" | "platform_workload_forbidden")
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
export interface CommercialNumber {
series: string
number: string
numbering_policy_version: string
series_id: string
owning_domain: "sales-pos"
document_type: "retail_sale"
display_number: string
format_version: string
}
export interface Context {
organization_id: string
branch_id: string
pos_id: string
warehouse_id: string
location_id: string
cash_register_id: string
cash_shift_id: string
}
export interface Line {
line_id: string
catalog: CommercialSnapshot
quantity: Quantity
base_quantity: BaseQuantity
physical_presence_confirmed: boolean
gross_amount: string
discount_amount: "0.00"
charge_amount: "0.00"
commercial_total: string
}
export interface Classification {
code: TaxCode2
version: AggregateVersion
country_code: "AR"
name: Name160
selectable: boolean
components: ClassificationComponent[]
}
export interface ClassificationComponent {
tax_code: TaxCode2
jurisdiction_code: TaxCode2
treatment: ("taxable" | "exempt" | "not_taxable")
rule_ref: ClassificationRule
}
export interface ClassificationRule {
code: TaxCode2
version: AggregateVersion
}
export interface FiscalPending {
context_status: "pending_profile"
tax_snapshot_schema_version: 1
reason: "profile_unavailable"
fiscal_status: "pending"
}
export interface FiscalResolved {
context_status: "resolved"
tax_snapshot_schema_version: 1
fiscal_status: "pending"
issuer: TaxIdentity
recipient: Recipient
profile: {
profile_id: string
version: string
valid_from: string
valid_to: (string | null)
captured_at: string
}
requested_fiscal_date: string
operation_purpose: "retail_sale"
requested_document_profile: string
jurisdictions: Jurisdiction[]
rules: Rule[]
lines: TaxLine[]
groups: TaxGroup[]
totals: {
taxable_net: string
vat: string
not_taxable: string
exempt: string
other_taxes: string
total: string
}
exchange: {
currency: "ARS"
base_currency: "ARS"
rate: "1"
source: "same_currency"
captured_at: string
}
decisions: {
code: string
rule: Rule
}[]
}
export interface TaxIdentity {
source: ("identity-tenancy" | "business-partners" | "tax-compliance")
source_version: string
identification_type: string
identification_number: string
legal_name: string
tax_condition: string
address: {
country: "AR"
province_code: string
locality: string
postal_code: string
street: string
}
}
export interface Rule {
code: string
version: string
}
export interface Jurisdiction {
country: "AR"
level: ("national" | "provincial" | "municipal")
code: string
}
export interface TaxLine {
line_id: string
components: TaxComponent[]
}
export interface TaxComponent {
component_id: string
jurisdiction: Jurisdiction
tax_code: string
treatment: ("taxable" | "exempt" | "not_taxable")
concept_code: string
category: ("vat" | "other")
base: Intermediate
rate: string
amount: string
included: boolean
rule: Rule
reason: (string | null)
theoretical_amount: Intermediate
allocated_residue: SignedIntermediate
allocated_base: Money
base_residue: SignedIntermediate
}
export interface TaxGroup {
group_id: string
jurisdiction: Jurisdiction
tax_code: string
treatment: ("taxable" | "exempt" | "not_taxable")
concept_code: string
category: ("vat" | "other")
rate: string
base: Intermediate
amount: string
rule: Rule
line_ids: string[]
allocated_base: Money
base_residue: SignedIntermediate
}
export interface StockEffect {
status: ("posted" | "not_required")
command_id: string
result_id: string
recorded_at: string
movements: {
movement_id: string
movement_version: number
line_ids: string[]
}[]
reconciliation_required: boolean
reconciliations: {
reconciliation_id: string
occurrence_id: string
code: "inventory_stock_difference_recorded"
severity: "action_required"
}[]
}
export interface PaymentEffect {
status: "paid"
command_id: string
result_id: string
payment_id: string
movement_id: string
payment_version: 1
shift_version: number
recorded_at: string
method: "cash"
currency: "ARS"
applied: string
received: string
change: string
}
export interface Resume {
operation_id: string
expected_version: number
reason_code: ("dependency_restored" | "reconcile_unknown" | "retry_exhausted")
}
