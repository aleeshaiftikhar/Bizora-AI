import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

/* Tiny hash router: #/orders?new=1  ->  { path: 'orders', query: { new: '1' } }
   It reads the URL directly on every render, so it is never one step behind. */
const subscribeHash = (cb) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const getHash = () => window.location.hash;

export function useRoute() {
  const hash = useSyncExternalStore(subscribeHash, getHash);
  return useMemo(() => {
    const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?');
    return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
  }, [hash]);
}

export const navigate = (to) => { window.location.hash = '#/' + to.replace(/^\/+/, ''); };

/* Load data from the API: { data, loading, error, reload } */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const ticket = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (silent) => {
    const mine = ++ticket.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (mine === ticket.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (mine === ticket.current) setState({ data: null, loading: false, error });
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(false); }, deps);
  const reload = useCallback(() => run(true), [run]);
  return { ...state, reload };
}
