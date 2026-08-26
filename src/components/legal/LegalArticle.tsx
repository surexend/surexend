import Link from 'next/link'
import type { LegalDoc } from '@/lib/content/legal'

// Shared renderer for the static legal pages (/privacy, /terms, ...).
// Plain semantic HTML — no client JS, ideal for crawlers and screen readers.
export default function LegalArticle({ doc }: { doc: LegalDoc }) {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#000000]/95">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark-gold.png" alt="SureXend" className="w-6 h-6 object-contain" />
            <span className="font-extrabold text-white tracking-wider text-sm">SURE<span className="text-[#D4A017]">X</span>END</span>
          </Link>
          <Link href="/" className="text-xs text-[#94A3B8] hover:text-white transition-colors">Back to home</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <p className="text-[11px] text-[#64748B] font-bold uppercase tracking-wider">SureXend Legal</p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight mt-2">{doc.h1}</h1>
        <p className="text-[11px] text-[#64748B] mt-2">Last updated: {doc.updated}</p>
        <p className="mt-6 text-[15px] text-[#CBD5E1] leading-relaxed">{doc.intro}</p>

        <div className="mt-10 space-y-10">
          {doc.sections.map((s) => (
            <section key={s.h2}>
              <h2 className="text-lg font-bold text-white">{s.h2}</h2>
              {s.paras.map((p, i) => (
                <p key={i} className="mt-3 text-sm text-[#94A3B8] leading-relaxed">{p}</p>
              ))}
              {s.list && (
                <ul className="mt-3 space-y-2">
                  {s.list.map((li, i) => (
                    <li key={i} className="text-sm text-[#94A3B8] leading-relaxed flex gap-2.5">
                      <span className="text-[#D4A017] mt-0.5 flex-shrink-0">•</span>
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-14 pt-8 border-t border-white/5 flex flex-wrap gap-4 text-xs text-[#64748B]">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-white transition-colors">Cookie Policy</Link>
          <Link href="/aml" className="hover:text-white transition-colors">AML / CFT Policy</Link>
          <Link href="/ndpr" className="hover:text-white transition-colors">NDPA Notice</Link>
        </div>
      </main>
    </div>
  )
}
