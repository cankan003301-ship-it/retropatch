// Site hata kaydı yardımcıları (endpoint değildir; api/track.mjs içinden çağrılır — Vercel ücretsiz planda 12 fonksiyon sınırı var)
import crypto from 'node:crypto';
import { fb } from './_fb.mjs';
import { HttpError } from './_pay.mjs';
import { clientIp, bodyOf, sendErr } from './_http.mjs';

const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 15;
}
const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
const ADMIN_EMAILS = ['retropatchyama@gmail.com', 'admin@retropatch.com'];
const iso = ts => { try { return ts && ts.toDate ? ts.toDate().toISOString() : null; } catch { return null; } };

// POST /api/track (Authorization yok)  → tarayıcı hatası kaydı
export async function logError(req, res) {
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

// GET /api/track?errors=1  |  POST /api/track {delete:id}|{clear:true}  (Authorization: Bearer — yalnızca admin)
export async function adminErrors(req, res) {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) throw new HttpError(401, 'Giriş gerekli');
    const { db, auth } = fb();
    let user;
    try { user = await auth.verifyIdToken(m[1]); } catch (e) { throw new HttpError(401, 'Oturum doğrulanamadı'); }
    if (!ADMIN_EMAILS.includes(user.email)) throw new HttpError(403, 'Yetkisiz');
    const col = db.collection('site_errors');
    if (req.method === 'POST') {
      const b = bodyOf(req);
      if (b.clear) {
        const s = await col.limit(400).get();
        const batch = db.batch(); s.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
        return res.status(200).json({ ok: true, deleted: s.size });
      }
      if (typeof b.delete === 'string' && /^[a-f0-9]{20}$/.test(b.delete)) { await col.doc(b.delete).delete(); return res.status(200).json({ ok: true }); }
      throw new HttpError(400, 'Geçersiz istek');
    }
    const s = await col.orderBy('lastAt', 'desc').limit(150).get();
    res.status(200).json({ errors: s.docs.map(d => { const o = d.data(); return { id: d.id, type: o.type, msg: o.msg, src: o.src, line: o.line, col: o.col, stack: o.stack, page: o.page, ua: o.ua, count: o.count || 1, firstAt: iso(o.firstAt), lastAt: iso(o.lastAt) }; }) });
  } catch (e) { sendErr(res, e); }
}
