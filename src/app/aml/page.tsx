import type { Metadata } from 'next'
import { legalDocs } from '@/lib/content/legal'
import LegalArticle from '@/components/legal/LegalArticle'

export const metadata: Metadata = {
  title: legalDocs.aml.title,
  description: legalDocs.aml.metaDescription,
  alternates: { canonical: 'https://surexend.com/aml' },
  robots: { index: true, follow: true },
}

export default function AmlPage() {
  return <LegalArticle doc={legalDocs.aml} />
}
