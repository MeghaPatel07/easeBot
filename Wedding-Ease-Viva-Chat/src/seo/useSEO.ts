import { useEffect } from 'react';

export type StructuredData = Record<string, unknown>;

export type SEOProps = {
  title?: string;
  titleTemplate?: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: string;
  locale?: string;
  robots?: string;
  keywords?: string[];
  structuredData?: StructuredData[];
  twitterHandle?: string;
  siteName?: string;
  author?: string;
};

const SEO_MARK = 'data-seo-managed';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(SEO_MARK, '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute(SEO_MARK, '1');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  return el;
}

function clearManagedStructuredData() {
  document.head
    .querySelectorAll(`script[type="application/ld+json"][${SEO_MARK}="1"]`)
    .forEach(el => el.remove());
}

function injectStructuredData(blocks: StructuredData[]) {
  blocks.forEach(block => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(SEO_MARK, '1');
    script.text = JSON.stringify(block);
    document.head.appendChild(script);
  });
}

export function applySEO(props: SEOProps) {
  if (typeof document === 'undefined') return;

  const {
    title,
    titleTemplate,
    description,
    canonical,
    image,
    type = 'website',
    locale = 'en_US',
    robots = 'index, follow',
    keywords,
    structuredData,
    twitterHandle,
    siteName,
    author,
  } = props;

  if (title) {
    const resolvedTitle = titleTemplate
      ? titleTemplate.replace('%s', title)
      : title;
    document.title = resolvedTitle;
    upsertMeta('property', 'og:title', resolvedTitle);
    upsertMeta('name', 'twitter:title', resolvedTitle);
  }

  if (description) {
    upsertMeta('name', 'description', description);
    upsertMeta('property', 'og:description', description);
    upsertMeta('name', 'twitter:description', description);
  }

  if (canonical) {
    upsertLink('canonical', canonical);
    upsertMeta('property', 'og:url', canonical);
  }

  if (image) {
    upsertMeta('property', 'og:image', image);
    upsertMeta('name', 'twitter:image', image);
  }

  upsertMeta('property', 'og:type', type);
  upsertMeta('property', 'og:locale', locale);
  if (siteName) upsertMeta('property', 'og:site_name', siteName);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  if (twitterHandle) upsertMeta('name', 'twitter:site', twitterHandle);
  upsertMeta('name', 'robots', robots);
  if (keywords?.length) upsertMeta('name', 'keywords', keywords.join(', '));
  if (author) upsertMeta('name', 'author', author);

  clearManagedStructuredData();
  if (structuredData?.length) injectStructuredData(structuredData);
}

export function useSEO(props: SEOProps) {
  useEffect(() => {
    applySEO(props);
    return () => {
      clearManagedStructuredData();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.title,
    props.description,
    props.canonical,
    props.image,
    props.type,
    props.robots,
    JSON.stringify(props.structuredData ?? []),
    JSON.stringify(props.keywords ?? []),
  ]);
}
