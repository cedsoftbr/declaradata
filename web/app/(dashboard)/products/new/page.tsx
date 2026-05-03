'use client'

import { useRouter } from 'next/navigation'
import { ProductForm } from '@/features/products/components/product-form'

export default function NewProductPage() {
  const router = useRouter()

  return (
    <ProductForm
      onSuccess={() => {
        router.push('/products')
        router.refresh()
      }}
    />
  )
}
