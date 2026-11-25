// Generated from identity/http/private/v1/identity-catalog-authority-v1.yaml at 68d923e903b6341eedb980af3586890c0eab7d5e.


export type ClientSignal = string
export type CatalogId = string
export type DelegationId = string
export type CanonicalizationVersion = "catalog-request-v1"
export type RequestHash = string
export type IdentityReference = string
export type IdentityVersion = string
export type Permission = ("catalog.read" | "catalog.manage" | "pricing.read" | "pricing.manage")
export type CacheControl = "no-store"
export type RetryAfter = string

export interface IdentityCatalogAuthorityV1Operations {
checkCatalogAuthorization: {
method: "POST"
path: "/internal/identity/catalog-authorizations"
parameters: {
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": AuthorizationResponse
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
"application/json": AuthorizationRequest
}
}
createCatalogDelegation: {
method: "POST"
path: "/internal/identity/catalog-delegations"
parameters: {
header: {
"X-OC-Client-Signal": ClientSignal
}
}
responses: {
"200": {
content: {
"application/json": DelegationResponse
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
"application/json": DelegationRequest
}
}
}
export interface AuthorizationResponse {
decision: "authorized"
decision_id: CatalogId
delegation_id: DelegationId
operation_id: ("listCatalogUnits" | "listCatalogTaxClassifications" | "listCatalogCategories" | "createCatalogCategory" | "getCatalogCategory" | "updateCatalogCategory" | "moveCatalogCategory" | "inactivateCatalogCategory" | "listCatalogProducts" | "createCatalogProduct" | "getCatalogProduct" | "updateCatalogProduct" | "transitionCatalogProduct" | "listCatalogProductPresentations" | "createCatalogPresentation" | "getCatalogPresentation" | "updateCatalogPresentation" | "transitionCatalogPresentation" | "addCatalogPresentationBarcode" | "retireCatalogPresentationBarcode" | "getDefaultPriceList" | "getPresentationCurrentPrice" | "listPresentationPrices" | "createPresentationPrice" | "getPrice")
canonicalization_version: CanonicalizationVersion
request_hash: RequestHash
account: {
account_id: IdentityReference
security_version: IdentityVersion
[k: string]: unknown
}
session: {
session_id: IdentityReference
credential_version: IdentityVersion
[k: string]: unknown
}
organization: {
organization_id: IdentityReference
version: IdentityVersion
[k: string]: unknown
}
membership: {
membership_id: IdentityReference
version: IdentityVersion
[k: string]: unknown
}
device: {
device_id: IdentityReference
version: IdentityVersion
[k: string]: unknown
}
approval: {
approval_id: IdentityReference
version: IdentityVersion
[k: string]: unknown
}
permission: Permission
scope: {
kind: "organization"
organization_id: IdentityReference
[k: string]: unknown
}
valid_for_ms: number
step_up_valid_for_ms: number
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
export interface AuthorizationRequest {
delegated_token: string
operation_id: ("listCatalogUnits" | "listCatalogTaxClassifications" | "listCatalogCategories" | "createCatalogCategory" | "getCatalogCategory" | "updateCatalogCategory" | "moveCatalogCategory" | "inactivateCatalogCategory" | "listCatalogProducts" | "createCatalogProduct" | "getCatalogProduct" | "updateCatalogProduct" | "transitionCatalogProduct" | "listCatalogProductPresentations" | "createCatalogPresentation" | "getCatalogPresentation" | "updateCatalogPresentation" | "transitionCatalogPresentation" | "addCatalogPresentationBarcode" | "retireCatalogPresentationBarcode" | "getDefaultPriceList" | "getPresentationCurrentPrice" | "listPresentationPrices" | "createPresentationPrice" | "getPrice")
canonicalization_version: CanonicalizationVersion
request_hash: RequestHash
}
export interface DelegationResponse {
access_token: string
token_type: "Bearer"
expires_in: number
[k: string]: unknown
}
export interface DelegationRequest {
operation_id: ("listCatalogUnits" | "listCatalogTaxClassifications" | "listCatalogCategories" | "createCatalogCategory" | "getCatalogCategory" | "updateCatalogCategory" | "moveCatalogCategory" | "inactivateCatalogCategory" | "listCatalogProducts" | "createCatalogProduct" | "getCatalogProduct" | "updateCatalogProduct" | "transitionCatalogProduct" | "listCatalogProductPresentations" | "createCatalogPresentation" | "getCatalogPresentation" | "updateCatalogPresentation" | "transitionCatalogPresentation" | "addCatalogPresentationBarcode" | "retireCatalogPresentationBarcode" | "getDefaultPriceList" | "getPresentationCurrentPrice" | "listPresentationPrices" | "createPresentationPrice" | "getPrice")
canonicalization_version: CanonicalizationVersion
request_hash: RequestHash
}
