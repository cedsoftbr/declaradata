import type { Metadata } from 'next'
import { NcmCatalogClient } from '@/features/ncm-catalog/components/ncm-catalog-client'

export const metadata: Metadata = { title: 'NCM' }

export default function NcmCatalogPage() {
  return <NcmCatalogClient />
}
