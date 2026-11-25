// Generated from commands/notifications.send-email-verification.v1.schema.json at 7533def9d85ea26ca032c83b704901e0b2b4325b.


export type NotificationsSendEmailVerificationV1 = (CommandEnvelopeV1 & {
command_type?: "notifications.send-email-verification.v1"
schema_version?: 1
producer?: "identity-tenancy"
target?: "notifications"
organization_id?: (null | string)
payload?: {
notification_intent_id: string
verification_request_id: string
account_id: string
delivery_material_id: string
locale: "es-AR"
template_key: "identity_email_verification_v1"
category: "security"
expires_at: string
deduplication_key: string
}
[k: string]: unknown
})

export interface CommandEnvelopeV1 {
command_id: string
command_type: string
schema_version: number
requested_at: string
producer: string
target: string
correlation_id: string
payload: {
[k: string]: unknown
}
causation_id?: (string | null)
organization_id?: (string | null)
}
