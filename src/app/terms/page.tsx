import type { Metadata } from 'next'
import { legalDocs } from '@/lib/content/legal'
import LegalArticle from '@/components/legal/LegalArticle'

export const metadata: Metadata = {
  title: legalDocs.terms.title,
  description: legalDocs.terms.metaDescription,
  alternates: { canonical: 'https://surexend.com/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return <LegalArticle doc={legalDocs.terms} />
}
