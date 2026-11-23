import { useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import { EmptyState, ErrorBox, Insight } from '../components/ui.jsx';

const FOCUS = [['general', '🔎 Full business check'], ['promote', '📣 What should I promote?'], ['followup', '📞 Who needs a follow-up?'], ['stock', '📦 Stock and restock']];

export default function Assistant() {
  const { refreshMe } = useApp();
  const [active, setActive] = useState('');
  const [out, setOut] = useState(null); // null | 'loading' | result | { error }

  const run = async (focus) => {
    setActive(focus);
    setOut('loading');
    try {
      setOut(await api.post('/ai/insights', { focus }));
      refreshMe().catch(() => {});
    } catch (err) { setOut({ error: err.message }); }
  };

  return (
    <>
      <div className="ai-banner">
        <h3>AI Business Growth Assistant</h3>
        <p>I read your products, orders and payments, then suggest practical next steps. Pick a question to start.</p>
      </div>
      <div className="chips">
        {FOCUS.map(([k, label]) => <button key={k} className={'chip' + (active === k ? ' on' : '')} onClick={() => run(k)}>{label}</button>)}
      </div>
      <div className="mt">
        {out === null && <div className="card"><EmptyState icon="🤖" title="Ready when you are" text="Choose a question above and I will analyse your recorded business data." /></div>}
        {out === 'loading' && <><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></>}
        {out && out.error && <div className="card"><ErrorBox>{out.error}</ErrorBox></div>}
        {out && out.insights && (
          <>
            <div className="card" style={{ marginBottom: 16 }}><b>Summary</b><p style={{ margin: '6px 0 0' }}>{out.summary}</p></div>
            {out.insights.length
              ? out.insights.map((i, n) => <Insight key={i.title} i={i} n={n} />)
              : <div className="card"><EmptyState icon="🎉" title="Nothing urgent" text="Everything looks healthy right now." /></div>}
            <p className="source-note">{out.source === 'ai' ? '✨ Summary written by Claude from your records.' : 'Insights are calculated from your own records.'}</p>
          </>
        )}
      </div>
    </>
  );
}
