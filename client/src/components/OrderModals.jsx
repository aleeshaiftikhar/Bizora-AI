import { useEffect, useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import Modal from './Modal.jsx';
import { BusyButton, ErrorBox, Loader, PayBadge, StatusBadge } from './ui.jsx';
import { PAY_METHODS, STATUSES, fmtDate, money, orderNo, todayISO, waLink } from '../utils.js';

/* ------------------------------------------------------------------ */
/* Order details: status, items, payments                              */
/* ------------------------------------------------------------------ */
export function OrderModal({ id, onClose, onChange }) {
  const { toast, confirm } = useApp();
  const [o, setO] = useState(null);
  const [pay, setPay] = useState({ amount: '', method: 'Cash', note: '' });

  const apply = (order) => { setO(order); setPay((p) => ({ ...p, amount: order.balance || '' })); };

  useEffect(() => {
    api.get('/orders/' + id).then(apply).catch((e) => { toast(e.message, 'err'); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changed = () => onChange && onChange();
  const attempt = async (fn, okMsg) => {
    try { await fn(); if (okMsg) toast(okMsg); changed(); } catch (e) { toast(e.message, 'err'); }
  };

  const setStatus = (s) => s !== o.status && attempt(async () => apply(await api.put(`/orders/${id}/status`, { status: s })), 'Status: ' + s);
  const removePayment = async (pid) => {
    if (!(await confirm('Remove this payment record?', 'Remove'))) return;
    attempt(async () => { await api.del('/payments/' + pid); apply(await api.get('/orders/' + id)); }, 'Payment removed');
  };
  const addPayment = (e) => {
    e.preventDefault();
    return attempt(async () => apply(await api.post(`/orders/${id}/payments`, pay)), 'Payment added');
  };
  const cancel = async () => {
    if (!(await confirm('Cancel this order? Stock will be returned.', 'Cancel order'))) return;
    attempt(async () => apply(await api.put(`/orders/${id}/status`, { status: 'Cancelled' })), 'Order cancelled');
  };
  const remove = async () => {
    if (!(await confirm('Delete this order and its payments permanently?'))) return;
    attempt(async () => { await api.del('/orders/' + id); onClose(); }, 'Order deleted');
  };

  if (!o) return <Modal title="Order" onClose={onClose} wide><Loader /></Modal>;
  const idx = STATUSES.indexOf(o.status);
  const cancelled = o.status === 'Cancelled';
  const owing = o.balance > 0 && !cancelled;

  return (
    <Modal title={'Order ' + orderNo(o.id)} onClose={onClose} wide>
      <div className="row between">
        <div>
          <b style={{ fontSize: '1.1rem' }}>{o.customer_name}</b> {o.customer_phone && <span className="muted small">· {o.customer_phone}</span>}
          <div className="muted small">Placed {fmtDate(o.created_at)}{o.due_date ? ' · Due ' + fmtDate(o.due_date) : ''}</div>
        </div>
        <div className="row"><StatusBadge s={o.status} /><PayBadge s={o.payment_status} /></div>
      </div>

      {cancelled ? <div className="error-box mt">This order is cancelled. Stock was returned.</div> : (
        <div className="stepper">
          {STATUSES.map((s, i) => (
            <button key={s} className={'step' + (i < idx ? ' done' : '') + (i === idx ? ' now' : '')} onClick={() => setStatus(s)}>{i < idx ? '✓ ' : ''}{s}</button>
          ))}
        </div>
      )}

      <div className="table-wrap" style={{ boxShadow: 'none' }}>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th className="right">Subtotal</th></tr></thead>
          <tbody>{o.items.map((i) => <tr key={i.id}><td>{i.name}</td><td>{i.qty}</td><td>{money(i.price)}</td><td className="right">{money(i.qty * i.price)}</td></tr>)}</tbody>
        </table>
      </div>
      {o.notes && <p className="muted small mt">📝 {o.notes}</p>}

      <div className="grid g2 mt">
        <div className="sum-box">
          {o.discount > 0 && <div><span>Discount</span><b>- {money(o.discount)}</b></div>}
          <div><span>Total</span><b>{money(o.total)}</b></div>
          <div><span>Paid</span><b className="up">{money(o.paid)}</b></div>
          <div className="total"><span>Balance</span><b className={o.balance > 0 ? 'down' : 'up'}>{money(o.balance)}</b></div>
        </div>
        <div>
          <b className="small muted">PAYMENT HISTORY</b>
          {o.payments.length ? o.payments.map((p) => (
            <div className="pay-line" key={p.id}>
              <span><b>{money(p.amount)}</b> <span className="muted">{p.method} · {fmtDate(p.created_at)}{p.note ? ' · ' + p.note : ''}</span></span>
              <button className="btn btn-danger btn-sm" title="Remove payment" onClick={() => removePayment(p.id)}>✕</button>
            </div>
          )) : <p className="muted small">No payments yet.</p>}
        </div>
      </div>

      {owing && (
        <form className="card mt" style={{ padding: 16, boxShadow: 'none' }} onSubmit={addPayment}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1.4fr auto', alignItems: 'end' }}>
            <label style={{ margin: 0 }}>Add payment<input type="number" min="1" max={o.balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
            <label style={{ margin: 0 }}>Method<select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label style={{ margin: 0 }}>Note<input placeholder="Optional" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></label>
            <BusyButton type="submit">Add</BusyButton>
          </div>
        </form>
      )}

      <div className="modal-foot" style={{ marginTop: 18 }}>
        {o.customer_phone && owing && (
          <a className="btn btn-soft" target="_blank" rel="noopener noreferrer"
            href={waLink(o.customer_phone, `Hi ${o.customer_name}, a friendly reminder that ${money(o.balance)} is remaining on order ${orderNo(o.id)}. Thank you!`)}>💬 Payment reminder</a>
        )}
        {!cancelled && <button className="btn btn-ghost" onClick={cancel}>Cancel order</button>}
        <button className="btn btn-danger" onClick={remove}>Delete</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* New order                                                           */
/* ------------------------------------------------------------------ */
let rowKey = 0;
const blankRow = () => ({ key: ++rowKey, product_id: '', name: '', qty: 1, price: '' });

export function NewOrderModal({ onClose, onDone }) {
  const { toast } = useApp();
  const [lists, setLists] = useState(null);
  const [customerId, setCustomerId] = useState('');
  const [nc, setNc] = useState({ name: '', phone: '', address: '' });
  const [due, setDue] = useState('');
  const [rows, setRows] = useState([blankRow()]);
  const [discount, setDiscount] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/products'), api.get('/customers')])
      .then(([products, customers]) => setLists({ products, customers }))
      .catch((e) => { toast(e.message, 'err'); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!lists) return <Modal title="New order" onClose={onClose} wide><Loader /></Modal>;
  const { products, customers } = lists;

  const patchRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const pickProduct = (key, pid) => {
    const p = products.find((x) => String(x.id) === pid);
    patchRow(key, { product_id: pid, price: p ? p.price : '' });
  };
  const subtotal = rows.reduce((s, r) => s + (+r.qty || 0) * (+r.price || 0), 0);
  const remaining = Math.max(subtotal - (+discount || 0) - (+advance || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const body = {
      items: rows.map((r) => ({ product_id: r.product_id ? +r.product_id : null, name: r.name, qty: +r.qty || 1, price: r.price })),
      discount, advance_paid: advance, payment_method: method, notes, due_date: due,
    };
    if (customerId === 'new') body.customer = nc;
    else if (customerId) body.customer_id = +customerId;
    try {
      await api.post('/orders', body);
      toast('Order saved');
      onDone && onDone();
      onClose();
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal title="New order" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
       
        <div className="form-grid">
          <label>Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer…</option>
              <option value="new">➕ New customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Due / delivery date<input type="date" min={todayISO()} value={due} onChange={(e) => setDue(e.target.value)} /></label>
        </div>
        {customerId === 'new' && (
          <div className="form-grid">
            <label>Customer name<input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></label>
            <label>Phone<input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></label>
            <label className="full">Address<input value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} /></label>
          </div>
        )}

        <div className="muted small" style={{ marginBottom: 6, fontWeight: 600 }}>ITEMS</div>
        {rows.map((r) => (
          <div className="item-row" key={r.key}>
            <div className="name-col">
              <select value={r.product_id} onChange={(e) => pickProduct(r.key, e.target.value)}>
                <option value="">Custom item…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}{p.track_stock ? ` (${p.stock} left)` : ''}</option>)}
              </select>
              {!r.product_id && <input style={{ marginTop: 6 }} placeholder="Item name" value={r.name} onChange={(e) => patchRow(r.key, { name: e.target.value })} />}
            </div>
            <input type="number" min="1" aria-label="Quantity" value={r.qty} onChange={(e) => patchRow(r.key, { qty: e.target.value })} />
            <input type="number" min="0" placeholder="Price" aria-label="Price" value={r.price} onChange={(e) => patchRow(r.key, { price: e.target.value })} />
            <button type="button" className="icon-btn" aria-label="Remove item" onClick={() => rows.length > 1 && setRows(rows.filter((x) => x.key !== r.key))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setRows([...rows, blankRow()])}>+ Add item</button>

        <div className="form-grid mt">
          <label>Discount (Rs.)<input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
          <label>Advance paid (Rs.)<input type="number" min="0" value={advance} onChange={(e) => setAdvance(e.target.value)} /></label>
          <label>Payment method<select value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label>Notes<input placeholder="Message on cake, delivery notes…" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>

        <div className="sum-box">
          <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
          <div><span>Discount</span><b>{money(+discount || 0)}</b></div>
          <div><span>Advance paid</span><b>{money(+advance || 0)}</b></div>
          <div className="total"><span>Remaining balance</span><b>{money(remaining)}</b></div>
        </div>
                <div className="modal-foot sticky-foot">
          {error && <div className="error-box">{error}</div>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <BusyButton type="submit">Save order</BusyButton>
        </div>
      </form>
    </Modal>
  );
}
