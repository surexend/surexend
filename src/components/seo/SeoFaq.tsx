import type { FaqItem } from '@/lib/content'

// Zero-JS FAQ accordion using native <details>/<summary>. Renders full text in
// the HTML (crawlable + AI-citable) and works without JavaScript on any device.

export default function SeoFaq({ faq, title = 'Frequently asked questions' }: { faq: FaqItem[]; title?: string }) {
  if (!faq.length) return null
  return (
    <section className="mt-12">
      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-5">{title}</h2>
      <div className="space-y-3">
        {faq.map((f, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden open:border-[rgba(212,160,23,0.35)]"
          >
            <summary className="flex items-center justify-between gap-4 cursor-pointer px-5 py-4 list-none text-white font-semibold text-sm hover:bg-white/[0.03]">
              {f.q}
              <span className="flex-shrink-0 text-[#94A3B8] transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-[#94A3B8]">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}