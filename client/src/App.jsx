import { useEffect } from 'react';
import { AppProvider, useApp } from './context.jsx';
import { navigate, useRoute } from './hooks.js';
import { Loader } from './components/ui.jsx';
import Shell from './components/Shell.jsx';
import Home from './pages/Home.jsx';
import Auth from './pages/Auth.jsx';

const APP_PAGES = ['dashboard', 'products', 'orders', 'customers', 'payments', 'marketing', 'assistant', 'analytics', 'settings'];
const AUTH_PAGES = ['login', 'register'];

function Router() {
  const { path } = useRoute();
  const { user, booting } = useApp();
  const known = path === '' || AUTH_PAGES.includes(path) || APP_PAGES.includes(path);

  // Decide where the visitor should be, and redirect if needed
  let redirect = null;
  if (!booting) {
    if (!known) redirect = user ? 'dashboard' : '';
    else if (!user && APP_PAGES.includes(path)) redirect = 'login';
    else if (user && AUTH_PAGES.includes(path)) redirect = 'dashboard';
  }
  useEffect(() => { if (redirect !== null) navigate(redirect); }, [redirect]);
  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  if (booting || redirect !== null) return <Loader />;
  if (path === '') return <Home />;
  if (AUTH_PAGES.includes(path)) return <Auth mode={path} />;
  return <Shell path={path} />;
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
