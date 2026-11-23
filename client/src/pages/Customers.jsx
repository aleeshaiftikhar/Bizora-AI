import { useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import { useAsync } from '../hooks.js';
import Modal from '../components/Modal.jsx';
import { Async, BusyButton, EmptyState, ErrorBox } from '../components/ui.jsx';
import { money, waLink } from '../utils.js';

export default function Customers() {
  const { confirm, toast } = useApp();
  const state = useAsync(() => api.get('/customers'));
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | customer

  const remove = async (c) => {
    if (!(await confirm(`Delete ${c.name}? Their past orders stay in your records.`))) return;
    try { await api.del('/customers/' + c.id); toast('Customer deleted'); state.reload(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-head">
        <div><h2>Customers</h2><p>Everyone who has ordered from you.</p></div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add customer</button>
      </div>
      <Async state={state}>
        {(list) => {
          const l = list.filter((c) => (c.name + c.phone).toLowerCase().includes(q.toLowerCase()));
          return (
            <>
              <div className="toolbar"><input placeholder="🔍 Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              {!l.length ? (
                <div className="card"><EmptyState icon="👥" title={list.length ? 'No matches' : 'No customers yet'}
                  text={list.length ? 'Try another search.' : 'Customers are added automatically when you record an order, or add them here.'} /></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>Orders</th><th>Total spent</th><th /></tr></thead>
                    <tbody>
                      {l.map((c) => (
                        <tr key={c.id}>
                          <td><b>{c.name}</b></td>
                          <td>{c.phone || <span className="muted">-</span>} {c.phone && <a className="small" target="_blank" rel="noopener noreferrer" href={waLink(c.phone)}>WhatsApp</a>}</td>
                          <td>{c.address || <span className="muted">-</span>}</td>
                          <td>{c.orders_count}</td>
                          <td>{money(c.total_spent)}</td>
                          <td><div className="actions"><button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Edit</button><button className="btn btn-danger btn-sm" onClick={() => remove(c)}>🗑</button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {editing && <CustomerForm customer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={state.reload} />}
            </>
          );
        }}
      </Async>
    </>
  );
}

function CustomerForm({ customer: c, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({ name: c?.name || '', phone: c?.phone || '', address: c?.address || '', notes: c?.notes || '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await (c ? api.put('/customers/' + c.id, f) : api.post('/customers', f));
      toast('Saved');
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={c ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{error}</ErrorBox>
        <label>Name<input value={f.name} onChange={set('name')} /></label>
        <label>Phone / WhatsApp<input value={f.phone} onChange={set('phone')} /></label>
        <label>Address<input value={f.address} onChange={set('address')} /></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
        <div className="modal-foot"><BusyButton type="submit">{c ? 'Save changes' : 'Add customer'}</BusyButton></div>
      </form>
    </Modal>
  );
}
