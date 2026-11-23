import { useEffect, useState } from 'react';
import { useApp } from '../context.jsx';
import { PayBadge, Reveal, StatusBadge } from '../components/ui.jsx';

const FEATURES = [
  ['✨', 'AI Marketing Assistant', 'Captions, product descriptions, hashtags and campaign ideas in seconds, in your own tone.', 'primary'],
  ['📦', 'Product Management', 'Add products with photos, prices, categories and stock. Stock updates itself when orders come in.', 'secondary'],
  ['🧾', 'Order Management', 'Keep every Instagram, Facebook and WhatsApp order in one place with clear statuses.', 'accent'],
  ['💳', 'Payment Tracking', 'Advance, partial and full payments with automatic remaining balance. No more mental maths.', 'info'],
  ['📊', 'Business Analytics', 'Sales, pending orders, monthly charts and best sellers on one clean dashboard.', 'warning'],
  ['🤖', 'AI Growth Assistant', 'Reads your own records and tells you what to promote, who to follow up with and what to restock.', 'success'],
];
const PROBLEMS = [
  'Writing captions and product descriptions takes too much time',
  'Creating promotions and social content feels hard',
  'Orders get lost between DMs and WhatsApp chats',
  'Tracking order status and payment balances is messy',
  'No clear picture of sales or profit',
];
const STEPS = [
  ['Create your account', 'Sign up and add your business profile.'],
  ['Add products', 'Chocolate cake, brownies, cupcakes, with prices and stock.'],
  ['Promote with AI', 'Generate a caption and hashtags, then post to Instagram.'],
  ['Track orders and money', 'Record the order, add an advance, update status, watch analytics.'],
];
const PLANS = [
  ['Free', 'Rs. 0', ['Up to 15 products', 'Up to 50 orders', '20 AI generations a month', 'Basic dashboard'], false],
  ['Starter', 'Rs. 1,499', ['Up to 100 products', 'Up to 500 orders', '200 AI generations a month', 'Order and payment tracking'], true],
  ['Pro', 'Rs. 3,499', ['Unlimited products and orders', 'Unlimited AI generations', 'Advanced analytics', 'Campaign tools'], false],
];

const goTo = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

export default function Home() {
  const { user } = useApp();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const cta = user ? '#/dashboard' : '#/register';

  return (
    <>
      <header className={'site-nav' + (scrolled ? ' scrolled' : '')}>
        <a className="brand" href="#/"><span className="brand-logo">B</span> Bizora AI</a>
        <nav>
          <a href="#features" onClick={goTo('features')}>Features</a>
          <a href="#how" onClick={goTo('how')}>How it works</a>
          <a href="#pricing" onClick={goTo('pricing')}>Pricing</a>
        </nav>
        <div className="row">
          {user ? <a className="btn btn-light" href="#/dashboard">Open dashboard</a> : (
            <><a className="btn btn-outline-light" href="#/login">Log in</a><a className="btn btn-light" href="#/register">Get started</a></>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
        <div className="hero-inner">
          <div>
            <span className="pill anim-up">✨ Built for home businesses and small shops</span>
            <h1 className="anim-up" style={{ animationDelay: '.1s' }}>
              Promote <span className="hl">Smarter.</span><br />Manage <span className="hl">Easier.</span><br />Grow <span className="hl">Faster.</span>
            </h1>
            <p className="lead anim-up" style={{ animationDelay: '.2s' }}>
              Bizora AI puts your products, orders, payments, marketing and analytics in one dashboard, with an AI partner that helps you write, plan and grow.
            </p>
            <div className="row anim-up" style={{ animationDelay: '.3s' }}>
              <a className="btn btn-primary btn-lg" href={cta}>{user ? 'Open dashboard' : 'Start free'} →</a>
              <a className="btn btn-outline-light btn-lg" href="#how" onClick={goTo('how')}>See how it works</a>
            </div>
            <div className="hero-stats anim-up" style={{ animationDelay: '.4s' }}>
              <div><b>6 in 1</b><span>tools in one website</span></div>
              <div><b>10 sec</b><span>to a ready caption</span></div>
              <div><b>0</b><span>spreadsheets needed</span></div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="float-card fc-main">
              <div className="row between"><b>Sales this month</b><span className="badge st-delivered">+24%</span></div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 6 }}>Rs. 109,950</div>
              <div className="mini-bars">{[40, 62, 48, 78, 66, 92].map((h, i) => <i key={i} style={{ height: h + '%', animationDelay: i * 0.12 + 's' }} />)}</div>
            </div>
            <div className="float-card fc-order">
              <div className="row between"><b>🧾 New order</b><StatusBadge s="Confirmed" /></div>
              <div className="muted small" style={{ margin: '6px 0' }}>Ayesha · Chocolate Cake</div>
              <div className="row between"><span>Rs. 2,500</span><PayBadge s="Partial" /></div>
            </div>
            <div className="float-card fc-ai">
              <b>✨ AI caption</b>
              <p className="small muted typing" style={{ margin: '6px 0 0' }}>Made with love, just for you 🍰 Fresh chocolate cake, ready for your celebration…</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt"><div className="section-in">
        <Reveal className="section-head"><span className="eyebrow">The problem</span><h2>Running a small business is hard enough</h2><p>Sound familiar? Bizora AI was built for exactly these headaches.</p></Reveal>
        <div className="grid g3">
          {PROBLEMS.map((p, i) => <Reveal key={p} className="problem" delay={i * 0.07}><span className="x">✕</span><span>{p}</span></Reveal>)}
        </div>
      </div></section>

      <section className="section" id="features"><div className="section-in">
        <Reveal className="section-head"><span className="eyebrow">Features</span><h2>Everything in one place</h2><p>One integrated platform instead of five different apps and a notebook.</p></Reveal>
        <div className="grid g3">
          {FEATURES.map(([icon, title, text, tone], i) => (
            <Reveal key={title} className="card feature hover" delay={i * 0.07} style={{ '--k': `var(--${tone})` }}>
              <div className="fi">{icon}</div><h3>{title}</h3><p className="muted" style={{ margin: 0 }}>{text}</p>
            </Reveal>
          ))}
        </div>
      </div></section>

      <section className="section alt" id="how"><div className="section-in">
        <Reveal className="section-head"><span className="eyebrow">How it works</span><h2>From first product to first sale, in minutes</h2><p>Example: Sweet Crumbs, a home bakery.</p></Reveal>
        <div className="steps">
          {STEPS.map(([t, d], i) => <Reveal key={t} className="step-card" delay={i * 0.1}><h3>{t}</h3><p className="muted" style={{ margin: 0 }}>{d}</p></Reveal>)}
        </div>
      </div></section>

      <section className="section" id="pricing"><div className="section-in">
        <Reveal className="section-head"><span className="eyebrow">Pricing</span><h2>Start free, grow when you are ready</h2></Reveal>
        <div className="grid g3">
          {PLANS.map(([name, price, feats, pop], i) => (
            <Reveal key={name} className={'card price-card hover' + (pop ? ' pop' : '')} delay={i * 0.1}>
              {pop && <span className="ribbon">Most popular</span>}
              <h3>{name}</h3>
              <div className="amt">{price}<span className="muted small"> / month</span></div>
              <ul>{feats.map((f) => <li key={f}>{f}</li>)}</ul>
              <a className={'btn btn-block ' + (pop ? 'btn-primary' : 'btn-soft')} href={user ? '#/settings' : '#/register'}>{name === 'Free' ? 'Start free' : 'Choose ' + name}</a>
            </Reveal>
          ))}
        </div>
      </div></section>

      <section className="cta-band">
        <div className="blob b1" />
        <Reveal style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: '2.2rem' }}>Ready to promote smarter?</h2>
          <p>Join small business owners who stopped juggling chats and started growing.</p>
          <a className="btn btn-light btn-lg" href={cta}>{user ? 'Open dashboard' : 'Create your free account'} →</a>
        </Reveal>
      </section>

      <footer className="footer">
        <a className="brand" href="#/"><span className="brand-logo">B</span> Bizora AI</a>
        <span>Promote Smarter. Manage Easier. Grow Faster.</span>
        <span>© {new Date().getFullYear()} Bizora AI</span>
      </footer>
    </>
  );
}
