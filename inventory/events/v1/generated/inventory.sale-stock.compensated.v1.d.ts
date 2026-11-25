// Generated from inventory/events/v1/inventory.sale-stock.compensated.v1.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type InventorySaleStockCompensatedV1 = (EventEnvelopeV1 & {
event_type?: "inventory.sale-stock.compensated.v1"
schema_version?: 1
producer?: "inventory"
payload?: CompensationSuccess
aggregate_type?: "stock_compensation"
[k: string]: unknown
} & {
payload?: {
status?: "compensated"
movements?: unknown
[k: string]: unknown
}
[k: string]: unknown
})
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
