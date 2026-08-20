import type { Block } from '@/lib/content'

// Renders structured content blocks as clean semantic HTML. Pure server render
// so every heading, list and table is fully crawlable and AI-extractable.

export default function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2':
            return (
              <h2 key={i} className="text-xl sm:text-2xl font-bold text-white mt-10 mb-3 tracking-tight">
                {b.text}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={i} className="text-lg font-bold text-white mt-8 mb-2">
                {b.text}
              </h3>
            )
          case 'p':
            return (
              <p key={i} className="text-[15px] leading-relaxed text-[#CBD5E1] mb-4">
                {b.text}
              </p>
            )
          case 'list':
            return (
              <ul key={i} className="space-y-2.5 my-5">
                {b.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#CBD5E1]">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#D4A017] flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )
          case 'table':
            return (
              <div key={i} className="my-6 overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.04]">
                      {b.head.map((h, j) => (
                        <th key={j} className="px-4 py-3 text-left font-bold text-white text-[13px] whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="border-t border-white/5">
                        {row.map((cell, k) => (
                          <td
                            key={k}
                            className={`px-4 py-3 text-[#CBD5E1] text-[13px] ${k === 0 ? 'font-semibold text-white' : ''}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'callout':
            return (
              <aside
                key={i}
                className="my-6 rounded-2xl border border-[rgba(212,160,23,0.35)] bg-[rgba(212,160,23,0.08)] p-5"
              >
                {b.title && <p className="font-bold text-[#FFD966] mb-1.5 text-sm">{b.title}</p>}
                <p className="text-sm leading-relaxed text-[#E2E8F0]">{b.text}</p>
              </aside>
            )
          default:
            return null
        }
      })}
    </>
  )
}