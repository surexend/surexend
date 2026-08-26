import type { Metadata } from 'next'
import Link from 'next/link'
import { allPages, blogPosts, landingPages, countryPages } from '@/lib/content'
import { buildSchemas } from '@/lib/content/seo-jsonld'
import JsonLd from '@/components/seo/JsonLd'

export const metadata: Metadata = {
  title: 'Stablecoin & Crypto Guides for Africa (2026) | SureXend Blog',
  description:
    'Practical guides on selling USDC for naira, buying airtime with crypto, paying bills with stablecoin, receiving USD payments and cashing out across Africa.',
  alternates: { canonical: 'https://surexend.com/blog' },
  openGraph: {
    title: 'Stablecoin & Crypto Guides for Africa',
    description: 'Learn how to sell USDC, buy airtime with crypto, pay bills and cash out across Africa.',
    url: 'https://surexend.com/blog',
    type: 'website',
  },
}

// Newest posts first — the array is authored oldest-first.
const featured = [...blogPosts].reverse().slice(0, 6)

function Card({ path, h1, metaDescription, readingTime, tag }: { path: string; h1: string; metaDescription: string; readingTime?: string; tag: string }) {
  return (
    <Link
      href={path}
      className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-[rgba(212,160,23,0.4)] hover:bg-white/[0.04] transition-all"
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4A017]">{tag}</span>
      <h2 className="mt-2 text-base font-bold text-white leading-snug group-hover:text-[#FFD966] transition-colors">{h1}</h2>
      <p className="mt-2 text-xs text-[#94A3B8] leading-relaxed line-clamp-3">{metaDescription}</p>
      {readingTime && <p className="mt-3 text-[11px] text-[#64748B]">{readingTime}</p>}
    </Link>
  )
}

const tagFor = (kind: string) => (kind === 'blog' ? 'Guide' : kind === 'country' ? 'Country' : 'How-to')

export default async function BlogIndex({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // Sitelinks search box support: /blog?q=... filters every guide by keyword.
  const q = (await searchParams).q?.trim() || ''
  const needle = q.toLowerCase()
  const results = needle
    ? allPages.filter((p) => {
        const hay = [p.h1, p.metaDescription, ...(p.keywords || [])].join(' ').toLowerCase()
        return hay.includes(needle) || needle.split(/\s+/).every((t) => hay.includes(t))
      })
    : []

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <JsonLd schemas={buildSchemas({
        slug: 'blog', kind: 'blog', path: '/blog',
        metaTitle: 'Stablecoin & Crypto Guides for Africa', metaDescription: metadata.description || '',
        keywords: [], h1: 'Guides', intro: '', sections: [], faq: [],
        priority: 0.9,
      })} />
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#000000]/95">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-mark-gold.png" alt="SureXend" className="w-6 h-6 object-contain" />
            <span className="font-extrabold text-white tracking-wider text-sm">SURE<span className="text-[#D4A017]">X</span>END</span>
          </Link>
          <Link href="/register" className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#D4A017] to-[#B8860B] text-black font-bold text-xs hover:brightness-110 transition-all">
            Get started
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-[11px] text-[#64748B] font-bold uppercase tracking-wider">SureXend Guides</p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight mt-2">
          Make your stablecoin actually useful in Africa
        </h1>
        <p className="mt-4 text-[15px] text-[#CBD5E1] max-w-2xl leading-relaxed">
          Sell USDC for naira, buy airtime with crypto, pay bills, receive USD payments from abroad and cash out to
          your bank or mobile money — plain-English guides with real numbers.
        </p>

        {q ? (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-white mb-4">
              {results.length} result{results.length === 1 ? '' : 's'} for &ldquo;{q}&rdquo;
            </h2>
            {results.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-4">
                {results.map((p) => (
                  <Card key={p.path} path={p.path} h1={p.h1} metaDescription={p.metaDescription} readingTime={p.readingTime} tag={tagFor(p.kind)} />
                ))}
              </div>
            )}
            <p className="mt-6 text-xs text-[#64748B]">
              Nothing useful? <Link href="/blog" className="text-[#D4A017] font-bold hover:underline">Browse all guides</Link> or{' '}
              <Link href="/register" className="text-[#D4A017] font-bold hover:underline">create a free account</Link>.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-10">
              <h2 className="text-lg font-bold text-white mb-4">Latest guides</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {featured.map((p) => (
                  <Card key={p.path} path={p.path} h1={p.h1} metaDescription={p.metaDescription} readingTime={p.readingTime} tag="Guide" />
                ))}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="text-lg font-bold text-white mb-4">Popular topics</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                {landingPages.map((p) => (
                  <Card key={p.path} path={p.path} h1={p.h1} metaDescription={p.metaDescription} tag="How-to" />
                ))}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="text-lg font-bold text-white mb-4">Country guides</h2>
              <div className="grid sm:grid-cols-4 gap-3">
                {countryPages.map((p) => (
                  <Card key={p.path} path={p.path} h1={p.h1} metaDescription={p.metaDescription} tag="Country" />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}