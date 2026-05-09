import type { Metadata } from 'next'
import { PersonsClient } from './person-client'

export const metadata: Metadata = { title: 'Pessoas' }

export default function PersonsPage() {
  return <PersonsClient />
}
