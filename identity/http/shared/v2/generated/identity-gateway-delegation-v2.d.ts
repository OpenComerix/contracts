// Generated from openapi/identity-gateway-delegation-v2.yaml at 4ec41110d2c4c68139101e0a13109f6fd1cdfcba.


export interface IdentityGatewayDelegationV2Operations {
createGatewayUserDelegation: {
method: "POST"
path: "/api/v1/internal/identity/delegations"
parameters: {
header: {
"X-OC-Client-Signal"?: string
traceparent?: string
"X-Correlation-Id"?: string
}
}
responses: {
"200": {
content: {
"application/json": DelegationResponse
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
}
}
}
export interface DelegationResponse {
access_token: string
token_type: "Bearer"
expires_in: number
}
export interface ProblemDetailsV2 {
type: string
title: string
status: (400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 503 | 504)
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
