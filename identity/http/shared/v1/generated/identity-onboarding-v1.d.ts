// Generated from openapi/identity-onboarding-v1.yaml at 7533def9d85ea26ca032c83b704901e0b2b4325b.


export type Uuid = string

export interface IdentityOnboardingV1Operations {
getEmailVerificationDeliveryMaterial: {
method: "GET"
path: "/internal/identity/email-verification-delivery-material/{deliveryMaterialId}"
parameters: {
path: {
deliveryMaterialId: Uuid
}
}
responses: {
"200": {
content: {
"application/json": DeliveryMaterial
}
headers: {
"Cache-Control"?: string
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV1
}
headers: {
"Cache-Control"?: string
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV1
}
headers: {

}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV1
}
headers: {

}
}
"410": {
content: {
"application/problem+json": ProblemDetailsV1
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV1
}
headers: {
"Retry-After"?: number
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV1
}
headers: {

}
}
}
}
}
export interface DeliveryMaterial {
recipient: string
verification_url: string
expires_at: string
locale: string
template_parameters: {
display_name?: string
}
}
export interface ProblemDetailsV1 {
type: string
title: string
status: (400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 503)
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
