import api from '../api.js';
import { useAsync } from '../hooks.js';
import { Async, BarChart, Donut, EmptyState, HBars, Kpi } from '../components/ui.jsx';
import { SampleDataButton } from './Dashboard.jsx';
import { money } from '../utils.js';

export default function Analytics() {
  const state = useAsync(() => api.get('/analytics'));
  return (
    <Async state={state}>
      {(a) => {
        const k = a.kpis;
        if (!k.total_orders) {
          return (
            <>
              <div className="page-head"><div><h2>Analytics</h2></div></div>
              <div className="card">
                <EmptyState icon="📊" title="No data to chart yet" text="Record some orders and your analytics will appear here.">
                  <SampleDataButton onDone={state.reload} />
                </EmptyState>
              </div>
            </>
          );
        }
        const g = k.growth;
        return (
          <>
            <div className="page-head"><div><h2>Analytics</h2><p>How your business is performing.</p></div></div>
            <div className="grid g4 stagger">
              <Kpi tone="primary" icon="💰" label="Total sales" value={k.total_sales} isMoney
                sub={g === null ? 'Not enough history' : <><span className={g >= 0 ? 'up' : 'down'}>{g >= 0 ? '▲' : '▼'} {Math.abs(g)}%</span> vs last month</>} />
              <Kpi tone="success" icon="📈" label="Estimated profit" value={k.profit} isMoney sub="Based on product costs" />
              <Kpi tone="secondary" icon="🧾" label="Orders" value={k.total_orders} sub={k.pending_orders + ' pending'} />
              <Kpi tone="accent" icon="👥" label="Customers" value={k.customers} sub={'Avg order ' + money(k.avg_order)} />
            </div>
            <div className="grid g-main mt">
              <div className="card"><h3>Monthly sales</h3><BarChart data={a.monthly.map((m) => ({ label: m.label, value: m.sales }))} /></div>
              <div className="card"><h3>Orders by status</h3><Donut counts={a.status_counts} /></div>
            </div>
            <div className="grid g3 mt">
              <div className="card"><h3>Best-selling products</h3><HBars data={a.best_sellers.map((b) => ({ label: b.name, value: b.qty }))} fmt={(v) => v + ' sold'} /></div>
              <div className="card"><h3>Sales by category</h3><HBars data={a.categories.map((c) => ({ label: c.category, value: c.revenue }))} fmt={money} /></div>
              <div className="card"><h3>Top customers</h3><HBars data={a.top_customers.map((c) => ({ label: c.name, value: c.spent }))} fmt={money} /></div>
            </div>
            <div className="card mt">
              <h3>Orders per month</h3>
              <BarChart data={a.monthly.map((m) => ({ label: m.label, value: m.orders }))} />
              <p className="muted small">Hover a bar to see the value.</p>
            </div>
          </>
        );
      }}
    </Async>
  );
}
