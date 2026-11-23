import { useEffect, useRef, useState } from 'react';
import { STATUS_CLASS, money, num } from '../utils.js';

/* ---------- Small pieces ---------- */
export const StatusBadge = ({ s }) => <span className={'badge ' + (STATUS_CLASS[s] || '')}>{s}</span>;
export const PayBadge = ({ s }) => <span className={'badge pay-' + String(s).toLowerCase()}>{s}</span>;
export const PriBadge = ({ p }) => <span className={'badge pri-' + p}>{p}</span>;
export const Loader = () => <div className="loader"><i /></div>;
export const ErrorBox = ({ children }) => (children ? <div className="error-box">{children}</div> : null);

export function EmptyState({ icon, title, text, children }) {
  return (
    <div className="empty">
      <span className="big">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

/* Shows a loader, an error, or the content once data has arrived. */
export function Async({ state, children }) {
  if (state.loading && !state.data) return <Loader />;
  if (state.error) {
    return (
      <div className="card">
        <EmptyState icon="😕" title="Something went wrong" text={state.error.message}>
          <button className="btn btn-primary" onClick={state.reload}>Try again</button>
        </EmptyState>
      </div>
    );
  }
  return state.data ? children(state.data) : null;
}

/* Button that shows a spinner while its async onClick runs */
export function BusyButton({ onClick, children, className = 'btn btn-primary', type = 'button', ...rest }) {
  const [busy, setBusy] = useState(false);
  const click = async (e) => {
    if (!onClick) return;
    setBusy(true);
    try { await onClick(e); } finally { setBusy(false); }
  };
  return (
    <button type={type} className={className} disabled={busy} onClick={click} {...rest}>
      {busy ? <><span className="spinner" /> Please wait</> : children}
    </button>
  );
}

/* Number that counts up when it appears */
export function Counter({ value, money: isMoney }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / 900, 1);
      setV(p < 1 ? Math.round(value * (1 - Math.pow(1 - p, 3))) : value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{isMoney ? money(v) : num(Math.round(v))}</>;
}

export function Kpi({ tone, icon, label, value, isMoney, sub }) {
  return (
    <div className={'card kpi hover k-' + tone}>
      <span className="badge-ico">{icon}</span>
      <div className="label">{label}</div>
      <div className="value"><Counter value={value} money={isMoney} /></div>
      <div className="sub">{sub}</div>
    </div>
  );
}

/* Fades and slides in when scrolled into view */
export function Reveal({ children, delay = 0, className = '', style, as: Tag = 'div' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: delay + 's', ...style }}>{children}</Tag>;
}

/* ---------- Charts (plain HTML/SVG, colors come from CSS variables) ---------- */
export function BarChart({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div key={d.label + i} className={'bar-col' + (i === data.length - 1 ? ' current' : '')} title={`${d.label}: ${money(d.value)}`}>
          <span className="bar-val">{d.value >= 1000 ? Math.round(d.value / 1000) + 'k' : Math.round(d.value)}</span>
          <div className="bar" style={{ height: Math.max((d.value / max) * 100, 2) + '%', animationDelay: i * 0.08 + 's' }} />
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HBars({ data, fmt = (v) => v }) {
  if (!data.length) return <p className="muted">Nothing to show yet.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return data.map((d, i) => (
    <div className="hbar" key={d.label + i}>
      <div className="meta"><span>{d.label}</span><b>{fmt(d.value)}</b></div>
      <div className="track"><div className="fill" style={{ width: (d.value / max) * 100 + '%', animationDelay: i * 0.1 + 's' }} /></div>
    </div>
  ));
}

const ORDER = ['New Order', 'Confirmed', 'Preparing', 'Dispatched', 'Delivered', 'Cancelled'];
export function Donut({ counts }) {
  const total = ORDER.reduce((s, k) => s + (counts[k] || 0), 0);
  if (!total) return <p className="muted center">No orders yet.</p>;
  const R = 60, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 160 160">
        <circle className="seg-bg" cx="80" cy="80" r={R} />
        {ORDER.map((k, i) => {
          const v = counts[k] || 0;
          if (!v) return null;
          const len = (v / total) * C;
          const el = (
            <circle key={k} className={'c' + (i + 1)} cx="80" cy="80" r={R} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)">
              <title>{k}: {v}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        <text x="80" y="78" textAnchor="middle" fontSize="26" fontWeight="800" fill="currentColor">{total}</text>
        <text x="80" y="98" textAnchor="middle" fontSize="11" fill="currentColor" opacity=".6">orders</text>
      </svg>
      <div className="legend">
        {ORDER.map((k, i) => (counts[k] ? <span key={k}><i className={'c' + (i + 1)} />{k} <b>{counts[k]}</b></span> : null))}
      </div>
    </div>
  );
}

/* AI insight card (used on dashboard and assistant) */
export const TITLES = { dashboard: 'Dashboard', products: 'Products', orders: 'Orders', customers: 'Customers', payments: 'Payments', marketing: 'AI Marketing', assistant: 'AI Business Assistant', analytics: 'Analytics', settings: 'Settings' };
const TOPIC_ICON = { sales: '📈', orders: '🧾', payments: '💳', stock: '📦', marketing: '📣', customers: '💛' };
export function Insight({ i, n = 0 }) {
  return (
    <div className="insight" style={{ animationDelay: n * 0.07 + 's' }}>
      <div className="dot">{TOPIC_ICON[i.topic] || '💡'}</div>
      <div>
        <h4>{i.title} <PriBadge p={i.priority} /></h4>
        <p>{i.text}</p>
        {i.page && <a className="small" href={'#/' + i.page}>Go to {TITLES[i.page] || i.page} →</a>}
      </div>
    </div>
  );
}
