import { useSEO, type SEOProps } from './useSEO';
import { SITE } from './seoConfig';

export function SEO(props: SEOProps) {
  useSEO({
    titleTemplate: SITE.titleTemplate,
    siteName: SITE.name,
    twitterHandle: SITE.twitterHandle,
    locale: SITE.locale,
    image: SITE.defaultImage,
    ...props,
  });
  return null;
}
