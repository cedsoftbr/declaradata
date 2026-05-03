import { jwtVerify } from 'jose'
import { type NextRequest, NextResponse } from 'next/server'
import { REFRESH_COOKIE } from '@/lib/auth'

const PUBLIC_PATHS = ['/auth/login', '/auth/2fa', '/auth/set-password', '/login']
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required')
}
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') ?? ''

  // 1. Skip checks for static assets and auth API internal routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`

  // 2. JWT Validation
  const token = request.cookies.get(REFRESH_COOKIE)?.value
  let isValid = false

  if (token) {
    try {
      // Valida apenas a assinatura e se não expirou.
      // Não precisamos ler o conteúdo aqui, apenas garantir que é um token real do nosso backend.
      await jwtVerify(token, SECRET)
      isValid = true
    } catch {
      isValid = false
    }
  }

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // 3. Redirect Logic
  if (!isValid && !isPublic) {
    return NextResponse.redirect(`${origin}/auth/login`)
  }

  if (!isValid && pathname.startsWith('/login')) {
    return NextResponse.redirect(`${origin}/auth/login`)
  }

  if (
    isValid &&
    (pathname.startsWith('/auth/login') ||
      pathname.startsWith('/auth/2fa') ||
      pathname.startsWith('/auth/set-password') ||
      pathname.startsWith('/login'))
  ) {
    return NextResponse.redirect(`${origin}/`)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|svg|ico)$).*)'],
}
