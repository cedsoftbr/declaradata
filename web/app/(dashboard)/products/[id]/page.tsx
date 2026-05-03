'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import type { Product } from '@/features/products/api'
import { ProductForm } from '@/features/products/components/product-form'
import { useApi } from '@/hooks/use-api'

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { call } = useApi()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await call(`/api/products/${id}/`)
        if (res.ok) {
          const data = (await res.json()) as Product
          setProduct(data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [call, id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Produto não encontrado.
      </div>
    )
  }

  return (
    <ProductForm
      initialData={product}
      onSuccess={() => {
        router.push('/products')
        router.refresh()
      }}
    />
  )
}
