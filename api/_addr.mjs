// api/_addr.mjs — Müşteri Hesabım'da kayıtlı adresini değiştirince, o adresi kullanan ve henüz
// kargoya verilmemiş siparişlerinin adresini de günceller.
// POST /api/track?addr=1   Authorization: Bearer <Firebase ID token>
//   { mode: 'preview' | 'apply', old: {name,phone,line,district,city,zip}, new: {...} }
// Yalnızca kendi siparişleri (userId / e-posta), kargoya verilmemiş olanlar.
import { fb } from './_fb.mjs';
import { bodyOf } from './_http.mjs';

const norm = v => String(v || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const key = a => [a.line ?? a.address, a.district, a.city].map(norm).join('|');
const clean = a => ({
  name: String(a.name || '').trim().slice(0, 80), phone: String(a.phone || '').trim().slice(0, 30),
  line: String(a.line || '').trim().slice(0, 300), district: String(a.district || '').trim().slice(0, 60),
  city: String(a.city || '').trim().slice(0, 60), zip: String(a.zip || '').trim().slice(0, 10)
});
// Kargoya verilmiş / kapanmış sipariş değiştirilemez
function locked(o) {
  if (['kargoda', 'tamamlandı', 'iptal', 'iade'].includes(o.status)) return true;
  if (o.production === 'kargo') return true;
  const c = o.cargo || {};
  return !!(c.trackingCode || c.trackingNo || c.trackingNumber || c.shippedAt);
}

export async function addrUpdate(req, res) {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Giriş gerekli' });
    const { db, auth } = fb();
    let u; try { u = await auth.verifyIdToken(m[1]); } catch (e) { return res.status(401).json({ error: 'Oturum doğrulanamadı' }); }
    const b = bodyOf(req);
    const oldA = clean(b.old || {}), newA = clean(b.new || {});
    if (!oldA.line || !newA.line || !newA.district || !newA.city || !newA.name) return res.status(400).json({ error: 'Adres eksik' });
    const oldKey = key(oldA);

    const mail = String(u.email || '').toLowerCase();
    const snaps = [await db.collection('orders').where('userId', '==', u.uid).get()];
    if (mail) snaps.push(await db.collection('orders').where('userEmail', '==', mail).get());
    const seen = new Set(), hits = [];
    snaps.forEach(s => s.docs.forEach(d => {
      if (seen.has(d.id)) return; seen.add(d.id);
      const o = d.data();
      if (!o.address || locked(o)) return;
      if (key(o.address) !== oldKey) return;
      hits.push({ id: d.id, ref: d.ref, o });
    }));

    const list = hits.map(h => h.o.orderCode || h.id.slice(-6).toUpperCase());
    if (b.mode !== 'apply') return res.json({ ok: true, count: hits.length, orders: list });

    const now = new Date();
    await Promise.all(hits.map(h => db.runTransaction(async tx => {
      const s = await tx.get(h.ref); if (!s.exists) return;
      const o = s.data(); if (locked(o) || !o.address || key(o.address) !== oldKey) return;
      const prev = { name: o.address.name || '', phone: o.address.phone || '', address: o.address.address || '', district: o.address.district || '', city: o.address.city || '', zip: o.address.zip || '' };
      tx.update(h.ref, {
        'address.name': newA.name, 'address.phone': newA.phone || prev.phone, 'address.address': newA.line,
        'address.district': newA.district, 'address.city': newA.city, 'address.zip': newA.zip,
        addressChanged: { at: now, by: 'müşteri', old: prev },
        addressHistory: [...(Array.isArray(o.addressHistory) ? o.addressHistory : []).slice(-9), { at: now, old: prev }]
      });
    })));
    return res.json({ ok: true, count: hits.length, orders: list });
  } catch (e) {
    console.error('addr', e);
    return res.status(500).json({ error: 'Adres güncellenemedi' });
  }
}
