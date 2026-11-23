import { useState } from 'react';
import api from '../api.js';
import { useApp } from '../context.jsx';
import { BusyButton, ErrorBox } from '../components/ui.jsx';
import { BUSINESS_TYPES, formObj } from '../utils.js';

export default function Auth({ mode }) {
  const reg = mode === 'register';
  const { signIn } = useApp();
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post(reg ? '/auth/register' : '/auth/login', formObj(e.target));
      signIn(r.token, r.user);
      window.location.hash = '#/dashboard';
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth">
      <div className="auth-side">
        <div className="blob b1" /><div className="blob b2" />
        <a className="brand" href="#/"><span className="brand-logo">B</span> Bizora AI</a>
        <h2>Promote Smarter.<br />Manage Easier.<br />Grow Faster.</h2>
        <p>Your AI powered business growth and management partner.</p>
        <ul>
          <li>✨ AI captions and campaigns in seconds</li>
          <li>🧾 Orders and payments, always organised</li>
          <li>📊 Clear sales and growth insights</li>
        </ul>
      </div>
      <div className="auth-form">
        <div className="auth-box" key={mode}>
          <h1>{reg ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted">{reg ? 'Set up your business in under a minute.' : 'Log in to manage your business.'}</p>
          <ErrorBox>{error}</ErrorBox>
          <form onSubmit={submit} noValidate>
            {reg && (
              <div className="form-grid">
                <label>Your name<input name="name" placeholder="Areeba Khan" /></label>
                <label>Business name<input name="business_name" placeholder="Sweet Crumbs" /></label>
                <label>Business type<select name="business_type">{BUSINESS_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
                <label>Phone / WhatsApp<input name="phone" placeholder="0300-1234567" /></label>
                <label className="full">City<input name="city" placeholder="Islamabad" /></label>
              </div>
            )}
            <label>Email<input name="email" type="email" placeholder="you@example.com" autoComplete="email" /></label>
            <label>Password<input name="password" type="password" placeholder={reg ? 'At least 6 characters' : 'Your password'} autoComplete={reg ? 'new-password' : 'current-password'} /></label>
            <BusyButton type="submit" className="btn btn-primary btn-block btn-lg">{reg ? 'Create account' : 'Log in'}</BusyButton>
          </form>
          <p className="muted center mt">
            {reg ? <>Already have an account? <a href="#/login">Log in</a></> : <>New to Bizora AI? <a href="#/register">Create an account</a></>}
          </p>
          <p className="center small"><a href="#/">← Back to home</a></p>
        </div>
      </div>
    </div>
  );
}
