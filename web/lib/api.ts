// Barrel re-export — centralises all feature API types and functions.
// New code should prefer importing directly from the feature file,
// but this file keeps existing imports working.

export type { Company, CompanyPayload } from '@/features/companies/api'
export { companiesApi } from '@/features/companies/api'
export type { City } from '@/features/locations/api'
export { locationsApi } from '@/features/locations/api'
export type {
  Person,
  PersonCertificateStatus,
  PersonPayload,
} from '@/features/persons/api'
export { personsApi } from '@/features/persons/api'
export type { Product } from '@/features/products/api'
export { productsApi } from '@/features/products/api'
export type {
  ShipmentDetail,
  ShipmentItem,
  ShipmentItemPayload,
  ShipmentListItem,
  ShipmentPayload,
  ShipmentStatus,
} from '@/features/shipments/api'
export { shipmentsApi } from '@/features/shipments/api'
export type {
  Module,
  ModulePermission,
  PermissionsMap,
  User,
} from '@/features/users/api'
export { usersApi } from '@/features/users/api'
export type { PaginatedResponse } from '@/lib/api-client'
