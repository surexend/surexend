import type { SeoPage, SeoPageKind } from './types'
import { landingPages } from './landing'
import { countryPages } from './countries'
import { blogPosts } from './blog'

export type { SeoPage, SeoPageKind, Block, FaqItem } from './types'
export { seoUrl, readingTimeFor } from './types'

export { landingPages } from './landing'
export { countryPages } from './countries'
export { blogPosts } from './blog'

export const allPages: SeoPage[] = [...landingPages, ...countryPages, ...blogPosts]

export function getSeoPage(slug: string): SeoPage | undefined {
  return allPages.find((p) => p.slug === slug)
}

export function getSeoPageByPath(path: string): SeoPage | undefined {
  return allPages.find((p) => p.path === path)
}

export function getSeoPages(kind: SeoPageKind): SeoPage[] {
  return allPages.filter((p) => p.kind === kind)
}

export function getRelated(page: SeoPage, limit = 3): SeoPage[] {
  const related = (page.related || [])
    .map((path) => getSeoPageByPath(path))
    .filter((p): p is SeoPage => !!p && p.path !== page.path)
  if (related.length >= limit) return related.slice(0, limit)
  const rest = allPages.filter(
    (p) => p.path !== page.path && !related.some((r) => r.path === p.path)
  )
  return [...related, ...rest].slice(0, limit)
}

export const ctaByKind: Record<SeoPageKind, { label: string; href: string }> = {
  blog: { label: 'Start using SureXend', href: '/register' },
  landing: { label: 'Create free wallet', href: '/register' },
  country: { label: 'Create free wallet', href: '/register' },
}