export type SalesSaleCompletedV3 = (OpenComerixDomainEventEnvelopeV1 & {
event_id?: string
organization_id?: string
branch_id: string
pos_id: string
causation_id: string
event_type?: "sales.sale.completed.v3"
schema_version?: 1
producer?: "sales-pos"
aggregate_type?: "sale"
aggregate_version?: 1
payload?: Sale
[k: string]: unknown
})
export type Sale = {
sale_id: string
organization_id: string
operation_id: string
process_id: string
sale_version: 1
commercial_number: CommercialNumber
commercial_status: "completed"
context: Context
occurred_at: string
received_at: string
accepted_at: string
captured_at: string
completed_at: string
operating_date: OperatingDate
capture_id: string
currency: "ARS"
tax_included: true
calculation_policy_version: "sales-f1-ars-1"
/**
 * @minItems 1
 * @maxItems 100
 */
lines: [Line, ...(Line)[]]
totals: {
gross: string
discount: "0.00"
charges: "0.00"
commercial_total: string
}
fiscal_context: (FiscalPending | FiscalResolved)
stock: StockEffect
payment: PaymentEffect
provenance: {
catalog: "catalog-pricing.captureSaleCatalog.v1"
context: "backend_validated"
calculation: "sales-pos"
snapshot: "immutable_at_acceptance"
}
}
export type CommercialSnapshot = {
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
base_unit: ("unit" | "kg" | "g" | "l" | "ml" | "m" | "cm" | "m2")
presentation_unit: ("unit" | "kg" | "g" | "l" | "ml" | "m" | "cm" | "m2")
conversion_factor: string
allows_fractions: boolean
minimum_quantity: string
quantity_increment: string
sku: string
barcode: (string | null)
price_id: string
price_list_id: string
price_version: number
price_list_version: number
/**
 * Precio ARS positivo, hasta 12 dígitos enteros y dos decimales; sin redondeo.
 */
unit_price: string
currency: "ARS"
tax_included: true
price_valid_from: string
price_valid_to: (string | null)
classification: Classification
}

export interface OpenComerixDomainEventEnvelopeV1 {
event_id: string
event_type: string
schema_version: number
occurred_at: string
producer: string
organization_id: string
branch_id?: (string | null)
pos_id?: (string | null)
aggregate_type: string
aggregate_id: string
aggregate_version: number
correlation_id: string
causation_id?: (string | null)
payload: {
[k: string]: unknown
}
}
export interface CommercialNumber {
series: string
number: string
numbering_policy_version: string
series_id: string
owning_domain: "sales-pos"
document_type: "retail_sale"
display_number: string
format_version: string
}
export interface Context {
organization_id: string
branch_id: string
pos_id: string
warehouse_id: string
location_id: string
cash_register_id: string
cash_shift_id: string
}
export interface OperatingDate {
business_date: string
time_zone: string
date_policy_version: string
}
export interface Line {
line_id: string
catalog: CommercialSnapshot
quantity: string
base_quantity: string
physical_presence_confirmed: boolean
gross_amount: string
discount_amount: "0.00"
charge_amount: "0.00"
commercial_total: string
}
export interface Classification {
code: string
version: number
country_code: "AR"
name: string
selectable: boolean
/**
 * @minItems 1
 * @maxItems 16
 */
components: [ClassificationComponent]|[ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]|[ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent, ClassificationComponent]
}
export interface ClassificationComponent {
tax_code: string
jurisdiction_code: string
treatment: ("taxable" | "exempt" | "not_taxable")
rule_ref: ClassificationRule
}
export interface ClassificationRule {
code: string
version: number
}
export interface FiscalPending {
context_status: "pending_profile"
tax_snapshot_schema_version: 1
reason: "profile_unavailable"
fiscal_status: "pending"
}
export interface FiscalResolved {
context_status: "resolved"
tax_snapshot_schema_version: 1
fiscal_status: "pending"
issuer: TaxIdentity
recipient: ({
kind: "identified"
identity: TaxIdentity1
} | {
kind: "anonymous"
reason_code: "identification_not_required"
rule: Rule
})
profile: {
profile_id: string
version: string
valid_from: string
valid_to: (string | null)
captured_at: string
}
requested_fiscal_date: string
operation_purpose: "retail_sale"
requested_document_profile: string
/**
 * @minItems 1
 * @maxItems 16
 */
jurisdictions: [Jurisdiction]|[Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]|[Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction, Jurisdiction]
/**
 * @minItems 1
 * @maxItems 64
 */
rules: [Rule1, ...(Rule1)[]]
/**
 * @minItems 1
 * @maxItems 100
 */
lines: [TaxLine, ...(TaxLine)[]]
/**
 * @minItems 1
 * @maxItems 1600
 */
groups: [TaxGroup, ...(TaxGroup)[]]
totals: {
taxable_net: string
vat: string
not_taxable: string
exempt: string
other_taxes: string
total: string
}
exchange: {
currency: "ARS"
base_currency: "ARS"
rate: "1"
source: "same_currency"
captured_at: string
}
/**
 * @minItems 1
 * @maxItems 64
 */
decisions: [{
code: string
rule: Rule4
}, ...({
code: string
rule: Rule4
})[]]
}
export interface TaxIdentity {
source: ("identity-tenancy" | "business-partners" | "tax-compliance")
source_version: string
identification_type: string
identification_number: string
legal_name: string
tax_condition: string
address: {
country: "AR"
province_code: string
locality: string
postal_code: string
street: string
}
}
export interface TaxIdentity1 {
source: ("identity-tenancy" | "business-partners" | "tax-compliance")
source_version: string
identification_type: string
identification_number: string
legal_name: string
tax_condition: string
address: {
country: "AR"
province_code: string
locality: string
postal_code: string
street: string
}
}
export interface Rule {
code: string
version: string
}
export interface Jurisdiction {
country: "AR"
level: ("national" | "provincial" | "municipal")
code: string
}
export interface Rule1 {
code: string
version: string
}
export interface TaxLine {
line_id: string
/**
 * @minItems 1
 * @maxItems 16
 */
components: [TaxComponent]|[TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]|[TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent, TaxComponent]
}
export interface TaxComponent {
component_id: string
jurisdiction: Jurisdiction1
tax_code: string
treatment: ("taxable" | "exempt" | "not_taxable")
concept_code: string
category: ("vat" | "other")
base: string
rate: string
amount: string
included: boolean
rule: Rule2
reason: (string | null)
theoretical_amount: string
allocated_residue: string
allocated_base: string
base_residue: string
}
export interface Jurisdiction1 {
country: "AR"
level: ("national" | "provincial" | "municipal")
code: string
}
export interface Rule2 {
code: string
version: string
}
export interface TaxGroup {
group_id: string
jurisdiction: Jurisdiction2
tax_code: string
treatment: ("taxable" | "exempt" | "not_taxable")
concept_code: string
category: ("vat" | "other")
rate: string
base: string
amount: string
rule: Rule3
/**
 * @minItems 1
 * @maxItems 100
 */
line_ids: [string, ...(string)[]]
allocated_base: string
base_residue: string
}
export interface Jurisdiction2 {
country: "AR"
level: ("national" | "provincial" | "municipal")
code: string
}
export interface Rule3 {
code: string
version: string
}
export interface Rule4 {
code: string
version: string
}
export interface StockEffect {
status: ("posted" | "not_required")
command_id: string
result_id: string
recorded_at: string
/**
 * @minItems 0
 * @maxItems 100
 */
movements: {
movement_id: string
movement_version: number
/**
 * @minItems 1
 * @maxItems 100
 */
line_ids: [string, ...(string)[]]
}[]
reconciliation_required: boolean
/**
 * @minItems 0
 * @maxItems 100
 */
reconciliations: {
reconciliation_id: string
occurrence_id: string
code: "inventory_stock_difference_recorded"
severity: "action_required"
}[]
}
export interface PaymentEffect {
status: "paid"
command_id: string
result_id: string
payment_id: string
movement_id: string
payment_version: 1
shift_version: number
recorded_at: string
method: "cash"
currency: "ARS"
applied: string
received: string
change: string
}
