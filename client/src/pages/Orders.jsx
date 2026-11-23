import { useState } from 'react';
import api from '../api.js';
import { navigate, useAsync, useRoute } from '../hooks.js';
import { Async, EmptyState, PayBadge, StatusBadge } from '../components/ui.jsx';
import { NewOrderModal, OrderModal } from '../components/OrderModals.jsx';
import { SampleDataButton } from './Dashboard.jsx';
import { STATUSES, fmtDate, money, orderNo } from '../utils.js';

export default function Orders() {
  const { query } = useRoute();
  const state = useAsync(() => api.get('/orders'));
  const [filter, setFilter] = useState('All');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(query.new === '1');

  const closeNew = () => { setCreating(false); if (query.new) navigate('orders'); };

  return (
    <>
      <div className="page-head">
        <div><h2>Orders</h2><p>Every order from Instagram, Facebook and WhatsApp in one list.</p></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New order</button>
      </div>
      <Async state={state}>
        {(orders) => {
          const chips = ['All', ...STATUSES, 'Cancelled'];
          const l = orders.filter((o) => (filter === 'All' || o.status === filter) && (o.customer_name + ' ' + (o.items_summary || '')).toLowerCase().includes(q.toLowerCase()));
          return (
            <>
              <div className="toolbar">
                <input placeholder="🔍 Search customer or item" value={q} onChange={(e) => setQ(e.target.value)} />
                <div className="chips">
                  {chips.map((s) => (
                    <button key={s} className={'chip' + (s === filter ? ' on' : '')} onClick={() => setFilter(s)}>
                      {s}{s === 'All' ? '' : ` (${orders.filter((o) => o.status === s).length})`}
                    </button>
                  ))}
                </div>
              </div>
              {!l.length ? (
                <div className="card">
                  <EmptyState icon="🧾" title={orders.length ? 'No orders match' : 'No orders yet'} text={orders.length ? 'Try another filter.' : 'Record your first order to start tracking payments and status.'}>
                    {!orders.length && <><button className="btn btn-primary" onClick={() => setCreating(true)}>+ New order</button> <SampleDataButton onDone={state.reload} /></>}
                  </EmptyState>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Balance</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {l.map((o) => (
                        <tr key={o.id} className="clickable" onClick={() => setOpenId(o.id)}>
                          <td><b>{orderNo(o.id)}</b></td>
                          <td>{o.customer_name}</td>
                          <td className="muted" style={{ maxWidth: 220 }}>{o.items_summary}</td>
                          <td>{money(o.total)}</td>
                          <td>{o.balance > 0 && o.status !== 'Cancelled' ? <b className="down">{money(o.balance)}</b> : <span className="muted">-</span>}</td>
                          <td><PayBadge s={o.payment_status} /></td>
                          <td><StatusBadge s={o.status} /></td>
                          <td className="muted">{fmtDate(o.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </Async>
      {openId && <OrderModal id={openId} onClose={() => setOpenId(null)} onChange={state.reload} />}
      {creating && <NewOrderModal onClose={closeNew} onDone={state.reload} />}
    </>
  );
}
