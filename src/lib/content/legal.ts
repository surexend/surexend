// Legal & compliance documents. Rendered by components/legal/LegalArticle.tsx
// from static routes (/privacy, /terms, /cookies, /aml, /ndpr). Public pages —
// linked from the landing footer, registration consent, and the in-app profile.

export interface LegalSection {
  h2: string
  paras: string[]
  list?: string[]
}

export interface LegalDoc {
  slug: string
  path: string
  title: string
  metaDescription: string
  h1: string
  updated: string
  intro: string
  sections: LegalSection[]
}

export const CONTACT_EMAIL = 'support@surexend.com'

export const legalDocs: Record<string, LegalDoc> = {
  privacy: {
    slug: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy | SureXend',
    metaDescription:
      'How SureXend collects, uses and protects your personal data — KYC information, transaction records and device data — under Nigeria’s NDPA 2023 and best fintech practice.',
    h1: 'Privacy Policy',
    updated: 'August 25, 2026',
    intro:
      'This policy explains what personal data SureXend collects when you use our wallet and payment services, why we collect it, how we protect it, and the rights you have over it.',
    sections: [
      {
        h2: 'Who we are',
        paras: [
          'SureXend ("we", "us") operates the surexend.com website and the SureXend wallet application — a stablecoin spending platform for sending, converting and spending USDC, paying bills and withdrawing to banks and mobile money across Africa.',
          `For any privacy question or request, contact us at ${CONTACT_EMAIL}.`,
        ],
      },
      {
        h2: 'The data we collect',
        paras: ['We collect only what we need to provide the service and to meet legal obligations:'],
        list: [
          'Identity & KYC data — name, date of birth, address, government ID images and selfie, as required by "know your customer" rules.',
          'Contact data — email address and phone number.',
          'Transaction data — deposits, conversions, transfers, bill payments and withdrawals, including on-chain references.',
          'Financial data — bank account or mobile-money details you add for withdrawals.',
          'Device & security data — IP address, device model, app version, and security events such as login attempts.',
          'Support data — messages you send to our support channels.',
        ],
      },
      {
        h2: 'Why we use it (legal bases)',
        paras: ['We process your data on the following bases:'],
        list: [
          'To perform our contract with you — operating your wallet, executing transactions, providing support.',
          'To meet legal obligations — KYC/AML checks, record-keeping, and reports required by regulators.',
          'For our legitimate interests — preventing fraud and abuse, securing the platform, improving the service.',
          'With your consent — optional notifications and marketing, which you can withdraw at any time.',
        ],
      },
      {
        h2: 'Blockchain transactions are public',
        paras: [
          'Deposits and transfers of USDC happen on public blockchains. Wallet addresses, amounts and timestamps are permanently visible to anyone. We cannot alter or delete blockchain records — this is a feature of the technology, and it is why we avoid publishing anything that links your identity to your addresses.',
        ],
      },
      {
        h2: 'Who we share data with',
        paras: ['We never sell your data. We share it only with:'],
        list: [
          'Identity-verification (KYC) providers, to confirm your identity as the law requires.',
          'Payment and payout partners — banks, mobile-money operators and payment processors — to deliver your money.',
          'Infrastructure providers (cloud hosting, email delivery) under contract and confidentiality.',
          'Law enforcement or regulators, where a valid legal order requires it.',
        ],
      },
      {
        h2: 'How we protect your data',
        paras: [
          'Data is encrypted in transit (TLS) and at rest. Your transaction PIN and biometric unlock are device-side security features; we never store a plain copy of your PIN. Access to personal data inside SureXend is restricted to trained staff who need it to do their job. We run regular security reviews of both our code and our infrastructure.',
        ],
      },
      {
        h2: 'How long we keep it',
        paras: [
          'KYC and transaction records are retained for the period required by financial regulations after your account closes (typically several years). Other data — support messages, device logs — is kept only as long as useful for security and service quality, then deleted or anonymised.',
        ],
      },
      {
        h2: 'Your rights',
        paras: ['Under the Nigeria Data Protection Act 2023 (and equivalent laws where you live), you may:'],
        list: [
          'Request a copy of the personal data we hold about you.',
          'Ask us to correct inaccurate data.',
          'Ask us to delete data we no longer need or are not legally required to keep.',
          'Object to or restrict certain processing, or withdraw consent where consent is the basis.',
          'Lodge a complaint with the Nigeria Data Protection Commission (NDPC).',
        ],
      },
      {
        h2: 'Changes to this policy',
        paras: [
          'We will post any updated policy on this page with a new "last updated" date, and notify you in-app when a change is significant.',
        ],
      },
    ],
  },

  terms: {
    slug: 'terms',
    path: '/terms',
    title: 'Terms of Service | SureXend',
    metaDescription:
      'The rules for using SureXend: eligibility, your wallet, conversions, bill payments, withdrawals, fees, prohibited use and liability — in plain language.',
    h1: 'Terms of Service',
    updated: 'August 25, 2026',
    intro:
      'These terms are the agreement between you and SureXend when you create a wallet or use any of our services. Please read them — they explain what you can expect from us and what we expect from you.',
    sections: [
      {
        h2: '1. Eligibility',
        paras: [
          'You must be at least 18 years old and legally able to enter contracts. You must complete our identity verification (KYC) before you can send, convert, pay bills or withdraw. Providing false information is grounds for immediate suspension.',
        ],
      },
      {
        h2: '2. Your wallet',
        paras: [
          'Your SureXend wallet holds USDC (a USD stablecoin) and, after conversion, local-currency balances. You are responsible for keeping your PIN, biometrics and device secure. Transactions confirmed with your PIN or biometrics are authorised by you — so protect them like cash.',
          'Blockchain transfers are irreversible. Once a transfer is broadcast on-chain it cannot be reversed, and sending to a wrong address or on a wrong network may mean permanent loss. Always verify the address and network, and use a small test amount first.',
        ],
      },
      {
        h2: '3. The services',
        paras: ['SureXend provides:'],
        list: [
          'USDC deposits on supported networks.',
          'Conversion between USDC and supported local currencies at the live rate shown before you confirm.',
          'Bill payments — airtime, data, electricity, TV and other services offered in the app.',
          'Withdrawals to supported banks and mobile-money providers.',
        ],
      },
      {
        h2: '4. Fees and rates',
        paras: [
          'Every conversion shows the exact rate and any fee before you confirm — there are no hidden charges. Network fees for blockchain transfers are set by the networks, not by us. Operator prices for airtime, data and bills are set by those providers.',
        ],
      },
      {
        h2: '5. Prohibited use',
        paras: ['You may not use SureXend for:'],
        list: [
          'Fraud, theft, or unauthorised use of another person’s funds or identity.',
          'Money laundering, terrorist financing, or evading sanctions.',
          'Gambling, Ponzi or high-yield investment schemes, or other illegal trade.',
          'Any activity prohibited by the laws of Nigeria or your jurisdiction.',
        ],
      },
      {
        h2: '6. Suspension and closure',
        paras: [
          'We may pause or suspend your account if we detect fraud, sanctioned activity, a legal order, or a serious security risk. Where the law allows, we will tell you why. You may close your account at any time after settling pending transactions; required records stay archived as the law demands.',
        ],
      },
      {
        h2: '7. Risk disclosure',
        paras: [
          'Stablecoins are designed to hold their peg but are not risk-free: issuer failure, depegging or regulatory change can affect value. Balances are NOT bank deposits and are NOT covered by deposit insurance. Only hold what you can afford to lose and keep your security credentials private.',
        ],
      },
      {
        h2: '8. Liability',
        paras: [
          'We provide the service "as is" and work hard to keep it available and secure, but we cannot guarantee uninterrupted service. To the extent the law allows, our liability for any claim is limited to the value of the transaction that gave rise to it. We are not liable for losses caused by your share of security credentials, wrong addresses/networks, or events beyond our reasonable control.',
        ],
      },
      {
        h2: '9. Changes, law and contact',
        paras: [
          `We may update these terms and will announce significant changes in-app before they take effect. These terms are governed by the laws of the Federal Republic of Nigeria. Questions: ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },

  cookies: {
    slug: 'cookies',
    path: '/cookies',
    title: 'Cookie Policy | SureXend',
    metaDescription: 'What cookies and local storage SureXend uses, why, and how to control them. No third-party advertising trackers.',
    h1: 'Cookie Policy',
    updated: 'August 25, 2026',
    intro:
      'We use a small number of cookies and browser storage entries to keep you signed in and to remember your preferences. We do not run advertising trackers.',
    sections: [
      {
        h2: 'What we store and why',
        paras: ['When you use SureXend, your browser or device may store:'],
        list: [
          'Session token — keeps you signed in securely (essential; the app cannot work without it).',
          'Theme preference — remembers your appearance choice.',
          'Lite-mode preference — remembers whether you chose the low-data mode.',
          'Security flags — helps us detect suspicious logins and abuse.',
        ],
      },
      {
        h2: 'What we do NOT do',
        paras: [
          'We do not use third-party advertising or cross-site tracking cookies. We do not sell information about your browsing. Analytics, where used, are aggregate and never used to profile you for ads.',
        ],
      },
      {
        h2: 'Controlling cookies',
        paras: [
          'You can clear cookies and site data at any time in your browser settings — you will simply be signed out and preferences reset. Blocking storage entirely will prevent the app from keeping you signed in.',
          `Questions about this policy: ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },

  aml: {
    slug: 'aml',
    path: '/aml',
    title: 'AML / CFT Policy | SureXend',
    metaDescription: 'SureXend’s anti-money-laundering and counter-terrorism-financing policy: KYC, monitoring, sanctions screening and reporting.',
    h1: 'AML / CFT Policy',
    updated: 'August 25, 2026',
    intro:
      'SureXend is built for legitimate everyday money. This policy summarises how we prevent, detect and report money laundering and terrorism financing (AML/CFT).',
    sections: [
      {
        h2: 'Identity verification (KYC)',
        paras: [
          'Every customer must verify their identity before transacting: legal name, date of birth, address, a government-issued ID and a liveness selfie. Verification is performed by specialised identity providers, and documents are handled under our Privacy Policy.',
        ],
      },
      {
        h2: 'Transaction monitoring',
        paras: [
          'We monitor activity patterns — volumes, velocity, counterparties and structuring signals (many small transfers designed to dodge controls). Unusual activity is reviewed by our compliance function and may lead to requests for extra information, temporary limits, or account suspension.',
        ],
      },
      {
        h2: 'Sanctions screening',
        paras: [
          'Customers and, where applicable, counterparties are screened against international and local sanctions lists. Matches are blocked and escalated. We do not provide services to sanctioned persons or jurisdictions.',
        ],
      },
      {
        h2: 'Record keeping and reporting',
        paras: [
          'We keep KYC files and transaction records for the period required by law. Suspicious activity is reported to the Nigerian Financial Intelligence Unit (NFIU) and relevant authorities as required.',
        ],
      },
      {
        h2: 'Tipping off',
        paras: [
          'Our staff are prohibited by law and by policy from telling a customer that a report has been made about their activity. Attempts to structure transactions to avoid controls are themselves a red flag and may trigger suspension.',
          `Compliance contact: ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },

  ndpr: {
    slug: 'ndpr',
    path: '/ndpr',
    title: 'NDPA Data Protection Notice | SureXend',
    metaDescription: 'SureXend’s notice under the Nigeria Data Protection Act 2023: who we are, what we process, your rights, and how to reach our data protection contact.',
    h1: 'NDPA Data Protection Notice',
    updated: 'August 25, 2026',
    intro:
      'This notice is provided under the Nigeria Data Protection Act 2023 (NDPA). It summarises — in one page — how SureXend handles your personal data and how to exercise your rights.',
    sections: [
      {
        h2: 'Data controller',
        paras: [
          'SureXend determines why and how your personal data is processed when you use our platform.',
          `Data protection contact: ${CONTACT_EMAIL}.`,
        ],
      },
      {
        h2: 'What we process and why',
        paras: ['Categories and purposes:'],
        list: [
          'Identity & KYC data — legal obligation (identity verification) and contract (providing the wallet).',
          'Contact details — contract and service messages.',
          'Transaction & financial data — contract (executing your transactions) and legal obligation (record-keeping).',
          'Device & security data — legitimate interests (fraud prevention, platform security).',
        ],
      },
      {
        h2: 'Your rights under the NDPA',
        paras: ['You have the right to:'],
        list: [
          'Be informed and give consent where required — and to withdraw consent later.',
          'Access your personal data and know what we process.',
          'Rectify inaccurate or incomplete data.',
          'Erasure of data we no longer need or are not obliged to keep.',
          'Restrict or object to processing in certain cases.',
          'Complain to the Nigeria Data Protection Commission (NDPC).',
        ],
      },
      {
        h2: 'Retention & transfers',
        paras: [
          'We keep data only as long as needed for the purposes above or as financial regulations require, then delete or anonymise it. Where data is processed outside Nigeria, we ensure equivalent protection through contractual safeguards.',
        ],
      },
      {
        h2: 'Exercising your rights',
        paras: [
          `Email ${CONTACT_EMAIL} with your request; we will verify your identity and respond within the statutory window. Requests are free. This notice works together with our full Privacy Policy, which has the details.`,
        ],
      },
    ],
  },
}
