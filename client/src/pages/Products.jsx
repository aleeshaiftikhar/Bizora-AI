import { useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import { navigate, useAsync } from '../hooks.js';
import Modal from '../components/Modal.jsx';
import { Async, BusyButton, EmptyState, ErrorBox } from '../components/ui.jsx';
import { SampleDataButton } from './Dashboard.jsx';
import { catEmoji, money, photoToDataUrl } from '../utils.js';

export default function Products() {
  const { confirm, toast } = useApp();
  const state = useAsync(() => api.get('/products'));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [editing, setEditing] = useState(null); // null | 'new' | product

  const remove = async (p) => {
    if (!(await confirm(`Delete "${p.name}"? Past orders keep their history.`))) return;
    try { await api.del('/products/' + p.id); toast('Product deleted'); state.reload(); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="page-head">
        <div><h2>Products</h2><p>Manage what you sell, prices and stock.</p></div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add product</button>
      </div>
      <Async state={state}>
        {(products) => {
          const cats = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
          const list = products.filter((p) => (cat === 'All' || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()));
          return (
            <>
              <div className="toolbar">
                <input placeholder="🔍 Search products" value={q} onChange={(e) => setQ(e.target.value)} />
                <select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              {!list.length ? (
                <div className="card">
                  {products.length
                    ? <EmptyState icon="🔍" title="No matches" text="Try a different search or category." />
                    : <EmptyState icon="📦" title="No products yet" text="Add your first product to start taking orders and creating AI content.">
                        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add product</button> <SampleDataButton onDone={state.reload} />
                      </EmptyState>}
                </div>
              ) : (
                <div className="grid stagger" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
                  {list.map((p) => {
                    const low = p.track_stock && p.stock <= 3;
                    const pct = p.track_stock ? Math.min(p.stock / 20, 1) * 100 : 100;
                    return (
                      <div className="card product-card hover" key={p.id}>
                        <div className="product-img">
                          {p.image_url ? <img src={p.image_url} alt={p.name} onError={(e) => e.currentTarget.remove()} /> : <span style={{ position: 'absolute' }}>{catEmoji(p.category, p.name)}</span>}
                          {p.category && <span className="tag">{p.category}</span>}
                        </div>
                        <div className="product-body">
                          <h3>{p.name}</h3>
                          <div className="price">{money(p.price)}</div>
                          <div className="muted small">
                            {p.track_stock ? (p.stock <= 0 ? <b className="down">Out of stock</b> : <>{p.stock} in stock{low && <> · <b className="down">low</b></>}</>) : 'Made to order'} · {p.sold} sold
                          </div>
                          <div className={'stock-bar' + (low ? ' low' : '')}><i style={{ width: pct + '%' }} /></div>
                          <div className="product-actions">
                            <button className="btn btn-soft btn-sm" onClick={() => navigate('marketing?product=' + p.id)}>✨ Caption</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>🗑</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {editing && (
                <ProductForm product={editing === 'new' ? null : editing} categories={cats.filter((c) => c !== 'All')}
                  onClose={() => setEditing(null)} onSaved={state.reload} />
              )}
            </>
          );
        }}
      </Async>
    </>
  );
}

function ProductForm({ product: p, categories, onClose, onSaved }) {
  const { toast, refreshMe } = useApp();
  const [f, setF] = useState({
    name: p?.name || '', category: p?.category || '', image_url: p?.image_url || '', price: p?.price ?? '', cost: p?.cost ?? '',
    stock: p?.stock ?? 10, track_stock: p ? !!p.track_stock : true, description: p?.description || '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const choosePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setF((cur) => ({ ...cur, image_url: '' })); const url = await photoToDataUrl(file); setF((cur) => ({ ...cur, image_url: url })); }
    catch (err) { toast(err.message, 'err'); }
  };

  const writeDescription = async () => {
    if (!f.name.trim()) { toast('Enter a product name first', 'err'); return; }
    try {
      const r = await api.post('/ai/marketing', { kind: 'description', name: f.name, category: f.category, price: f.price, details: '', tone: 'friendly', platform: 'Instagram' });
      setF((cur) => ({ ...cur, description: r.options[0].text }));
      toast('Description ready');
      refreshMe().catch(() => {});
    } catch (err) { toast(err.message, 'err'); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await (p ? api.put('/products/' + p.id, f) : api.post('/products', f));
      toast(p ? 'Product updated' : 'Product added');
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal title={p ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ErrorBox>{error}</ErrorBox>
        <div className="form-grid">
          <label className="full">Product name<input value={f.name} onChange={set('name')} placeholder="Chocolate Cake" /></label>
          <div className="full photo-field">
            <div className="photo-preview">
              {f.image_url ? <img src={f.image_url} alt="Product preview" /> : <span>{catEmoji(f.category, f.name)}</span>}
            </div>
            <div className="photo-actions">
              <b className="small muted">PRODUCT PHOTO</b>
              <div className="row">
                <label className="btn btn-soft btn-sm photo-btn">📷 {f.image_url ? 'Change photo' : 'Upload photo'}
                  <input type="file" accept="image/*" onChange={choosePhoto} hidden />
                </label>
                {f.image_url && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, image_url: '' })}>Remove</button>}
              </div>
              <span className="muted small">JPG or PNG from your phone or computer. It is resized automatically.</span>
            </div>
          </div>
          <label>Category<input value={f.category} onChange={set('category')} placeholder="Cakes" list="catList" /></label>
          <label>Or paste a photo link<input value={f.image_url.startsWith('data:') ? '' : f.image_url} onChange={set('image_url')} placeholder="https://..." /></label>
          <label>Selling price (Rs.)<input type="number" min="0" value={f.price} onChange={set('price')} /></label>
          <label>Your cost (Rs., optional)<input type="number" min="0" value={f.cost} onChange={set('cost')} /></label>
          <label>Stock quantity<input type="number" min="0" value={f.stock} onChange={set('stock')} /></label>
          <label className="check" style={{ alignSelf: 'end', marginBottom: 22 }}><input type="checkbox" checked={f.track_stock} onChange={set('track_stock')} /> Track stock</label>
          <label className="full">Description<textarea value={f.description} onChange={set('description')} placeholder="Describe your product…" /></label>
        </div>
        <datalist id="catList">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="modal-foot">
          <BusyButton className="btn btn-soft" onClick={writeDescription}>✨ Write description with AI</BusyButton>
          <BusyButton type="submit">{p ? 'Save changes' : 'Add product'}</BusyButton>
        </div>
      </form>
    </Modal>
  );
}
