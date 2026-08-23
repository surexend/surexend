import Link from 'next/link'
import { getRelated, ctaByKind, type SeoPage } from '@/lib/content'
import Blocks from './Blocks'
import SeoFaq from './SeoFaq'

function BrandHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#000000]/95 transform-gpu">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo-mark-gold.png" alt="SureXend logo" className="w-6 h-6 object-contain" />
          <span className="font-extrabold text-white tracking-wider text-sm">
            SURE<span className="text-[#D4A017]">X</span>END
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-xs font-semibold text-[#94A3B8]">
          <Link href="/blog" className="hover:text-white transition-colors">Guides</Link>
          <Link href="/crypto-to-bank-africa" className="hover:text-white transition-colors">Africa</Link>
          <Link
            href="/register"
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#D4A017] to-[#B8860B] text-black font-bold hover:brightness-110 transition-all active:scale-95"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#000000] mt-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2">
            <p className="font-extrabold text-white tracking-wider text-sm mb-2">
              SURE<span className="text-[#D4A017]">X</span>END
            </p>
            <p className="text-xs text-[#64748B] leading-relaxed max-w-xs">
              The stablecoin spending platform for Africa. Send, convert, pay bills and cash out — from one wallet.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">Guides</p>
            <ul className="space-y-2 text-xs text-[#64748B]">
              <li><Link href="/blog/how-to-sell-usdc-for-naira" className="hover:text-white">Sell USDC for naira</Link></li>
              <li><Link href="/blog/buy-airtime-with-crypto" className="hover:text-white">Buy airtime with crypto</Link></li>
              <li><Link href="/blog/pay-bills-with-crypto" className="hover:text-white">Pay bills with crypto</Link></li>
              <li><Link href="/blog/crypto-to-bank-account-africa" className="hover:text-white">Crypto to bank</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">Popular</p>
            <ul className="space-y-2 text-xs text-[#64748B]">
              <li><Link href="/convert-usdc-to-naira" className="hover:text-white">USDC to naira</Link></li>
              <li><Link href="/buy-airtime-with-crypto" className="hover:text-white">Airtime with USDC</Link></li>
              <li><Link href="/send-money-to-nigeria" className="hover:text-white">Send money to Nigeria</Link></li>
              <li><Link href="/nigeria" className="hover:text-white">Nigeria</Link></li>
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-[#475569] mt-10 pt-6 border-t border-white/5">
          © {new Date().getFullYear()} SureXend. Stablecoin is not covered by deposit insurance — keep your keys safe.
        </p>
      </div>
    </footer>
  )
}

export default function SeoShell({ page }: { page: SeoPage }) {
  const related = getRelated(page)
  const cta = ctaByKind[page.kind]
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <BrandHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-[11px] text-[#64748B] mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-1.5">/</span>
          {page.kind === 'blog' ? (
            <>
              <Link href="/blog" className="hover:text-white">Guides</Link>
              <span className="mx-1.5">/</span>
            </>
          ) : null}
          <span className="text-[#94A3B8]">{page.h1}</span>
        </nav>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748B] mb-3">
          {page.kind === 'blog' ? (
            <>
              <span className="px-2 py-0.5 rounded-full border border-white/10 text-[#D4A017] font-bold">Guide</span>
              <span>{page.readingTime}</span>
              {page.datePublished && <span>Updated {new Date(page.datePublished).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>}
              {page.author && <span>By {page.author}</span>}
            </>
          ) : (
            <span className="px-2 py-0.5 rounded-full border border-[rgba(212,160,23,0.4)] text-[#FFD966] font-bold">
              {page.kind === 'country' ? 'Country' : 'Featured'} guide
            </span>
          )}
        </div>

        {/* H1 + direct answer */}
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">{page.h1}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-[#CBD5E1]">{page.intro}</p>

        {/* CTA */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={cta.href}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#D4A017] to-[#B8860B] text-black font-bold text-sm shadow-lg hover:brightness-110 transition-all active:scale-95"
          >
            {cta.label} →
          </Link>
          <Link
            href="/auth/login"
            className="px-6 py-3 rounded-xl border border-white/15 bg-white/[0.03] text-white font-bold text-sm hover:bg-white/[0.07] transition-all"
          >
            I already have an account
          </Link>
        </div>

        {/* Body */}
        <article className="mt-8">
          <Blocks blocks={page.sections} />
        </article>

        {/* FAQ */}
        <SeoFaq faq={page.faq} />

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="text-lg font-bold text-white mb-4">Keep reading</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {related.map((r) => (
                <Link
                  key={r.path}
                  href={r.path}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 hover:border-[rgba(212,160,23,0.4)] hover:bg-white/[0.04] transition-all"
                >
                  <p className="text-[11px] text-[#D4A017] font-bold uppercase tracking-wider mb-1.5">
                    {r.kind === 'blog' ? 'Guide' : r.kind === 'country' ? 'Country' : 'Guide'}
                  </p>
                  <p className="text-sm font-semibold text-white leading-snug">{r.h1}</p>
                  <p className="text-xs text-[#64748B] mt-2 line-clamp-2">{r.metaDescription}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Final CTA band */}
        <section className="mt-16 rounded-3xl border border-[rgba(212,160,23,0.3)] bg-gradient-to-br from-[rgba(212,160,23,0.12)] to-transparent p-8 text-center">
          <h2 className="text-2xl font-black text-white tracking-tight">{page.ctaTitle || 'Start using SureXend'}</h2>
          <p className="mt-2 text-sm text-[#94A3B8] max-w-lg mx-auto">
            {page.ctaText || 'Create a free wallet and make your USDC useful in Africa.'}
          </p>
          <Link
            href="/register"
            className="inline-block mt-6 px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#D4A017] to-[#B8860B] text-black font-bold text-sm shadow-lg hover:brightness-110 transition-all active:scale-95"
          >
            Get started free →
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  )
}