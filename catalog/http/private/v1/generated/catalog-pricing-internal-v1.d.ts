// Generated from catalog/http/private/v1/catalog-pricing-internal-v1.yaml at 68d923e903b6341eedb980af3586890c0eab7d5e.


export type IdempotencyKey = string
export type ClientSignal = string
export type CatalogId = string
export type IdentityReference = string
export type AggregateVersion = number
export type Name80 = string
export type CacheControl = "no-store"
export type ETag = string
export type IdempotencyReplayed = boolean
export type Location = string
export type RetryAfter = string
export type Product = {
product_id: CatalogId
organization_id: IdentityReference
version: AggregateVersion
created_at: string
updated_at: string
name: Name160
description: (Description | null)
type: ProductType
category_id: (CatalogId | null)
tax_classification: (TaxReferenceResponse | null)
status: State
default_variant: DefaultVariant
base_presentation_id: CatalogId
matched_presentation_id?: CatalogId
[k: string]: unknown
}
export type Name160 = string
export type Description = string
export type ProductType = ("STOCKED_GOOD" | "NON_STOCK_GOOD" | "SERVICE")
export type TaxCode = string
export type State = ("draft" | "active" | "inactive" | "discontinued")
export type CanonicalSku = string
export type Plu = string
export type UnitCode = ("unit" | "kg" | "g" | "l" | "ml" | "m" | "cm" | "m2")
export type Sku = string
export type BasePresentationCreate = {
name: Name80
allows_fractions: boolean
minimum_quantity: PositiveQuantity
quantity_increment: PositiveQuantity
}
export type PositiveQuantity = QuantityDecimal
export type QuantityDecimal = string
export type PriceDecimal = string
export type PriceExpectedVersion = number
export type PageLimit = number
export type Cursor = string
export type Presentation = {
presentation_id: CatalogId
product_id: CatalogId
variant_id: CatalogId
organization_id: IdentityReference
version: AggregateVersion
created_at: string
updated_at: string
name: Name80
unit_code: UnitCode
conversion_factor: ConversionFactor
allows_fractions: boolean
minimum_quantity: PositiveQuantity
quantity_increment: PositiveQuantity
status: State
[k: string]: unknown
}
export type ConversionFactor = string
export type Units = ({
items?: {
[k: string]: unknown
}
[k: string]: unknown
} & {
items: Unit[]
[k: string]: unknown
})
export type Unit = {
unit_code: UnitCode
dimension: ("count" | "mass" | "volume" | "length" | "area")
name: Name80
symbol: string
[k: string]: unknown
}
export type Action = ("activate" | "inactivate" | "reactivate" | "discontinue")
export type ExpectedVersion = number

export interface CatalogPricingInternalV1Operations {
createCatalogCategory: {
method: "POST"
path: "/catalog/categories"
parameters: {
header: {
"Idempotency-Key": IdempotencyKey
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"201": {
content: {
"application/json": Category
}
headers: {
"Cache-Control": CacheControl
ETag: ETag
"Idempotency-Replayed": IdempotencyReplayed
Location: Location
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"413": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"415": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
requestBody: {
"application/json": CategoryCreate
}
}
createCatalogProduct: {
method: "POST"
path: "/catalog/products"
parameters: {
header: {
"Idempotency-Key": IdempotencyKey
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"201": {
content: {
"application/json": Product
}
headers: {
"Cache-Control": CacheControl
ETag: ETag
"Idempotency-Replayed": IdempotencyReplayed
Location: Location
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"413": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"415": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
requestBody: {
"application/json": ProductCreate
}
}
createPresentationPrice: {
method: "POST"
path: "/pricing/presentations/{presentation_id}/prices"
parameters: {
path: {
presentation_id: CatalogId
}
header: {
"Idempotency-Key": IdempotencyKey
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"201": {
content: {
"application/json": Price
}
headers: {
"Cache-Control": CacheControl
ETag: ETag
"Idempotency-Replayed": IdempotencyReplayed
Location: Location
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"413": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"415": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
requestBody: {
"application/json": PriceSet
}
}
getDefaultPriceList: {
method: "GET"
path: "/pricing/default-list"
parameters: {
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": PriceList
}
headers: {
"Cache-Control": CacheControl
ETag: ETag
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
}
getPresentationCurrentPrice: {
method: "GET"
path: "/pricing/presentations/{presentation_id}/price"
parameters: {
path: {
presentation_id: CatalogId
}
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": Price
}
headers: {
"Cache-Control": CacheControl
ETag: ETag
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
}
listCatalogProductPresentations: {
method: "GET"
path: "/catalog/products/{product_id}/presentations"
parameters: {
path: {
product_id: CatalogId
}
query: {
limit?: PageLimit
cursor?: Cursor
}
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": PresentationsPage
}
headers: {
"Cache-Control": CacheControl
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
}
listCatalogProducts: {
method: "GET"
path: "/catalog/products"
parameters: {
query: {
limit?: PageLimit
cursor?: Cursor
q?: Name160
sku?: Sku
plu?: Plu
barcode?: string
status?: State
category_id?: CatalogId
}
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": ProductsPage
}
headers: {
"Cache-Control": CacheControl
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
}
listCatalogUnits: {
method: "GET"
path: "/catalog/units"
parameters: {
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": Units
}
headers: {
"Cache-Control": CacheControl
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
}
transitionCatalogPresentation: {
method: "POST"
path: "/catalog/presentations/{presentation_id}/transitions"
parameters: {
path: {
presentation_id: CatalogId
}
header: {
"Idempotency-Key": IdempotencyKey
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": Presentation
}
headers: {
"Cache-Control": CacheControl
ETag: ETag
"Idempotency-Replayed": IdempotencyReplayed
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"413": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"415": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
requestBody: {
"application/json": Transition
}
}
transitionCatalogProduct: {
method: "POST"
path: "/catalog/products/{product_id}/transitions"
parameters: {
path: {
product_id: CatalogId
}
header: {
"Idempotency-Key": IdempotencyKey
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": Product
}
headers: {
"Cache-Control": CacheControl
ETag: ETag
"Idempotency-Replayed": IdempotencyReplayed
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"406": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"413": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"415": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
"Retry-After": RetryAfter
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV3
}
headers: {
"Cache-Control": CacheControl
}
}
}
requestBody: {
"application/json": Transition
}
}
}
export interface Category {
category_id: CatalogId
organization_id: IdentityReference
version: AggregateVersion
created_at: string
updated_at: string
name: Name80
parent_id: (CatalogId | null)
status: ("active" | "inactive")
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
export interface CategoryCreate {
name: Name80
parent_id?: (CatalogId | null)
}
export interface TaxReferenceResponse {
code: TaxCode
version: AggregateVersion
[k: string]: unknown
}
export interface DefaultVariant {
variant_id: CatalogId
sku: CanonicalSku
plu: (Plu | null)
base_unit: UnitCode
[k: string]: unknown
}
export interface ProductCreate {
name: Name160
type: ProductType
default_variant: DefaultVariantCreate
base_presentation: BasePresentationCreate
description?: (Description | null)
category_id?: (CatalogId | null)
tax_classification?: (TaxReference | null)
}
export interface DefaultVariantCreate {
sku: Sku
base_unit: UnitCode
plu?: Plu
}
export interface TaxReference {
code: TaxCode
version: AggregateVersion
}
export interface Price {
price_id: CatalogId
organization_id: IdentityReference
price_list_id: CatalogId
product_id: CatalogId
presentation_id: CatalogId
amount: PriceDecimal
currency: "ARS"
tax_included: true
version: AggregateVersion
valid_from: string
valid_to: (string | null)
[k: string]: unknown
}
export interface PriceSet {
amount: PriceDecimal
expected_version: PriceExpectedVersion
}
export interface PriceList {
price_list_id: CatalogId
organization_id: IdentityReference
currency: "ARS"
tax_included: true
version: AggregateVersion
created_at: string
updated_at: string
[k: string]: unknown
}
export interface PresentationsPage {
items: Presentation[]
page: Page
[k: string]: unknown
}
export interface Page {
next_cursor: (Cursor | null)
has_more: boolean
limit: PageLimit
[k: string]: unknown
}
export interface ProductsPage {
items: Product[]
page: Page
[k: string]: unknown
}
export interface Transition {
action: Action
expected_version: ExpectedVersion
}
