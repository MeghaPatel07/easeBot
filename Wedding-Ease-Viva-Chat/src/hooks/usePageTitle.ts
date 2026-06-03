import { useEffect } from 'react'

const DEFAULT_TITLE = 'TheWeddingBot'
const SUFFIX = 'TheWeddingBot'

/**
 * Sets `document.title` for the current route, restoring the previous title on
 * unmount. Used to satisfy WCAG 2.4.2 Page Titled (Level A) by giving each route
 * a unique, descriptive page title for screen readers and multi-tab workflows.
 *
 * Pass a per-route prefix (e.g. "Privacy Policy"); the hook appends
 * "· TheWeddingBot". Pass an empty string to reset to the default title.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} · ${SUFFIX}` : DEFAULT_TITLE
    return () => {
      document.title = prev
    }
  }, [title])
}
