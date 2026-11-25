// Generated from finance/commands/v1/finance.record-sale-cash.result.v1.consumer.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type FinanceRecordSaleCashResultV1Consumer = ((({
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
result_type?: "finance.record-sale-cash.result.v1"
schema_version?: 1
producer?: "finance"
result_id?: string
command_id?: string
retryable?: false
[k: string]: unknown
} & {
payload?: Payment
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
result_type?: "finance.record-sale-cash.result.v1"
schema_version?: 1
producer?: "finance"
result_id?: string
command_id?: string
retryable?: false
[k: string]: unknown
} & {
error_code?: ("finance_cash_shift_required" | "finance_cash_shift_not_open" | "finance_version_conflict" | "finance_state_conflict" | "finance_operation_conflict" | "finance_cash_amount_invalid" | "finance_currency_unsupported" | "finance_resource_not_found")
payload?: FailedCash
[k: string]: unknown
}))) & {
error_code: (string & ("finance_cash_shift_required" | "finance_cash_shift_not_open" | "finance_version_conflict" | "finance_state_conflict" | "finance_operation_conflict" | "finance_cash_amount_invalid" | "finance_currency_unsupported" | "finance_resource_not_found"))
[k: string]: unknown
}))

export interface Payment {
context: Context
payment_id: string
movement_id: string
payment_version: 1
shift_version: number
amounts: CashAmounts
stock: StockEvidence
recorded_at: string
operating_date: OperatingDate
command_id: string
result_id: string
provenance: "finance.record-sale-cash.v1"
extensions?: {
source_note?: string
}
}
export interface Context {
organization_id: string
branch_id: string
pos_id: string
operation_id: string
process_id: string
process_version: number
sale_id: string
cash_register_id: string
cash_shift_id: string
}
export interface CashAmounts {
currency: "ARS"
method: "cash"
commercial_total: string
applied: string
received: string
change: string
}
export interface StockEvidence {
operation_id: string
result_id: string
command_id: string
status: "succeeded"
stock_status: ("posted" | "not_required")
reconciliation_required: boolean
}
export interface OperatingDate {
business_date: string
time_zone: string
date_policy_version: string
}
export interface FailedCash {
context: Context
payment_id: string
payment_absent: true
extensions?: {
source_note?: string
}
}
