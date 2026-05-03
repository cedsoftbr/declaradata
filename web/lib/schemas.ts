// Barrel re-export — centralises all feature schema types and validators.
// New code should prefer importing directly from the feature file,
// but this file keeps existing imports working.

export type { CompanyFormData } from '@/features/companies/schemas'
export { companySchema } from '@/features/companies/schemas'

export type { PersonFormData } from '@/features/persons/schemas'
export { personSchema } from '@/features/persons/schemas'
export type { ProductFormData } from '@/features/products/schemas'
export { productSchema } from '@/features/products/schemas'
export type {
  ShipmentFormData,
  ShipmentItemFormData,
} from '@/features/shipments/schemas'
export { shipmentItemSchema, shipmentSchema } from '@/features/shipments/schemas'
export type { UserFormValues } from '@/features/users/schemas'
export { userSchema } from '@/features/users/schemas'
