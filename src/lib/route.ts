import { useEffect, useState } from 'react';

export interface Route { page: 'overview' | 'momentum' | 'composite' | 'indicators' | 'indicator' | 'method'; id?: string; query: URLSearchParams }

export function parse(hash: string): Route {
  const [path, q = ''] = hash.replace(/^#\/?/, '').split('?');
  const [p, id] = path.split('/');
  const query = new URLSearchParams(q);
  if (p === 'momentum' || p === 'composite' || p === 'indicators' || p === 'method') return { page: p, query };
  if (p === 'i' && id) return { page: 'indicator', id, query };
  return { page: 'overview', query };
}
export function useRoute(): Route {
  const [r, setR] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => { setR(parse(location.hash)); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}
