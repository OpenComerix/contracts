// Generated from inventory/commands/v1/inventory.compensate-sale-stock.v1.consumer.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type InventoryCompensateSaleStockV1Consumer = (CommandEnvelopeV1 & {
command_type?: "inventory.compensate-sale-stock.v1"
schema_version?: 1
producer?: "sales-pos"
payload?: CompensationRequest
target?: "inventory"
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
export interface CompensationRequest {
context: ProcessContext
original_operation_id: string
original_command_id: string
compensation_operation_id: string
finance_result_id: string
reason_code: "terminal_finance_rejection_without_payment"
step_id: string
extensions?: {
source_note?: string
}
}
export interface ProcessContext {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
pos_id: string
operation_id: string
sale_id: string
process_id: string
process_version: number
}
