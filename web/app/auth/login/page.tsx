'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { LoginForm } from '@/components/login-form'

const LOGIN_IMAGES = ['/personal-1.png', '/personal-2.png', '/personal-3.png']
const LOGIN_IMAGE_STORAGE_KEY = 'login-image-index'

export default function LoginPage() {
  const APP_NAME = process.env.NEXT_PUBLIC_NAME ?? 'Declaradata'
  const [loginImage, setLoginImage] = useState(LOGIN_IMAGES[0])

  useEffect(() => {
    const previousIndexRaw = window.sessionStorage.getItem(LOGIN_IMAGE_STORAGE_KEY)
    const previousIndex = Number.parseInt(previousIndexRaw ?? '', 10)
    const availableIndexes = LOGIN_IMAGES.map((_, idx) => idx).filter(
      idx => idx !== previousIndex
    )

    const pool = availableIndexes.length > 0 ? availableIndexes : [0]
    const nextIndex = pool[Math.floor(Math.random() * pool.length)]
    window.sessionStorage.setItem(LOGIN_IMAGE_STORAGE_KEY, String(nextIndex))
    setLoginImage(LOGIN_IMAGES[nextIndex])
  }, [])

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold uppercase tracking-tight">
              {APP_NAME}
            </span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block overflow-hidden">
        <Image
          src={loginImage}
          alt="Declaradata"
          fill
          sizes="50vw"
          className="object-cover"
          priority
        />
      </div>
    </div>
  )
}
