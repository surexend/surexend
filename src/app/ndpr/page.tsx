import type { Metadata } from 'next'
import { legalDocs } from '@/lib/content/legal'
import LegalArticle from '@/components/legal/LegalArticle'

export const metadata: Metadata = {
  title: legalDocs.ndpr.title,
  description: legalDocs.ndpr.metaDescription,
  alternates: { canonical: 'https://surexend.com/ndpr' },
  robots: { index: true, follow: true },
}

export default function NdprPage() {
  return <LegalArticle doc={legalDocs.ndpr} />
}
