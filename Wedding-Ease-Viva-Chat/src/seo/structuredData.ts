import { SITE } from './seoConfig';
import type { StructuredData } from './useSEO';

export const organizationSchema = (): StructuredData => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE.name,
  alternateName: SITE.serviceName,
  url: SITE.url,
  logo: `${SITE.url}/logo.png`,
  description: SITE.defaultDescription,
  sameAs: [] as string[],
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'support@theweddingbot.ai',
    contactType: 'customer support',
    availableLanguage: [
      'English',
      'Hindi',
      'Gujarati',
      'Spanish',
      'French',
      'Arabic',
      'Portuguese',
      'German',
      'Chinese',
    ],
  },
});

export const websiteSchema = (): StructuredData => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  url: SITE.url,
  inLanguage: ['en', 'hi', 'gu', 'es', 'fr', 'ar', 'pt', 'de', 'zh'],
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE.url}/?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
});

export const softwareApplicationSchema = (): StructuredData => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE.serviceName,
  applicationCategory: 'LifestyleApplication',
  applicationSubCategory: 'Wedding Planning',
  operatingSystem: 'Web, iOS, Android',
  description: SITE.defaultDescription,
  url: SITE.url,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free tier with optional premium upgrade',
  },
  featureList: [
    'AI wedding planning chat',
    'Multilingual support (10+ languages)',
    'Voice input and text-to-speech',
    'AI-generated wedding imagery',
    'Checklists and timelines',
    'Budget tracker',
    'Partner collaboration',
    'Cultural and etiquette guidance',
  ],
});

export const faqSchema = (
  faqs: Array<{ question: string; answer: string }>
): StructuredData => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: answer,
    },
  })),
});

export const breadcrumbSchema = (
  items: Array<{ name: string; url: string }>
): StructuredData => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: item.url,
  })),
});

export const articleSchema = (a: {
  headline: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
}): StructuredData => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: a.headline,
  description: a.description,
  image: a.image ?? SITE.defaultImage,
  datePublished: a.datePublished,
  dateModified: a.dateModified ?? a.datePublished,
  author: {
    '@type': 'Organization',
    name: a.authorName ?? SITE.name,
  },
  publisher: {
    '@type': 'Organization',
    name: SITE.name,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE.url}/logo.png`,
    },
  },
  mainEntityOfPage: a.url,
});

export const landingFAQs = [
  {
    question: 'What is TheWeddingBot?',
    answer:
      'TheWeddingBot is an AI wedding concierge that helps couples plan, style, and budget their wedding through natural chat. It speaks 10+ languages, generates visual inspiration, tracks checklists and budgets, and offers cultural and etiquette guidance.',
  },
  {
    question: 'Is TheWeddingBot free to use?',
    answer:
      'Yes. TheWeddingBot offers a free tier that includes planning chat, checklists, and budget tracking. A premium plan unlocks unlimited AI image generation, advanced checklists, and priority features.',
  },
  {
    question: 'Which languages does TheWeddingBot support?',
    answer:
      'TheWeddingBot supports English, Hindi, Gujarati, Spanish, French, Arabic, Portuguese, German, and Chinese, with automatic language detection for both text and voice input.',
  },
  {
    question: 'Can TheWeddingBot help with cultural weddings like Indian or Nikah ceremonies?',
    answer:
      'Yes. TheWeddingBot is designed for culturally specific planning and includes knowledge of Hindu, Muslim, Christian, and civil wedding traditions, including regional variations across India and the diaspora.',
  },
  {
    question: 'How does TheWeddingBot handle my privacy?',
    answer:
      'TheWeddingBot does not sell your data and does not use your conversations to train foundation models. Your chat history, checklists, and budgets are stored privately in your account and can be deleted at any time.',
  },
];
