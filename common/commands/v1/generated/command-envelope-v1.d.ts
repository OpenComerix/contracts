// Generated from commands/command-envelope-v1.schema.json at 7533def9d85ea26ca032c83b704901e0b2b4325b.


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
