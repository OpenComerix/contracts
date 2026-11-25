// Generated from inventory/events/v2/inventory.reconciliation-required.v2.schema.json at 7cd2b548fb909c5eff47d0319c162c498ee68e92.


export type InventoryReconciliationRequiredV2 = (EventEnvelopeV1 & {
event_type?: "inventory.reconciliation-required.v2"
schema_version?: 1
producer?: "inventory"
payload?: ReconciliationOccurrence
aggregate_type?: "inventory_reconciliation"
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
export interface ReconciliationOccurrence {
organization_id: string
branch_id: string
warehouse_id: string
location_id: string
reconciliation_id: string
occurrence_id: string
operation_id: string
sale_id: string
position_id: string
movement_ids: string[]
difference: Difference
detected_at: string
compensation_operation_id?: string
extensions?: {

}
}
export interface Difference {
position_id: string
reconciliation_id: string
occurrence_id: string
line_ids: string[]
policy: "ALLOW_AND_ALERT"
policy_version: number
reason_code: "physical_product_present_stock_difference"
before: string
issued: string
after: string
}
