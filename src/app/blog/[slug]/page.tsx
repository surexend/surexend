import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { blogPosts, seoUrl, getRelated } from '@/lib/content'
import { buildSchemas } from '@/lib/content/seo-jsonld'
import JsonLd from '@/components/seo/JsonLd'
import SeoShell from '@/components/seo/SeoShell'

export const dynamicParams = false

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }))
}

// Look up ONLY in blogPosts. getSeoPage() searches landing pages first, and
// 'buy-airtime-with-crypto' exists as BOTH a landing page and a blog post —
// the landing entry used to shadow the blog post and 404 this route.
function getBlogPost(slug: string) {
  return blogPosts.find((p) => p.slug === slug)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = getBlogPost(slug)
  if (!page) return {}
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
  const page = getBlogPost(slug)
  if (!page) notFound()
  return (
    <>
      <JsonLd schemas={buildSchemas(page)} />
      <SeoShell page={page} />
    </>
  )
}

export const dynamic = 'force-static'