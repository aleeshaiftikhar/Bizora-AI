import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from './api.js';
import Modal from './components/Modal.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [booting, setBooting] = useState(!!api.token);
  const [theme, setTheme] = useState(() => localStorage.getItem('bz_theme') || 'light');
  const [toasts, setToasts] = useState([]);
  const [asking, setAsking] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('bz_theme', theme);
  }, [theme]);

  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await api.get('/me');
    setUser(me.user);
    setUsage(me.usage);
    return me;
  }, []);

  const logout = useCallback(() => {
    api.setToken('');
    setUser(null);
    setUsage(null);
    window.location.hash = '#/';
  }, []);

  const signIn = useCallback((token, u) => {
    api.setToken(token);
    setUser(u);
    api.get('/me').then((me) => { setUser(me.user); setUsage(me.usage); }).catch(() => {});
  }, []);

  // On first load, restore the session if a token is saved
  useEffect(() => {
    if (!api.token) return;
    refreshMe().catch(() => {}).finally(() => setBooting(false));
  }, [refreshMe]);

  // If the server says the token is no longer valid, go to login
  useEffect(() => {
    const h = () => { setUser(null); setUsage(null); window.location.hash = '#/login'; };
    window.addEventListener('bz-unauth', h);
    return () => window.removeEventListener('bz-unauth', h);
  }, []);

  const confirm = useCallback((message, okLabel = 'Delete') => new Promise((resolve) => setAsking({ message, okLabel, resolve })), []);
  const answer = (v) => { asking.resolve(v); setAsking(null); };

  const value = useMemo(() => ({
    user, setUser, usage, setUsage, booting, theme, refreshMe, logout, signIn, toast, confirm,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
  }), [user, usage, booting, theme, refreshMe, logout, signIn, toast, confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.type}><span>{t.type === 'ok' ? '✅' : '⚠️'}</span><span>{t.msg}</span></div>
        ))}
      </div>
      {asking && (
        <Modal title="Are you sure?" onClose={() => answer(false)}>
          <p>{asking.message}</p>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => answer(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => answer(true)}>{asking.okLabel}</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}
