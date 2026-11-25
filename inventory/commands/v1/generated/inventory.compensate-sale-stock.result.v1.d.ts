// Generated from inventory/commands/v1/inventory.compensate-sale-stock.result.v1.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type InventoryCompensateSaleStockResultV1 = ((({
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
}) & {
result_type?: "inventory.compensate-sale-stock.result.v1"
schema_version?: 1
producer?: "inventory"
[k: string]: unknown
} & {
payload?: CompensationSuccess
[k: string]: unknown
})) & {
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
}) & {
result_type?: "inventory.compensate-sale-stock.result.v1"
schema_version?: 1
producer?: "inventory"
[k: string]: unknown
} & {
retryable?: false
payload?: CompensationFailure
error_code?: ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid" | "inventory_operation_conflict" | "inventory_state_conflict" | "inventory_version_conflict" | "platform_payload_too_large")
[k: string]: unknown
})) & {
error_code: (string & ("inventory_insufficient_stock" | "inventory_quantity_invalid" | "inventory_catalog_reference_invalid" | "inventory_operation_conflict" | "inventory_state_conflict" | "inventory_version_conflict" | "platform_payload_too_large"))
[k: string]: unknown
}))
export type PhysicalSnapshot = {
line_id: string
product_id: string
variant_id: string
presentation_id: string
product_version: number
presentation_version: number
variant_version_source: "product_version"
product_type: ("STOCKED_GOOD" | "NON_STOCK_GOOD" | "SERVICE")
product_status: "active"
presentation_status: "active"
description: string
base_unit: UnitCode
presentation_unit: UnitCode
conversion_factor: ConversionFactor
allows_fractions: boolean
minimum_quantity: PositiveQuantity
quantity_increment: PositiveQuantity
}
export type UnitCode = ("unit" | "kg" | "g" | "l" | "ml" | "m" | "cm" | "m2")
export type ConversionFactor = string
export type PositiveQuantity = QuantityDecimal
export type QuantityDecimal = string

export interface CompensationSuccess {
context: ProcessContext
compensation_operation_id: string
original_operation_id: string
original_command_id: string
finance_result_id: string
status: ("compensated" | "closed_without_movement")
movements: Movement[]
original_movement_ids: string[]
preserved_reconciliations: string[]
recorded_at: string
extensions?: {

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
export interface Movement {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
occurred_at: string
recorded_at: string
operational_date: string
time_zone: "America/Argentina/Buenos_Aires"
time_policy_version: string
movement_id: string
movement_version: number
operation_id: string
line_id: string
position_id: string
position_version: number
snapshot: PhysicalSnapshot
quantity: string
base_quantity: string
direction: ("in" | "out")
reason_code: ("opening_stock" | "correction" | "sale" | "technical_compensation")
before: string
after: string
original_movement_id?: string
}
export interface CompensationFailure {
context: ProcessContext
compensation_operation_id: string
original_operation_id: string
original_command_id: string
finance_result_id: string
compensation_status: "rejected"
no_compensation_effect: true
recorded_at: string
}
