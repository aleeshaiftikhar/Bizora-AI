import { useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import { useAsync, useRoute } from '../hooks.js';
import { Async, BusyButton, EmptyState, ErrorBox } from '../components/ui.jsx';
import { copyText } from '../utils.js';

const KINDS = [['caption', '📝 Caption'], ['description', '📄 Description'], ['hashtags', '#️⃣ Hashtags'], ['campaign', '🎯 Campaign ideas']];

export default function Marketing() {
  const { query } = useRoute();
  const state = useAsync(() => api.get('/products'));
  return (
    <>
      <div className="ai-banner">
        <h3>AI Marketing Assistant</h3>
        <p>Pick a product, choose a tone and platform, and get ready-to-post content in seconds. Edit it, copy it, post it.</p>
      </div>
      <Async state={state}>{(products) => <Generator products={products} initialProduct={query.product || ''} />}</Async>
    </>
  );
}

function Generator({ products, initialProduct }) {
  const { usage, refreshMe, toast } = useApp();
  const [kind, setKind] = useState('caption');
  const [f, setF] = useState({ product_id: initialProduct, name: '', price: '', tone: 'friendly', platform: 'Instagram', details: '' });
  const [out, setOut] = useState(null); // null | 'loading' | { options, source } | { error }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const generate = async (e) => {
    e.preventDefault();
    setOut('loading');
    try {
      const r = await api.post('/ai/marketing', { ...f, kind });
      setOut(r);
      refreshMe().catch(() => {});
    } catch (err) { setOut({ error: err.message, upgrade: err.status === 402 }); }
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', alignItems: 'start' }}>
      <div className="card">
        <form onSubmit={generate} noValidate>
          <div className="seg" style={{ marginBottom: 18 }}>
            {KINDS.map(([k, label]) => <button type="button" key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{label}</button>)}
          </div>
          <label>Product
            <select value={f.product_id} onChange={set('product_id')}>
              <option value="">Type a product name instead…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {!f.product_id && (
            <div className="form-grid">
              <label>Product name<input value={f.name} onChange={set('name')} placeholder="Silver Pearl Earrings" /></label>
              <label>Price (Rs.)<input type="number" min="0" value={f.price} onChange={set('price')} /></label>
            </div>
          )}
          <div className="form-grid">
            <label>Tone
              <select value={f.tone} onChange={set('tone')}>
                <option value="friendly">Friendly</option><option value="luxury">Luxury</option><option value="fun">Fun</option><option value="professional">Professional</option>
              </select>
            </label>
            <label>Platform
              <select value={f.platform} onChange={set('platform')}><option>Instagram</option><option>Facebook</option><option>WhatsApp</option></select>
            </label>
          </div>
          <label>Extra details (optional)
            <textarea value={f.details} onChange={set('details')} placeholder="Fresh daily, free delivery above Rs. 3,000, perfect for birthdays…" />
          </label>
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={out === 'loading'}>✨ Generate</button>
          {usage && (
            <p className="source-note center">
              {usage.limits.ai ? `${usage.used.ai} of ${usage.limits.ai} AI generations used this month` : 'Unlimited AI generations'}
            </p>
          )}
        </form>
      </div>

      <div>
        {out === null && <div className="card"><EmptyState icon="✨" title="Your content will appear here" text="Choose what you want to create and hit Generate." /></div>}
        {out === 'loading' && <><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></>}
        {out && out.error && (
          <div className="card"><ErrorBox>{out.error}</ErrorBox>{out.upgrade && <a className="btn btn-primary" href="#/settings">See plans</a>}</div>
        )}
        {out && out.options && (
          <>
            {out.options.map((o, i) => (
              <div className="result" key={i} style={{ animationDelay: i * 0.1 + 's' }}>
                <div className="rtitle">
                  <span>{o.title}</span>
                  <BusyButton className="btn btn-soft btn-sm" onClick={async () => { await copyText(o.text); toast('Copied to clipboard'); }}>Copy</BusyButton>
                </div>
                <div className="rtext">{o.text}</div>
              </div>
            ))}
            <p className="source-note">
              {out.source === 'ai' ? '✨ Written by Claude' : 'Generated with Bizora smart templates. Add an ANTHROPIC_API_KEY on the server for fully custom AI writing.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
