import { useEffect, useState } from 'react';
import { useApp } from '../context.jsx';
import { TITLES } from './ui.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Products from '../pages/Products.jsx';
import Orders from '../pages/Orders.jsx';
import Customers from '../pages/Customers.jsx';
import Payments from '../pages/Payments.jsx';
import Marketing from '../pages/Marketing.jsx';
import Assistant from '../pages/Assistant.jsx';
import Analytics from '../pages/Analytics.jsx';
import Settings from '../pages/Settings.jsx';

const PAGES = { dashboard: Dashboard, products: Products, orders: Orders, customers: Customers, payments: Payments, marketing: Marketing, assistant: Assistant, analytics: Analytics, settings: Settings };
const NAV = [
  ['dashboard', '🏠'], ['products', '📦'], ['orders', '🧾'], ['customers', '👥'], ['payments', '💳'],
  ['sep', 'AI Tools'], ['marketing', '✨'], ['assistant', '🤖'],
  ['sep', 'Insights'], ['analytics', '📊'], ['settings', '⚙️'],
];

export default function Shell({ path }) {
  const { user, logout, toggleTheme } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const Page = PAGES[path];

  return (
    <div className="shell">
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <a className="brand" href="#/dashboard"><span className="brand-logo">B</span> Bizora AI</a>
        <nav className="nav">
          {NAV.map(([id, ico], i) => (id === 'sep'
            ? <div className="sep" key={'s' + i}>{ico}</div>
            : <a key={id} href={'#/' + id} className={path === id ? 'active' : ''}><span className="ico">{ico}</span>{TITLES[id]}</a>))}
        </nav>
        <div className="sidebar-foot">
          <div>{user.business_name}</div>
          <span className="plan-chip">{user.plan} plan</span>
          <div style={{ marginTop: 10 }}><a href="#/" onClick={(e) => { e.preventDefault(); logout(); }} style={{ color: 'inherit' }}>Log out →</a></div>
        </div>
      </aside>
      <div className={'backdrop-nav' + (open ? ' open' : '')} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setOpen((o) => !o)}>☰</button>
          <h1>{TITLES[path]}</h1>
          <button className="icon-btn" title="Switch theme" onClick={toggleTheme}>🌓</button>
          <a className="user-chip" href="#/settings">
            <span className="avatar">{(user.name.trim()[0] || 'B').toUpperCase()}</span>
            <span className="who"><b>{user.name}</b><span className="muted small">{user.business_name}</span></span>
          </a>
        </header>
        <main className="view" key={path}><Page /></main>
      </div>
    </div>
  );
}
