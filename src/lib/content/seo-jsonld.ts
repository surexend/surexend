import type { SeoPage } from './types'
import { seoUrl } from './types'

const ORG = {
  '@type': 'Organization',
  name: 'SureXend',
  url: 'https://surexend.com',
  logo: 'https://surexend.com/logo-mark-gold.png',
  description:
    "Africa's stablecoin spending platform — send money, convert USDC to local currency, pay bills and withdraw to banks across the continent.",
  email: 'support@surexend.com',
  sameAs: [
    'https://x.com/surexend',
    'https://www.linkedin.com/company/surexend',
    'https://www.facebook.com/surexend',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'support@surexend.com',
    availableLanguage: ['English'],
  },
}

function appSchema() {
  return {
    '@type': 'SoftwareApplication',
    name: 'SureXend',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Android, iOS, Web',
    url: 'https://surexend.com',
    description:
      'Send money, convert USDC to local currency, pay bills and withdraw to banks across Africa.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '1200',
    },
    featureList: [
      'USDC wallet',
      'Live currency conversion',
      'Airtime & bill payments',
      'Bank & mobile-money withdrawal',
      'Biometric & 2FA security',
    ],
  }
}

function breadcrumbSchema(page: SeoPage) {
  const crumbs = [
    { name: 'SureXend', item: 'https://surexend.com' },
    page.kind === 'blog'
      ? { name: 'Blog', item: 'https://surexend.com/blog' }
      : { name: 'Features', item: 'https://surexend.com' },
    { name: page.h1, item: seoUrl(page.path) },
  ]
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }
}

function serviceSchema(page: SeoPage) {
  return {
    '@type': 'Service',
    serviceType: 'Stablecoin payments',
    name: page.h1,
    description: page.metaDescription,
    provider: { '@id': 'https://surexend.com#organization' },
    areaServed: {
      '@type': 'GeoCircle',
      address: { '@type': 'PostalAddress', addressCountry: ['NG', 'KE', 'GH', 'ZA'] },
    },
    url: seoUrl(page.path),
  }
}

function articleSchema(page: SeoPage) {
  return {
    '@type': 'Article',
    headline: page.h1,
    description: page.metaDescription,
    url: seoUrl(page.path),
    image: 'https://surexend.com/opengraph-image',
    datePublished: page.datePublished,
    dateModified: page.dateModified,
    author: { '@type': 'Organization', name: page.author || 'SureXend Editorial', url: 'https://surexend.com' },
    publisher: { '@id': 'https://surexend.com#organization' },
    mainEntityOfPage: seoUrl(page.path),
  }
}

function faqSchema(page: SeoPage) {
  return {
    '@type': 'FAQPage',
    mainEntity: page.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

export function buildSchemas(page: SeoPage): object[] {
  const schemas: object[] = [
    { '@context': 'https://schema.org', '@graph': [ORG, appSchema()] },
    breadcrumbSchema(page),
  ]
  if (page.kind === 'blog') schemas.push(articleSchema(page))
  else schemas.push(serviceSchema(page))
  if (page.faq.length) schemas.push(faqSchema(page))
  return schemas
}