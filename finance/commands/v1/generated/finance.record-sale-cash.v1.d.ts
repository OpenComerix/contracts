// Generated from finance/commands/v1/finance.record-sale-cash.v1.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type FinanceRecordSaleCashV1 = (CommandEnvelopeV1 & {
command_type: "finance.record-sale-cash.v1"
schema_version: 1
producer: "sales-pos"
target: "finance"
command_id: string
organization_id: string
correlation_id: string
causation_id: string
payload: RecordCash
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
export interface RecordCash {
context: Context
step_id: string
payment_id: string
amounts: CashAmounts
stock: StockEvidence
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
