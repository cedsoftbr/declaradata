import type { Metadata } from 'next'
import { ProductsClient } from '@/features/products/components/products-client'

export const metadata: Metadata = { title: 'Produtos' }

export default function ProductsPage() {
  return <ProductsClient />
}
