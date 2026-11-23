/* Small API client. Talks to the Python backend under /api */
const api = {
  token: localStorage.getItem('bz_token') || '',

  setToken(t) {
    this.token = t || '';
    if (t) localStorage.setItem('bz_token', t);
    else localStorage.removeItem('bz_token');
  },

  async request(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (this.token) opts.headers.Authorization = 'Bearer ' + this.token;
    if (body !== undefined) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch('/api' + path, opts);
    } catch (e) {
      throw new Error('Cannot reach the server. Is it running?');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401 && this.token) {
        this.setToken('');
        window.dispatchEvent(new Event('bz-unauth'));
      }
      const err = new Error(data.error || 'Something went wrong');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get: (p) => api.request('GET', p),
  post: (p, b) => api.request('POST', p, b || {}),
  put: (p, b) => api.request('PUT', p, b || {}),
  del: (p) => api.request('DELETE', p),
};

export default api;
