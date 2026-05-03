import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    qualities: [25, 50, 75, 100],
  },
  // Libera HMR/dev resources a partir de subdomínios de lvh.me (multi-tenant em dev)
  allowedDevOrigins: ['*.lvh.me', 'lvh.me'],
  // Evita warning quando existem múltiplos lockfiles na máquina
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/login',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
