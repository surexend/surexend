import type { MetadataRoute } from 'next'
import { allPages } from '@/lib/content'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  const home: MetadataRoute.Sitemap = [
    {
      url: 'https://surexend.com',
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://surexend.com/blog',
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ]

  const pages: MetadataRoute.Sitemap = allPages.map((p) => ({
    url: `https://surexend.com${p.path}`,
    lastModified: p.dateModified ? new Date(p.dateModified) : lastModified,
    changeFrequency: p.kind === 'blog' ? 'monthly' : 'weekly',
    priority: p.priority,
  }))

  return [...home, ...pages]
}

export const dynamic = 'force-static'