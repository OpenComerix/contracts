// Generated from finance/events/v2/finance.sale-payment.recorded.v2.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type FinanceSalePaymentRecordedV2 = ((EventEnvelopeV1 & {
causation_id: string
branch_id: unknown
pos_id: unknown
event_id?: string
event_type?: "finance.sale-payment.recorded.v2"
schema_version?: 1
producer?: "finance"
aggregate_type?: "sale_payment"
aggregate_version?: 1
aggregate_id?: string
payload?: Payment
[k: string]: unknown
}) & {
branch_id: (string | null)
pos_id: (string | null)
[k: string]: unknown
})

export interface EventEnvelopeV1 {
event_id: string
event_type: string
schema_version: number
occurred_at: string
producer: string
organization_id: string
aggregate_type: string
aggregate_id: string
aggregate_version: number
correlation_id: string
payload: {
[k: string]: unknown
}
branch_id?: (string | null)
pos_id?: (string | null)
causation_id?: (string | null)
}
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
