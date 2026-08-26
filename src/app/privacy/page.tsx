import type { Metadata } from 'next'
import { legalDocs } from '@/lib/content/legal'
import LegalArticle from '@/components/legal/LegalArticle'

export const metadata: Metadata = {
  title: legalDocs.privacy.title,
  description: legalDocs.privacy.metaDescription,
  alternates: { canonical: 'https://surexend.com/privacy' },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return <LegalArticle doc={legalDocs.privacy} />
}
