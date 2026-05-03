import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'

export const REFRESH_COOKIE = 'refresh_token'

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies()
  return store.get(REFRESH_COOKIE)?.value
}

export function setRefreshCookie(response: NextResponse, token: string) {
  response.cookies.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

export function clearRefreshCookie(response: NextResponse) {
  response.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
