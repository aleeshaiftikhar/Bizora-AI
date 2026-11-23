export const BUSINESS_TYPES = ['Home Bakery', 'Clothing Boutique', 'Jewellery Shop', 'Custom Gift Store', 'Cosmetics Seller', 'Handmade Products', 'Other'];
export const STATUSES = ['New Order', 'Confirmed', 'Preparing', 'Dispatched', 'Delivered'];
export const STATUS_CLASS = { 'New Order': 'st-new', Confirmed: 'st-confirmed', Preparing: 'st-preparing', Dispatched: 'st-dispatched', Delivered: 'st-delivered', Cancelled: 'st-cancelled' };
export const PAY_METHODS = ['Cash', 'Bank Transfer', 'EasyPaisa', 'JazzCash', 'Card'];

export const num = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const money = (n) => {
  const v = Number(n || 0);
  return 'Rs. ' + v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};
export const parseDate = (s) => new Date(String(s).replace(' ', 'T'));
export const fmtDate = (s) => (s ? parseDate(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const orderNo = (id) => '#' + String(id).padStart(4, '0');

export function catEmoji(cat, name) {
  const t = ((cat || '') + ' ' + (name || '')).toLowerCase();
  const map = [
    [/cake|cupcake|brownie|cookie|dessert|bake|pastry|cheese/, '🍰'], [/dress|shirt|kurta|cloth|suit|abaya|scarf|shawl|fashion/, '👗'],
    [/ring|necklace|earring|jewel|bangle|bracelet|pendant/, '💍'], [/gift|hamper|custom|mug|frame/, '🎁'],
    [/lip|makeup|cosmetic|skin|serum|perfume|beauty/, '💄'], [/candle|craft|handmade|crochet|resin|art/, '🧵'],
  ];
  for (const [rx, e] of map) if (rx.test(t)) return e;
  return '🛍️';
}

/* WhatsApp link for a Pakistani-style phone number (0300... becomes 92300...) */
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0/, '92');
  return `https://wa.me/${digits}` + (text ? `?text=${encodeURIComponent(text)}` : '');
}

export function formObj(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = v; });
  return o;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch (e) { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (_) { /* ignore */ }
  ta.remove();
}

/* Turns a chosen photo into a small JPEG data URL (max 720px) so it is quick to save and load */
export function photoToDataUrl(file, max = 720, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Please choose an image file')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}
