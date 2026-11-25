// Generated from commands/notifications.send-email-verification.result.v1.schema.json at 7533def9d85ea26ca032c83b704901e0b2b4325b.


export type NotificationsSendEmailVerificationResultV1 = ((({
status: "succeeded"
[k: string]: unknown
} & (({
result_id: string
command_id: string
result_type: string
schema_version: number
occurred_at: string
producer: string
correlation_id: string
causation_id: string
status: ("succeeded" | "failed")
retryable: boolean
payload: {
[k: string]: unknown
}
error_code?: string
} & {
retryable?: false
[k: string]: unknown
} & {
[k: string]: unknown
}) & ({
result_type?: "notifications.send-email-verification.result.v1"
schema_version?: 1
producer?: "notifications"
payload?: {
notification_intent_id: string
delivery_id: string
delivery_status: ("scheduled" | "queued" | "sending" | "accepted_by_provider" | "delivered" | "bounced" | "complained" | "failed" | "cancelled")
provider_message_id?: string
failure_code?: string
}
[k: string]: unknown
} & {
payload?: {
delivery_status?: ("scheduled" | "queued")
[k: string]: unknown
}
[k: string]: unknown
} & {
[k: string]: unknown
}))) & {
error_code?: never
[k: string]: unknown
}) | (({
status: "failed"
[k: string]: unknown
} & (({
result_id: string
command_id: string
result_type: string
schema_version: number
occurred_at: string
producer: string
correlation_id: string
causation_id: string
status: ("succeeded" | "failed")
retryable: boolean
payload: {
[k: string]: unknown
}
error_code?: string
} & {
[k: string]: unknown
} & {
error_code: unknown
[k: string]: unknown
}) & ({
result_type?: "notifications.send-email-verification.result.v1"
schema_version?: 1
producer?: "notifications"
payload?: {
notification_intent_id: string
delivery_id: string
delivery_status: ("scheduled" | "queued" | "sending" | "accepted_by_provider" | "delivered" | "bounced" | "complained" | "failed" | "cancelled")
provider_message_id?: string
failure_code?: string
}
[k: string]: unknown
} & {
[k: string]: unknown
} & {
payload?: {
failure_code: unknown
delivery_status?: "failed"
[k: string]: unknown
}
[k: string]: unknown
}))) & {
payload: (({
[k: string]: unknown
} & {
notification_intent_id: string
delivery_id: string
delivery_status: ("scheduled" | "queued" | "sending" | "accepted_by_provider" | "delivered" | "bounced" | "complained" | "failed" | "cancelled")
provider_message_id?: string
failure_code?: string
} & {
failure_code: unknown
delivery_status?: "failed"
[k: string]: unknown
}) & {
failure_code: string
[k: string]: unknown
})
error_code: string
[k: string]: unknown
}))
