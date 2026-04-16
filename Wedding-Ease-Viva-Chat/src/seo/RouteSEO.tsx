import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { applySEO } from './useSEO';
import { resolveRouteSEO, SITE } from './seoConfig';
import {
  organizationSchema,
  websiteSchema,
  softwareApplicationSchema,
  faqSchema,
  landingFAQs,
} from './structuredData';

export default function RouteSEO() {
  const { pathname } = useLocation();
  const overrideRef = useRef(false);

  useEffect(() => {
    // Respect page-level <SEO /> overrides: if a page has mounted its own
    // <SEO> in the same tick, we skip the global default to avoid flashing.
    if (overrideRef.current) {
      overrideRef.current = false;
      return;
    }

    const base = resolveRouteSEO(pathname);
    const structuredData =
      pathname === '/'
        ? [
            organizationSchema(),
            websiteSchema(),
            softwareApplicationSchema(),
            faqSchema(landingFAQs),
          ]
        : [organizationSchema(), websiteSchema()];

    applySEO({
      ...base,
      titleTemplate: base.title === SITE.defaultTitle ? undefined : SITE.titleTemplate,
      structuredData,
    });
  }, [pathname]);

  return null;
}
