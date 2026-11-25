// Generated from inventory/commands/v1/inventory.post-sale-stock.v1.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type InventoryPostSaleStockV1 = (CommandEnvelopeV1 & {
command_type?: "inventory.post-sale-stock.v1"
schema_version?: 1
producer?: "sales-pos"
payload?: PostRequest
target?: "inventory"
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
export interface PostRequest {
context: ProcessContext
origin_authorization_ref: string
lines: StockLine[]
step_id: string
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
export interface StockLine {
line_id: string
snapshot: PhysicalSnapshot
quantity: string
base_quantity: string
physical_presence_confirmed: boolean
}
