import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { blogPosts, getSeoPage, seoUrl, getRelated } from '@/lib/content'
import { buildSchemas } from '@/lib/content/seo-jsonld'
import JsonLd from '@/components/seo/JsonLd'
import SeoShell from '@/components/seo/SeoShell'

export const dynamicParams = false

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = getSeoPage(slug)
  if (!page || page.kind !== 'blog') return {}
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: seoUrl(page.path) },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      url: seoUrl(page.path),
      type: 'article',
      publishedTime: page.datePublished,
      modifiedTime: page.dateModified,
      siteName: 'SureXend',
    },
    twitter: { card: 'summary_large_image', title: page.metaTitle, description: page.metaDescription },
    robots: { index: true, follow: true },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getSeoPage(slug)
  if (!page || page.kind !== 'blog') notFound()
  return (
    <>
      <JsonLd schemas={buildSchemas(page)} />
      <SeoShell page={page} />
    </>
  )
}

export const dynamic = 'force-static'