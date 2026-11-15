// Vercel Cron (her Pazartesi 09:00 TR): geçen haftanın sipariş özetini yöneticiye e-postalar.
// Ortam değişkenleri: CRON_SECRET, RESEND_API_KEY, EMAIL_FROM (veya FROM_EMAIL), ADMIN_EMAIL (özetin gideceği adres), SITE_URL
import { fb } from './_fb.mjs';
import { cronAuthorized } from './cron-cleanup.mjs';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = n => '₺' + Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET tanımlı değil' });
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Yetkisiz' });
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM || process.env.FROM_EMAIL;
  const to = process.env.ADMIN_EMAIL;
  if (!key || !from || !to) return res.status(500).json({ error: 'RESEND_API_KEY / EMAIL_FROM / ADMIN_EMAIL tanımlı değil' });
  const site = (process.env.SITE_URL || 'https://retropatch.vercel.app').replace(/\/+$/, '');
  try {
    const { db } = fb();
    const now = Date.now(), week = 7 * 24 * 3600 * 1000;
    const since = new Date(now - week), prev = new Date(now - 2 * week);
    const load = async col => (await db.collection(col).where('createdAt', '>=', prev).get()).docs.map(d => d.data());
    const [phys, dig] = await Promise.all([load('orders'), load('digital_orders')]);
    const ts = o => (o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().getTime() : 0);
    const valid = o => o.status !== 'iptal' && o.status !== 'cancelled' && !(o.payment && o.payment.status === 'awaiting_card');
    const thisW = a => a.filter(o => ts(o) >= since.getTime() && valid(o));
    const lastW = a => a.filter(o => ts(o) < since.getTime() && valid(o));
    const sum = a => a.reduce((t, o) => t + (Number(o.total) || 0), 0);
    const p1 = thisW(phys), p0 = lastW(phys), d1 = thisW(dig).filter(o => o.status === 'onaylandı'), d0 = lastW(dig).filter(o => o.status === 'onaylandı');
    const cnt = {};
    [...p1, ...d1].forEach(o => (o.items || []).forEach(i => { const n = i.name || '—'; cnt[n] = (cnt[n] || 0) + (Number(i.qty) || 1); }));
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const pending = phys.filter(o => (o.status === 'yeni' || !o.status) && valid(o)).length;
    const delta = (a, b) => b ? ((a - b) / b * 100 >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round((a - b) / b * 100)) + '%' : (a ? '▲ yeni' : '—');
    const total1 = sum(p1) + sum(d1), total0 = sum(p0) + sum(d0);
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222">
      <h2 style="color:#b8934a">RetroPatch · Haftalık Özet</h2>
      <p style="color:#666">${esc(since.toLocaleDateString('tr-TR'))} – ${esc(new Date(now).toLocaleDateString('tr-TR'))}</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Fiziksel sipariş</td><td style="text-align:right"><b>${p1.length}</b> (${delta(p1.length, p0.length)})</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Dijital dosya satışı</td><td style="text-align:right"><b>${d1.length}</b> (${delta(d1.length, d0.length)})</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Toplam ciro</td><td style="text-align:right"><b>${tl(total1)}</b> (${delta(total1, total0)})</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Bekleyen (yeni) sipariş</td><td style="text-align:right"><b>${pending}</b></td></tr>
      </table>
      <h3 style="margin-top:20px">En çok satanlar</h3>
      ${top.length ? '<ol>' + top.map(([n, q]) => `<li>${esc(n)} — ${q} adet</li>`).join('') + '</ol>' : '<p style="color:#888">Bu hafta satış yok.</p>'}
      <p><a href="${site}/admin.html" style="background:#c8a96e;color:#000;padding:12px 22px;text-decoration:none;font-weight:bold">ADMİN PANELİ</a></p>
      <p style="font-size:11px;color:#888">Her Pazartesi otomatik gönderilir. İptal edilen ve kart ödemesi bekleyen siparişler sayılmaz.</p></div>`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'RetroPatch haftalık özet: ' + p1.length + ' sipariş, ' + tl(total1), html })
    });
    if (!r.ok) { console.warn('[weekly]', r.status, await r.text().catch(() => '')); return res.status(502).json({ error: 'E-posta gönderilemedi' }); }
    res.status(200).json({ ok: true, orders: p1.length, digital: d1.length, revenue: total1 });
  } catch (e) { console.error('[cron-weekly-summary]', e); res.status(500).json({ error: 'Sunucu hatası' }); }
}
