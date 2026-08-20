// Shared content model for the SEO/GEO content engine.
// All landing pages, country pages and blog articles are data-driven so every
// route renders real semantic HTML with structured data — ideal for both
// classic search crawlers and AI search engines.

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'callout'; title?: string; text: string }

export interface FaqItem {
  q: string
  a: string
}

export type SeoPageKind = 'landing' | 'country' | 'blog'

export interface SeoPage {
  slug: string
  kind: SeoPageKind
  /** Canonical URL path, e.g. '/convert-usdc-to-naira' */
  path: string
  metaTitle: string
  metaDescription: string
  keywords: string[]
  h1: string
  /** Short direct-answer paragraph rendered right under the H1. */
  intro: string
  sections: Block[]
  faq: FaqItem[]
  ctaTitle?: string
  ctaText?: string
  /** Paths of related pages for internal linking. */
  related?: string[]
  datePublished?: string
  dateModified?: string
  author?: string
  readingTime?: string
  priority: number
}

export function seoUrl(path: string): string {
  return `https://surexend.com${path.startsWith('/') ? path : `/${path}`}`
}

export function readingTimeFor(wordCount: number): string {
  return `${Math.max(1, Math.round(wordCount / 200))} min read`
}