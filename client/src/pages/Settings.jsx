import { useEffect, useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import { BusyButton, ErrorBox } from '../components/ui.jsx';
import { BUSINESS_TYPES } from '../utils.js';
import { SampleDataButton } from './Dashboard.jsx';

const PLANS = [['free', 'Free', 'Rs. 0'], ['starter', 'Starter', 'Rs. 1,499'], ['pro', 'Pro', 'Rs. 3,499']];

function Meter({ label, used, limit }) {
  return (
    <div className="hbar">
      <div className="meta"><span>{label}</span><b>{used}{limit ? ` / ${limit}` : ' (unlimited)'}</b></div>
      <div className="track"><div className="fill" style={{ width: (limit ? Math.min(used / limit, 1) * 100 : 8) + '%' }} /></div>
    </div>
  );
}

export default function Settings() {
  const { user, usage, setUser, setUsage, refreshMe, toast, confirm, logout, toggleTheme } = useApp();
  const [f, setF] = useState({ name: user.name, business_name: user.business_name, business_type: user.business_type, phone: user.phone, city: user.city });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { refreshMe().catch(() => {}); }, [refreshMe]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.put('/me', f);
      setUser(r.user); setUsage(r.usage);
      toast('Profile saved');
    } catch (err) { setError(err.message); }
  };
  const choosePlan = async (plan) => {
    try {
      const r = await api.put('/me', { plan });
      setUser(r.user); setUsage(r.usage);
      toast('Switched to ' + plan);
    } catch (e) { toast(e.message, 'err'); }
  };
  const resetAll = async () => {
    if (!(await confirm('This permanently deletes all your products, customers, orders and payments.', 'Delete everything'))) return;
    try { await api.post('/demo/reset'); await refreshMe(); toast('All data cleared'); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-head"><div><h2>Settings</h2><p>Your profile, plan and preferences.</p></div></div>
      <div className="grid g2">
        <div className="card">
          <h3>Business profile</h3>
          <form onSubmit={save} noValidate>
            <ErrorBox>{error}</ErrorBox>
            <div className="form-grid">
              <label>Your name<input value={f.name} onChange={set('name')} /></label>
              <label>Business name<input value={f.business_name} onChange={set('business_name')} /></label>
              <label>Business type<select value={f.business_type} onChange={set('business_type')}>{BUSINESS_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label>Phone / WhatsApp<input value={f.phone} onChange={set('phone')} /></label>
              <label className="full">City<input value={f.city} onChange={set('city')} /></label>
              <label className="full">Email<input value={user.email} disabled /></label>
            </div>
            <BusyButton type="submit">Save profile</BusyButton>
          </form>
        </div>
        <div className="card">
          <h3>Plan and usage</h3>
          <p className="muted small">You are on the <b>{user.plan}</b> plan.</p>
          {usage && (
            <>
              <Meter label="Products" used={usage.used.products} limit={usage.limits.products} />
              <Meter label="Orders" used={usage.used.orders} limit={usage.limits.orders} />
              <Meter label="AI generations this month" used={usage.used.ai} limit={usage.limits.ai} />
            </>
          )}
          <div className="chips" style={{ marginTop: 10 }}>
            {PLANS.map(([id, name, price]) => <button key={id} className={'chip' + (user.plan === id ? ' on' : '')} onClick={() => choosePlan(id)}>{name} · {price}</button>)}
          </div>
          <p className="source-note">Demo build: plan switching is instant and no payment is taken.</p>
        </div>
      </div>
      <div className="grid g2 mt">
        <div className="card">
          <h3>Appearance</h3>
          <p className="muted small">Switch between light and dark mode.</p>
          <button className="btn btn-soft" onClick={toggleTheme}>🌓 Toggle theme</button>
        </div>
        <div className="card">
          <h3>Data</h3>
          <p className="muted small">Try the app with a sample bakery, or clear everything and start fresh.</p>
          <div className="row">
            <SampleDataButton onDone={refreshMe} />
            <button className="btn btn-danger" onClick={resetAll}>Delete all my data</button>
            <button className="btn btn-ghost" onClick={logout}>Log out</button>
          </div>
        </div>
      </div>
    </>
  );
}
