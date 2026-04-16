import type { SEOProps } from './useSEO';

export const SITE = {
  name: 'TheWeddingBot',
  serviceName: 'TheWeddingBot',
  url: 'https://theweddingbot.ai',
  defaultTitle: 'TheWeddingBot · Your AI Wedding Planner & Concierge',
  titleTemplate: '%s · TheWeddingBot',
  defaultDescription:
    'TheWeddingBot is the AI wedding concierge that plans, styles, and budgets your big day in 10+ languages. Chat for checklists, cultural guidance, vendor ideas, and 24/7 support.',
  defaultImage: 'https://theweddingbot.ai/og/theweddingbot-cover.png',
  twitterHandle: '@theweddingbot',
  locale: 'en_US',
  keywords: [
    'AI wedding planner',
    'wedding planning app',
    'wedding chatbot',
    'wedding checklist',
    'wedding budget tracker',
    'Indian wedding planner',
    'multilingual wedding assistant',
    'wedding concierge',
    'TheWeddingBot',
  ],
} as const;

type RouteRule = {
  pattern: RegExp;
  seo: Omit<SEOProps, 'canonical'> & { canonicalPath?: string };
};

export const routeSEO: RouteRule[] = [
  {
    pattern: /^\/$/,
    seo: {
      title: SITE.defaultTitle,
      description: SITE.defaultDescription,
      canonicalPath: '/',
      type: 'website',
      keywords: SITE.keywords.slice(),
      robots: 'index, follow, max-image-preview:large, max-snippet:-1',
    },
  },
  {
    pattern: /^\/chat\/[^/]+$/,
    seo: {
      title: 'Wedding Chat',
      description:
        'Chat with TheWeddingBot, your AI wedding concierge, for personalized planning, styling, and cultural guidance.',
      robots: 'noindex, nofollow',
    },
  },
  {
    pattern: /^\/share\/[^/]+$/,
    seo: {
      title: 'Shared Wedding Chat',
      description:
        'A wedding planning conversation shared from TheWeddingBot.',
      type: 'article',
      robots: 'noindex, nofollow',
    },
  },
  {
    pattern: /^\/shared\/note\/[^/]+$/,
    seo: {
      title: 'Shared Wedding Note',
      description: 'A wedding note shared from TheWeddingBot.',
      type: 'article',
      robots: 'noindex, nofollow',
    },
  },
  {
    pattern: /^\/terms\/?$/,
    seo: {
      title: 'Terms of Service',
      description:
        'The Terms of Service that govern your use of TheWeddingBot, the AI wedding planning assistant.',
      canonicalPath: '/terms',
      type: 'website',
      robots: 'index, follow',
    },
  },
  {
    pattern: /^\/privacy\/?$/,
    seo: {
      title: 'Privacy Policy',
      description:
        'How TheWeddingBot collects, uses, and protects your personal information when you use the service.',
      canonicalPath: '/privacy',
      type: 'website',
      robots: 'index, follow',
    },
  },
  {
    // Private, user-scoped routes: /:userId/(gallery|planner|...)
    pattern:
      /^\/[^/]+\/(gallery|planner(?:\/[^/]+)?|liked|reminders|budget|shopping|saved-items|timeline|progress|notifications|collaborate|notes(?:\/[^/]+)?)\/?$/,
    seo: {
      title: 'Your Wedding Workspace',
      description: 'Your private TheWeddingBot workspace.',
      robots: 'noindex, nofollow',
    },
  },
];

export function resolveRouteSEO(pathname: string): SEOProps {
  const match = routeSEO.find(r => r.pattern.test(pathname));
  const base: SEOProps = {
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    canonical: `${SITE.url}${pathname}`,
    image: SITE.defaultImage,
    type: 'website',
    locale: SITE.locale,
    robots: 'index, follow',
    twitterHandle: SITE.twitterHandle,
    siteName: SITE.name,
  };
  if (!match) return base;
  const { canonicalPath, ...rest } = match.seo;
  return {
    ...base,
    ...rest,
    canonical: `${SITE.url}${canonicalPath ?? pathname}`,
  };
}
