// Generated from catalog/http/private/v1/catalog-sale-capture-v1.yaml at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


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
export type QuantityDecimal = string
export type CanonicalSku = string
export type PriceDecimal = string
export type TaxCode = string
export type AggregateVersion = number
export type Name160 = string
export type TaxCode2 = string

export interface CatalogSaleCaptureV1Operations {
captureSaleCatalog: {
method: "POST"
path: "/internal/catalog/sale-captures"
parameters: {

}
responses: {
"200": {
content: {
"application/json": Capture
}
headers: {
"Cache-Control": "no-store"
}
}
"400": {
content: {
"application/problem+json": (ProblemDetailsV3 & {
status?: 400
code?: "catalog_invalid_request"
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
code?: "platform_workload_forbidden"
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
code?: "catalog_resource_not_found"
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
code?: "catalog_version_conflict"
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
code?: "catalog_semantic_validation_failed"
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
"application/json": CaptureRequest
}
}
}
export interface Capture {
capture_id: string
organization_id: string
operation_id: string
preparation_id: string
request_hash: string
captured_at: string
consistent_group: true
lines: CommercialSnapshot[]
}
export interface Classification {
code: TaxCode
version: AggregateVersion
country_code: "AR"
name: Name160
selectable: boolean
components: ClassificationComponent[]
}
export interface ClassificationComponent {
tax_code: TaxCode
jurisdiction_code: TaxCode
treatment: ("taxable" | "exempt" | "not_taxable")
rule_ref: ClassificationRule
}
export interface ClassificationRule {
code: TaxCode
version: AggregateVersion
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
export interface CaptureRequest {
organization_id: string
operation_id: string
preparation_id: string
request_hash: string
lines: Reference[]
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
classification_code: TaxCode2
classification_version: number
observed_unit_price: PriceDecimal
barcode?: string
}
