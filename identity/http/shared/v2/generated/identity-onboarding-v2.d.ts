// Generated from openapi/identity-onboarding-v2.yaml at 4ec41110d2c4c68139101e0a13109f6fd1cdfcba.


export type Uuid = string
export type DeviceProofNonce = string
export type LoginResponse = ({
status: "restricted"
session_expires_at: string
next_actions: string[]
} | {
status: "mfa_pending"
challenge_id: Uuid
challenge_expires_at: string
next_actions: ["complete_mfa"]
})

export interface IdentityOnboardingV2Operations {
beginTotpEnrollment: {
method: "POST"
path: "/identity/mfa/totp-enrollments"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": SensitiveMaterialReplay
}
headers: {
"Cache-Control"?: string
"Idempotency-Replayed"?: boolean
}
}
"201": {
content: {
"application/json": TotpEnrollmentFirstResponse
}
headers: {
Location?: string
"Cache-Control"?: string
"Idempotency-Replayed"?: boolean
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: string
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": TotpEnrollmentRequest
}
}
completeSessionStepUp: {
method: "POST"
path: "/identity/step-up-confirmations"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": SessionStepUpCompleted
}
headers: {
"X-CSRF-Token": string
"Set-Cookie": string
"Cache-Control"?: "no-store"
"Idempotency-Replayed": boolean
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After": number
"Cache-Control"?: "no-store"
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
}
requestBody: {
"application/json": SessionStepUpConfirmationRequest
}
}
confirmTotpEnrollment: {
method: "POST"
path: "/identity/mfa/totp-enrollments/{enrollmentId}/confirmations"
parameters: {
path: {
enrollmentId: Uuid
}
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": (TotpConfirmationResponse | SensitiveMaterialReplay)
}
headers: {
"Cache-Control"?: string
"Idempotency-Replayed"?: boolean
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: string
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": TotpConfirmationRequest
}
}
createDeviceRegistrationChallenge: {
method: "POST"
path: "/identity/device-registration-challenges"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": DeviceChallengeResponse
}
headers: {
"Cache-Control"?: "no-store"
"Idempotency-Replayed"?: boolean
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": DeviceChallengeRequest
}
}
createInitialOrganization: {
method: "POST"
path: "/tenancy/organization-onboardings"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"201": {
content: {
"application/json": OrganizationOnboardingResponse
}
headers: {
"X-CSRF-Token": string
Location?: string
"Set-Cookie"?: string
"Cache-Control"?: "no-store"
"Idempotency-Replayed"?: boolean
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: string
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": OrganizationOnboardingRequest
}
}
createRegisteredDeviceAuthenticationChallenge: {
method: "POST"
path: "/identity/device-authentication-challenges"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": DeviceAuthenticationChallenge
}
headers: {
"Cache-Control"?: "no-store"
"Idempotency-Replayed"?: boolean
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: string
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": DeviceAuthenticationChallengeRequest
}
}
createSession: {
method: "POST"
path: "/identity/sessions"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": LoginResponse
}
headers: {
"X-CSRF-Token": string
"Set-Cookie"?: string
"Cache-Control"?: "no-store"
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: string
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": LoginRequest
}
}
createSessionStepUpChallenge: {
method: "POST"
path: "/identity/step-up-challenges"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"201": {
content: {
"application/json": SessionStepUpChallengeResponse
}
headers: {
Location?: string
"Cache-Control"?: "no-store"
"Idempotency-Replayed": boolean
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After": number
"Cache-Control"?: "no-store"
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
}
requestBody: {
"application/json": SessionStepUpChallengeRequest
}
}
getCurrentSession: {
method: "GET"
path: "/identity/session"
parameters: {

}
responses: {
"200": {
content: {
"application/json": SessionContext
}
headers: {
"X-CSRF-Token": string
"Cache-Control"?: "no-store"
}
}
"401": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: string
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
}
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
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: string
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"404": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"410": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
}
registerGlobalAccount: {
method: "POST"
path: "/identity/registrations"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": RegistrationAccepted
}
headers: {
"Cache-Control"?: string
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": RegistrationRequest
}
}
registerWebDevice: {
method: "POST"
path: "/identity/devices"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"201": {
content: {
"application/json": Device
}
headers: {
Location?: string
"Cache-Control"?: string
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"403": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": DeviceRegistrationRequest
}
}
verifyEmail: {
method: "POST"
path: "/identity/email-verifications"
parameters: {
header: {
"Idempotency-Key": string
traceparent?: string
}
}
responses: {
"200": {
content: {
"application/json": EmailVerificationResponse
}
headers: {
"Cache-Control"?: string
}
}
"400": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"409": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Cache-Control"?: "no-store"
}
}
"422": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"429": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {
"Retry-After"?: number
}
}
"500": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"503": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
"504": {
content: {
"application/problem+json": ProblemDetailsV2
}
headers: {

}
}
}
requestBody: {
"application/json": EmailVerificationRequest
}
}
}
export interface SensitiveMaterialReplay {
status: "already_issued"
}
export interface TotpEnrollmentFirstResponse {
status: "issued"
enrollment_id: Uuid
secret: string
otpauth_uri: string
expires_at: string
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
export interface TotpEnrollmentRequest {
label?: string
}
export interface SessionStepUpCompleted {
status: "step_up_completed"
reauthenticated_at: string
expires_at: string
}
export interface SessionStepUpConfirmationRequest {
challenge_id: Uuid
code: string
}
export interface TotpConfirmationResponse {
status: "issued"
mfa_status: "enrolled"
recovery_codes: string[]
}
export interface TotpConfirmationRequest {
code: string
}
export interface DeviceChallengeResponse {
challenge_id: Uuid
challenge: DeviceProofNonce
key_algorithm: "ECDSA_P256"
purpose: ("registration" | "activate_session" | "renew_session" | "bootstrap_organization" | "owner_device_approval")
expires_at: string
}
export interface DeviceChallengeRequest {
key_algorithm: "ECDSA_P256"
public_key: DevicePublicJwk
}
export interface DevicePublicJwk {
kty: "EC"
crv: "P-256"
x: string
y: string
}
export interface OrganizationOnboardingResponse {
organization: OrganizationRef
branch: {
branch_id: Uuid
name: string
version: number
}
pos: {
pos_id: Uuid
name: string
version: number
}
membership: {
membership_id: Uuid
membership_type: "INTERNAL"
role: "OWNER"
version: number
}
device_approval: {
device_id: Uuid
status: "approved"
version: number
}
version: number
}
export interface OrganizationRef {
organization_id: Uuid
name: string
version: number
}
export interface OrganizationOnboardingRequest {
organization_name: string
branch_name: string
pos_name: string
locale: "es-AR"
device_id: Uuid
device_challenge_id: Uuid
device_challenge: DeviceProofNonce
device_signature: string
expected_device_version: number
}
export interface DeviceAuthenticationChallenge {
challenge_id: Uuid
challenge: DeviceProofNonce
key_algorithm: "ECDSA_P256"
device_id: Uuid
purpose: ("activate_session" | "renew_session" | "bootstrap_organization" | "owner_device_approval")
expires_at: string
}
export interface DeviceAuthenticationChallengeRequest {
device_id: Uuid
purpose: ("activate_session" | "renew_session" | "bootstrap_organization" | "owner_device_approval")
organization_id?: (Uuid | null)
}
export interface LoginRequest {
email: string
password: string
}
export interface SessionStepUpChallengeResponse {
challenge_id: Uuid
status: "mfa_required"
expires_at: string
}
export interface SessionStepUpChallengeRequest {
password: string
}
export interface SessionContext {
account: {
account_id: Uuid
email_status: ("pending" | "verified")
}
session: {
status: ("active" | "restricted" | "mfa_pending" | "revoked" | "expired")
expires_at: string
}
mfa: {
status: ("not_enrolled" | "enrollment_pending" | "required" | "challenge_pending" | "enrolled")
}
device: {
status: ("not_registered" | "pending_approval" | "approved" | "rejected" | "revoked")
device_id?: Uuid
}
active_organization: (OrganizationRef | null)
active_membership: (MembershipRef | null)
permissions: string[]
scopes: Scope[]
next_actions: ("verify_email" | "enroll_mfa" | "complete_mfa" | "register_device" | "approve_device" | "create_organization" | "select_organization")[]
}
export interface MembershipRef {
membership_id: Uuid
organization_id: Uuid
membership_type: ("INTERNAL" | "EXTERNAL")
status: ("active" | "suspended" | "revoked")
roles: string[]
version: number
}
export interface Scope {
scope_type: ("organization" | "branch" | "location" | "pos")
scope_id: Uuid
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
export interface RegistrationAccepted {
status: "accepted"
next_actions: ("verify_email")[]
}
export interface RegistrationRequest {
email: string
password: string
first_name: string
last_name: string
birth_date: string
country: string
province: string
locality: string
postal_code: string
address: string
}
export interface Device {
device_id: Uuid
status: ("pending_approval" | "approved" | "rejected" | "revoked")
version: number
}
export interface DeviceRegistrationRequest {
challenge_id: Uuid
challenge: DeviceProofNonce
public_key: DevicePublicJwk
signature: string
device_name: string
platform: "web"
}
export interface EmailVerificationResponse {
status: ("verified" | "not_verified")
next_actions: ("verify_email" | "enroll_mfa" | "complete_mfa" | "register_device" | "approve_device" | "create_organization" | "select_organization")[]
}
export interface EmailVerificationRequest {
token: string
}
