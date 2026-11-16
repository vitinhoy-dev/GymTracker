import { useEffect, useState } from 'react'

export type Route = 'dashboard' | 'treinos' | 'alimentacao' | 'hidratacao' | 'evolucao' | 'historico' | 'config'
export const ROUTES: Route[] = ['dashboard', 'treinos', 'alimentacao', 'hidratacao', 'evolucao', 'historico', 'config']

function read(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route
  return ROUTES.includes(h) ? h : 'dashboard'
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(read())
  useEffect(() => {
    const on = () => {
      setR(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

export function go(r: Route) {
  window.location.hash = `#/${r}`
}
