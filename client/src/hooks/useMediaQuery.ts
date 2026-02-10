import { useState, useEffect } from 'react'

/**
 * Subscribe to a CSS media query and return whether it matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** Breakpoints matching DESIGN.md Section 3.6 (Responsive Layout) */
export function useDeviceType(): 'phone' | 'tablet' | 'desktop' {
  const isDesktop = useMediaQuery('(min-width: 1200px)')
  const isTablet = useMediaQuery('(min-width: 768px)')
  if (isDesktop) return 'desktop'
  if (isTablet) return 'tablet'
  return 'phone'
}
