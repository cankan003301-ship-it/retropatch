// POST /api/log-error — sitedeki tarayıcı hatalarını toplar (Firestore: site_errors). Admin panelinde "Site Hataları" sayfasında görünür.
// Admin SDK ile yazar: Firestore kuralı değişikliği gerekmez.
import crypto from 'node:crypto';
import { fb } from './_fb.mjs';
import { clientIp, bodyOf } from './_http.mjs';

const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 15;
}
const cut = (v, n) => String(v == null ? '' : v).slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  try {
    if (limited(clientIp(req))) return res.status(429).end();
    const ua = cut(req.headers['user-agent'], 160);
    if (/bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(ua)) return res.status(204).end();
    const b = bodyOf(req);
    const msg = cut(b.msg, 300).trim();
    if (!msg) return res.status(400).end();
    const type = ['error', 'promise', 'resource', 'console'].includes(b.type) ? b.type : 'error';
    const src = cut(b.src, 200), line = parseInt(b.line, 10) || 0;
    const page = cut(b.page, 200);
    const id = crypto.createHash('sha1').update([type, msg, src, line, page.split('?')[0]].join('|')).digest('hex').slice(0, 20);
    const { db, FieldValue } = fb();
    const ref = db.collection('site_errors').doc(id);
    const snap = await ref.get();
    const upd = { type, msg, src, line, col: parseInt(b.col, 10) || 0, stack: cut(b.stack, 700), page, ua,
      count: FieldValue.increment(1), lastAt: FieldValue.serverTimestamp() };
    if (!snap.exists) upd.firstAt = FieldValue.serverTimestamp();
    await ref.set(upd, { merge: true });
    res.status(204).end();
  } catch (e) { console.error('[log-error]', e); res.status(204).end(); }   // hata kaydı asla siteyi etkilemesin
}
