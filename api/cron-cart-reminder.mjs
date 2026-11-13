// Vercel Cron (günlük): 24 saattir bekleyen sepetler için TEK hatırlatma e-postası gönderir.
// Gerekli ortam değişkenleri: CRON_SECRET, RESEND_API_KEY, FROM_EMAIL (EMAIL_FROM de olur) (örn. "RetroPatch <siparis@alanadiniz.com>"), SITE_URL
import { fb } from './_fb.mjs';
import { cronAuthorized } from './cron-cleanup.mjs';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET tanımlı değil' });
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Yetkisiz' });
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM || process.env.FROM_EMAIL;
  if (!key || !from) return res.status(500).json({ error: 'RESEND_API_KEY / FROM_EMAIL tanımlı değil' });
  const site = (process.env.SITE_URL || 'https://retropatch.vercel.app').replace(/\/+$/, '');
  try {
    const { db } = fb();
    const now = Date.now();
    const snap = await db.collection('abandoned_carts').where('updatedAt', '<', new Date(now - 24 * 3600 * 1000)).limit(200).get();
    let sent = 0, skipped = 0;
    for (const d of snap.docs) {
      const c = d.data(), updated = c.updatedAt.toDate().getTime();
      if (now - updated > 7 * 24 * 3600 * 1000) { await d.ref.delete(); continue; }   // çok eski
      if (c.reminded || !c.email || !(c.items || []).length) { skipped++; continue; }
      // Bu sepetten sonra sipariş verildiyse hatırlatma gönderme
      const os = await db.collection('orders').where('userId', '==', d.id).get();
      const ds = await db.collection('digital_orders').where('userId', '==', d.id).get();
      const ordered = [...os.docs, ...ds.docs].some(o => { const t = o.data().createdAt; return t && t.toDate && t.toDate().getTime() > updated; });
      if (ordered) { await d.ref.delete(); skipped++; continue; }
      const rows = c.items.slice(0, 8).map(i => `<tr><td style="padding:6px 0;">${esc(i.name)} × ${esc(i.qty || 1)}</td><td style="padding:6px 0;text-align:right;">₺${esc(((i.price || 0) * (i.qty || 1)).toLocaleString('tr-TR'))}</td></tr>`).join('');
      const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222">
        <h2 style="color:#b8934a">Sepetinizde ürünler sizi bekliyor 🛒</h2>
        <p>Merhaba ${esc(c.name || '')}, sepetinizi yarım bıraktığınızı fark ettik:</p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd;border-bottom:1px solid #ddd">${rows}</table>
        <p style="font-size:18px"><b>Toplam: ₺${esc((c.total || 0).toLocaleString('tr-TR'))}</b></p>
        <p><a href="${site}/sepet.html" style="background:#c8a96e;color:#000;padding:12px 22px;text-decoration:none;font-weight:bold">SEPETİME DÖN</a></p>
        <p style="font-size:11px;color:#888">Bu e-postayı RetroPatch hesabınızda sepette ürün bıraktığınız için aldınız. Bir kez gönderilir.</p></div>`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [c.email], subject: 'Sepetinizde ürünler sizi bekliyor', html })
      });
      if (r.ok) { await d.ref.update({ reminded: true, remindedAt: new Date() }); sent++; }
      else console.warn('[cart-reminder] Resend', r.status, await r.text().catch(() => ''));
    }
    res.status(200).json({ sent, skipped });
  } catch (e) { console.error('[cron-cart-reminder]', e); res.status(500).json({ error: 'Sunucu hatası' }); }
}
