// GET /api/track?code=RP-XXXXXX — sipariş durumunu herkese açık, ADRES/TELEFON/E-POSTA OLMADAN döner.
// (Firestore kuralları artık siparişleri yalnızca sahibine ve admin'e açar.)
import { fb } from './_fb.mjs';
import { clientIp } from './_http.mjs';

const hits = new Map();   // basit IP sınırlayıcı (sunucu örneği başına)
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 20;
}
const iso = ts => { try { return ts && ts.toDate ? ts.toDate().toISOString() : null; } catch { return null; } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });
  if (limited(clientIp(req))) return res.status(429).json({ error: 'Çok fazla deneme, biraz bekleyin' });
  const raw = String(req.query.code || '').trim().toUpperCase();
  if (!/^(RP-)?[A-Z0-9]{4,12}$/.test(raw)) return res.status(400).json({ error: 'Geçersiz kod' });
  try {
    const { db } = fb();
    const codes = [raw, 'RP-' + raw.replace(/^RP-/, '')];
    let doc = null;
    for (const c of [...new Set(codes)]) {
      const s = await db.collection('orders').where('orderCode', '==', c).limit(1).get();
      if (!s.empty) { doc = s.docs[0]; break; }
    }
    if (!doc) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    const o = doc.data(), c = o.cargo || {}, p = o.payment || {};
    res.status(200).json({ order: {
      id: doc.id, orderCode: o.orderCode, createdAt: iso(o.createdAt), status: o.status || 'yeni',
      cargo: { company: c.company || '', companyName: c.companyName || '', trackingCode: c.trackingCode || '', status: c.status || '', price: c.price || 0 },
      payment: { method: p.method || '', status: p.status || '' },
      items: (o.items || []).map(i => ({ id: i.id, name: i.name, qty: i.qty || 1, price: i.price || 0, image: i.image || '' })),
      subtotal: o.subtotal || 0, cargoPrice: o.cargoPrice || 0, discount: o.discount || 0, total: o.total || 0,
      address: { city: (o.address && o.address.city) || '' }
    } });
  } catch (e) { console.error('[track]', e); res.status(500).json({ error: 'Sunucu hatası' }); }
}
