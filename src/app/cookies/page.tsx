import type { Metadata } from 'next'
import { legalDocs } from '@/lib/content/legal'
import LegalArticle from '@/components/legal/LegalArticle'

export const metadata: Metadata = {
  title: legalDocs.cookies.title,
  description: legalDocs.cookies.metaDescription,
  alternates: { canonical: 'https://surexend.com/cookies' },
  robots: { index: true, follow: true },
}

export default function CookiesPage() {
  return <LegalArticle doc={legalDocs.cookies} />
}
