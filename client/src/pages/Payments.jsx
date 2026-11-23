import { useState } from 'react';
import api from '../api.js';
import { useAsync } from '../hooks.js';
import { Async, EmptyState, Kpi, StatusBadge } from '../components/ui.jsx';
import { OrderModal } from '../components/OrderModals.jsx';
import { fmtDate, money, orderNo } from '../utils.js';

export default function Payments() {
  const state = useAsync(async () => {
    const [orders, pays] = await Promise.all([api.get('/orders'), api.get('/payments')]);
    return { orders, pays };
  });
  const [openId, setOpenId] = useState(null);

  return (
    <>
      <div className="page-head"><div><h2>Payments</h2><p>Who has paid, who still owes, and every payment made.</p></div></div>
      <Async state={state}>
        {({ orders, pays }) => {
          const live = orders.filter((o) => o.status !== 'Cancelled');
          const owing = live.filter((o) => o.balance > 0).sort((a, b) => b.balance - a.balance);
          const sum = (k) => live.reduce((s, o) => s + o[k], 0);
          const count = (s) => live.filter((o) => o.payment_status === s).length;
          return (
            <>
              <div className="grid g4 stagger">
                <Kpi tone="success" icon="✅" label="Collected" value={sum('paid')} isMoney sub={`${count('Paid')} orders fully paid`} />
                <Kpi tone="warning" icon="⏳" label="Outstanding" value={sum('balance')} isMoney sub={`${owing.length} orders with balance`} />
                <Kpi tone="accent" icon="🌗" label="Partial payments" value={count('Partial')} sub="Advance received" />
                <Kpi tone="info" icon="⭕" label="Unpaid orders" value={count('Unpaid')} sub="No payment yet" />
              </div>

              <h3 className="mt">Outstanding balances</h3>
              {owing.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {owing.map((o) => (
                        <tr key={o.id}>
                          <td><b>{orderNo(o.id)}</b></td><td>{o.customer_name}</td><td>{money(o.total)}</td><td>{money(o.paid)}</td>
                          <td><b className="down">{money(o.balance)}</b></td><td><StatusBadge s={o.status} /></td>
                          <td><div className="actions"><button className="btn btn-soft btn-sm" onClick={() => setOpenId(o.id)}>Add payment</button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="card"><EmptyState icon="🎉" title="All caught up" text="There are no outstanding balances." /></div>}

              <h3 className="mt">Payment history</h3>
              {pays.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Method</th><th>Note</th><th className="right">Amount</th></tr></thead>
                    <tbody>
                      {pays.slice(0, 60).map((p) => (
                        <tr key={p.id}>
                          <td className="muted">{fmtDate(p.created_at)}</td><td>{orderNo(p.order_id)}</td><td>{p.customer_name}</td>
                          <td>{p.method}</td><td className="muted">{p.note}</td><td className="right"><b>{money(p.amount)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="card"><EmptyState icon="💳" title="No payments yet" text="Payments appear here when you record advances or full payments on orders." /></div>}
              {openId && <OrderModal id={openId} onClose={() => setOpenId(null)} onChange={state.reload} />}
            </>
          );
        }}
      </Async>
    </>
  );
}
