import { useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import { useAsync } from '../hooks.js';
import { Async, BarChart, BusyButton, Donut, EmptyState, HBars, Insight, Kpi, PayBadge, StatusBadge } from '../components/ui.jsx';
import { OrderModal } from '../components/OrderModals.jsx';
import { money, orderNo } from '../utils.js';

/* Button that fills an empty account with the demo bakery */
export function SampleDataButton({ onDone, className = 'btn btn-soft' }) {
  const { toast } = useApp();
  return (
    <BusyButton className={className} onClick={async () => {
      try { await api.post('/demo/seed'); toast('Sample bakery data loaded'); onDone(); } catch (e) { toast(e.message, 'err'); }
    }}>Load sample data</BusyButton>
  );
}

export default function Dashboard() {
  const { user } = useApp();
  const state = useAsync(async () => {
    const [analytics, orders] = await Promise.all([api.get('/analytics'), api.get('/orders')]);
    return { analytics, orders };
  });
  const quick = useAsync(() => api.get('/ai/quick-insights'));
  const [openId, setOpenId] = useState(null);

  const first = user.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const reloadAll = () => { state.reload(); quick.reload(); };

  return (
    <Async state={state}>
      {({ analytics: a, orders }) => {
        const k = a.kpis;
        if (!k.products && !orders.length) {
          return (
            <>
              <div className="page-head"><div><h2>{greet}, {first} 👋</h2><p>Let's get {user.business_name} set up.</p></div></div>
              <div className="card">
                <EmptyState icon="🚀" title="Your dashboard is waiting" text="Add your first product, or load sample data from a demo bakery to see how everything works.">
                  <div className="row" style={{ justifyContent: 'center' }}>
                    <a className="btn btn-primary" href="#/products">Add a product</a>
                    <SampleDataButton onDone={reloadAll} />
                  </div>
                </EmptyState>
              </div>
            </>
          );
        }
        const g = k.growth;
        return (
          <>
            <div className="page-head">
              <div><h2>{greet}, {first} 👋</h2><p>Here's how {user.business_name} is doing.</p></div>
              <div className="row"><a className="btn btn-soft" href="#/marketing">✨ Create content</a><a className="btn btn-primary" href="#/orders?new=1">+ New order</a></div>
            </div>
            <div className="grid g4 stagger">
              <Kpi tone="primary" icon="💰" label="Total sales" value={k.total_sales} isMoney
                sub={g === null ? 'Collected ' + money(k.collected) : <><span className={g >= 0 ? 'up' : 'down'}>{g >= 0 ? '▲' : '▼'} {Math.abs(g)}%</span> vs last month</>} />
              <Kpi tone="secondary" icon="🧾" label="Total orders" value={k.total_orders} sub={'Avg order ' + money(k.avg_order)} />
              <Kpi tone="accent" icon="⏳" label="Pending orders" value={k.pending_orders} sub="Being processed right now" />
              <Kpi tone="warning" icon="💳" label="Still to collect" value={k.outstanding} isMoney sub={'Collected ' + money(k.collected)} />
            </div>
            <div className="grid g-main mt">
              <div className="card">
                <div className="row between"><h3>Sales, last 6 months</h3><a href="#/analytics" className="small">Full analytics →</a></div>
                <BarChart data={a.monthly.map((m) => ({ label: m.label, value: m.sales }))} />
              </div>
              <div className="card"><h3>Orders by status</h3><Donut counts={a.status_counts} /></div>
            </div>
            <div className="grid g2 mt">
              <div className="card">
                <div className="row between"><h3>🤖 AI insights</h3><a href="#/assistant" className="small">Open assistant →</a></div>
                {quick.data
                  ? (quick.data.insights.length ? quick.data.insights.map((i, n) => <Insight key={i.title} i={i} n={n} />) : <p className="muted">No insights yet. Record a few orders and check back.</p>)
                  : <><div className="skeleton" /><div className="skeleton" /></>}
              </div>
              <div className="card"><h3>Best sellers</h3><HBars data={a.best_sellers.map((b) => ({ label: b.name, value: b.qty }))} fmt={(v) => v + ' sold'} /></div>
            </div>
            <div className="card mt">
              <div className="row between"><h3>Recent orders</h3><a href="#/orders" className="small">View all →</a></div>
              <div className="table-wrap" style={{ boxShadow: 'none', marginTop: 10 }}>
                <table>
                  <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
                  <tbody>
                    {orders.slice(0, 5).map((o) => (
                      <tr key={o.id} className="clickable" onClick={() => setOpenId(o.id)}>
                        <td><b>{orderNo(o.id)}</b></td><td>{o.customer_name}</td><td>{money(o.total)}</td>
                        <td><PayBadge s={o.payment_status} /></td><td><StatusBadge s={o.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {openId && <OrderModal id={openId} onClose={() => setOpenId(null)} onChange={reloadAll} />}
          </>
        );
      }}
    </Async>
  );
}
