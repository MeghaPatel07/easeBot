import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const BASE = 'https://theweddingbot.ai'

/**
 * Keeps <link rel="canonical"> and <meta property="og:url"> in sync with the
 * current route so every page has a matching canonical URL.
 */
export function useCanonical() {
  const { pathname } = useLocation()

  useEffect(() => {
    const url = `${BASE}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`

    const canon = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (canon) canon.href = url

    const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')
    if (ogUrl) ogUrl.setAttribute('content', url)
  }, [pathname])
}
