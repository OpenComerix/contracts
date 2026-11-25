// Generated from identity/http/private/v2/identity-internal-auth-v2.yaml at af6e8b3f5115d51f56a1ef94a36ae9f33cce3337.


export interface IdentityInternalAuthV2Operations {
getInternalIdentityJwks: {
method: "GET"
path: "/internal/identity/jwks.json"
parameters: {

}
responses: {
"200": {
content: {
"application/json": JsonWebKeySet
}
headers: {
"Cache-Control"?: string
"Content-Type"?: "application/json"
}
}
"400": {
content: {
"application/problem+json": Problem
}
headers: {

}
}
"500": {
content: {
"application/problem+json": Problem
}
headers: {

}
}
"503": {
content: {
"application/problem+json": Problem
}
headers: {

}
}
}
}
issueInternalServiceToken: {
method: "POST"
path: "/internal/identity/oauth/token"
parameters: {

}
responses: {
"200": {
content: {
"application/json": TokenResponse
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"400": {
content: {
"application/json": OAuthError
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"401": {
content: {
"application/json": OAuthError
}
headers: {
"WWW-Authenticate"?: string
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"500": {
content: {
"application/json": OAuthError
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
"503": {
content: {
"application/json": OAuthError
}
headers: {
"Cache-Control"?: "no-store"
Pragma?: "no-cache"
}
}
}
requestBody: {
"application/x-www-form-urlencoded": ClientCredentialsRequest
}
}
}
export interface JsonWebKeySet {
keys: VerificationJsonWebKey[]
}
export interface VerificationJsonWebKey {
kty: "EC"
crv: "P-256"
x: string
y: string
kid: string
use: "sig"
alg: "ES256"
key_ops: ["verify"]
}
export interface Problem {
type: string
title: string
status: (400 | 500 | 503)
instance: string
code: ("identity_invalid_request" | "platform_internal_error" | "platform_dependency_unavailable")
trace_id: string
retryable: boolean
detail?: string
}
export interface TokenResponse {
access_token: string
token_type: "Bearer"
expires_in: number
}
export interface OAuthError {
error: ("invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "server_error" | "temporarily_unavailable")
error_description?: string
}
export interface ClientCredentialsRequest {
grant_type: "client_credentials"
}
