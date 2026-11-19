// GET  /api/list-errors            → son hatalar (yalnızca admin)
// POST /api/list-errors {delete:id} | {clear:true}
import { fb } from './_fb.mjs';
import { HttpError } from './_pay.mjs';
import { sendErr, bodyOf } from './_http.mjs';

const ADMIN_EMAILS = ['retropatchyama@gmail.com', 'admin@retropatch.com'];
const iso = ts => { try { return ts && ts.toDate ? ts.toDate().toISOString() : null; } catch { return null; } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
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
