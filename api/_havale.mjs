// api/_havale.mjs — Havale/EFT ödemesi 1 saat içinde onaylanmayan siparişler için hatırlatma.
// Müşteriye bir kez e-posta (tutar + IBAN + açıklama kodu), yöneticiye toplu bilgi. Sipariş iptal EDİLMEZ.
// Tetikleyici: GET /api/track?havale=1 (saatlik GitHub Actions) ve günlük cron. İşlem tekrarlansa da her siparişe bir kez gider.
import { fb } from './_fb.mjs';

const WAIT_MS = 60 * 60 * 1000;          // 1 saat
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;  // 7 günden eski siparişlere hatırlatma gönderme
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = v => '₺' + (Math.round(Number(v) * 100) / 100).toLocaleString('tr-TR');
let lastRun = 0;

async function send(to, subject, html) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'RetroPatch <onboarding@resend.dev>';
  if (!key || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ from, to, subject, html }) });
    return r.ok;
  } catch (e) { return false; }
}

function customerMail(o, bank) {
  const rows = [['Ödenecek tutar', `<b style="color:#c8a96e;font-size:18px">${tl(o.total)}</b>`], ['Açıklamaya yazın', `<b>${esc(o.code)}</b>`]];
  if (bank && bank.iban) {
    if (bank.adi) rows.push(['Banka', esc(bank.adi)]);
    if (bank.hesapSahibi) rows.push(['Alıcı', esc(bank.hesapSahibi)]);
    rows.push(['IBAN', `<span style="font-family:monospace;font-size:14px">${esc(bank.iban)}</span>`]);
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#0a0a0a;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a">
  <div style="padding:26px 32px;border-bottom:2px solid #c8a96e;text-align:center;font-size:26px;font-weight:900;letter-spacing:4px;color:#c8a96e">RETRO<span style="color:#e8e8e8">PATCH</span></div>
  <div style="padding:28px 32px;color:#ccc;font-size:14px;line-height:1.7">
    <div style="font-size:20px;font-weight:700;color:#e8e8e8;margin-bottom:6px">Ödemeniz bekleniyor ⏳</div>
    Merhaba <b style="color:#e8e8e8">${esc(o.name || 'değerli müşterimiz')}</b>, <b style="color:#c8a96e">${esc(o.code)}</b> siparişiniz için havale/EFT ödemenizi henüz göremedik. Ödemeyi yaptıysanız bu e-postayı dikkate almayın; banka işlemleri bazen gecikebilir.
    <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#1a1a1a;border:1px solid #2a2a2a">${rows.map(r => `<tr><td style="padding:10px 14px;color:#888;font-size:12px;border-bottom:1px solid #2a2a2a">${r[0]}</td><td style="padding:10px 14px;text-align:right;border-bottom:1px solid #2a2a2a;color:#e8e8e8">${r[1]}</td></tr>`).join('')}</table>
    ${bank && bank.iban ? '' : '<p>IBAN bilgisi için WhatsApp’tan bize yazabilirsiniz.</p>'}
    <div style="text-align:center;margin-top:8px"><a href="https://retropatch.vercel.app/hesap.html#orders" style="display:inline-block;background:#c8a96e;color:#000;padding:12px 26px;font-weight:700;letter-spacing:2px;text-decoration:none;font-size:13px">SİPARİŞİMİ GÖR</a>
    &nbsp;<a href="https://wa.me/905375295290" style="display:inline-block;border:1px solid #25d366;color:#25d366;padding:11px 20px;font-weight:700;letter-spacing:1px;text-decoration:none;font-size:13px">WHATSAPP</a></div>
  </div></div></body></html>`;
}

function waCell(x, bank) {
  const ph = String(x.phone || '').replace(/\D/g, '');
  if (ph.length < 10) return esc(x.phone || '—');
  const num = ph.startsWith('90') && ph.length === 12 ? ph : ph.startsWith('0') ? '9' + ph : ph.length === 10 ? '90' + ph : ph;
  const msg = `Merhaba${x.name ? ' ' + x.name : ''}, RetroPatch'ten yazıyorum. ${x.code} numaralı siparişinizin ödemesi henüz bize ulaşmadı.\n\nTutar: ${tl(x.total)}\n${bank && bank.iban ? 'IBAN: ' + bank.iban + '\n' : ''}${bank && bank.hesapSahibi ? 'Alıcı: ' + bank.hesapSahibi + '\n' : ''}Açıklamaya: ${x.code}\n\nÖdemeyi yaptıysanız dekontu buraya gönderebilirsiniz. Teşekkürler!`;
  return `${esc(x.phone)} <a href="https://wa.me/${num}?text=${encodeURIComponent(msg)}" style="background:#25d366;color:#000;padding:2px 8px;text-decoration:none;font-weight:bold">WhatsApp'tan hatırlat</a>`;
}

export async function havaleRemind(db, opts = {}) {
  if (!opts.force && Date.now() - lastRun < 5 * 60 * 1000) return { skipped: 'too-soon' };
  lastRun = Date.now();
  const now = Date.now(), due = [];
  const add = (col, d) => {
    const o = d.data(), t = o.createdAt && o.createdAt.toMillis ? o.createdAt.toMillis() : 0;
    if (!t || now - t < WAIT_MS || now - t > MAX_AGE_MS || o.payReminder || !(Number(o.total) > 0)) return;
    if (['iptal', 'iade', 'tamamlandı'].includes(o.status)) return;
    due.push({ ref: d.ref, col, code: o.orderCode || o.code || d.id.slice(-6).toUpperCase(), email: o.userEmail || o.email || '', name: o.userName || o.name || (o.address && o.address.name) || '', total: o.total, phone: (o.address && o.address.phone) || o.phone || '', at: t });
  };
  (await db.collection('orders').where('payment.status', '==', 'awaiting_transfer').get()).docs.forEach(d => add('orders', d));
  (await db.collection('digital_orders').where('status', '==', 'bekliyor').get()).docs.forEach(d => { const o = d.data(); if (!o.payment || o.payment.method === 'havale') add('digital_orders', d); });
  if (!due.length) return { reminded: 0 };
  let bank = null; try { const b = await db.collection('settings').doc('bank').get(); bank = b.exists ? b.data() : null; } catch (e) {}
  const out = [];
  for (const o of due) {
    // önce işaretle (aynı anda iki çağrı gelirse ikinci göndermesin)
    const claimed = await db.runTransaction(async tx => { const s = await tx.get(o.ref); if (!s.exists || s.data().payReminder) return false; tx.update(o.ref, { payReminder: { at: new Date(), sent: false } }); return true; });
    if (!claimed) continue;
    const ok = o.email ? await send(o.email, `⏳ ${o.code} siparişiniz için ödemeniz bekleniyor`, customerMail(o, bank)) : false;
    await o.ref.update({ 'payReminder.sent': ok, 'payReminder.to': o.email ? 'email' : 'yok' });
    out.push({ ...o, ok });
  }
  if (out.length && process.env.ADMIN_EMAIL) {
    await send(process.env.ADMIN_EMAIL, `⏳ ${out.length} havale siparişi 1 saattir ödeme bekliyor`,
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6"><p>Aşağıdaki siparişlerin havale ödemesi 1 saat içinde onaylanmadı. Müşterilere hatırlatma e-postası ${out.every(x => x.ok) ? 'gönderildi' : 'gönderilmeye çalışıldı'}. Ödeme hesabınıza geldiyse admin panelinden siparişi “ödendi” olarak işaretleyin.</p>
      <table style="border-collapse:collapse;font-size:13px">${out.map(x => `<tr><td style="padding:4px 10px 4px 0"><b>${esc(x.code)}</b></td><td style="padding:4px 10px">${esc(x.name)}</td><td style="padding:4px 10px">${tl(x.total)}</td><td style="padding:4px 10px">${waCell(x, bank)}</td><td style="padding:4px 0;color:${x.ok ? '#2a9d8f' : '#e63946'}">${x.ok ? 'hatırlatıldı' : (x.email ? 'e-posta gitmedi' : 'e-postası yok')}</td></tr>`).join('')}</table>
      <p><a href="https://retropatch.vercel.app/admin.html">Admin paneline git →</a></p></div>`);
  }
  return { reminded: out.length, emailed: out.filter(x => x.ok).length };
}

export async function havaleApi(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try { res.status(200).json(await havaleRemind(fb().db)); }
  catch (e) { console.error('[havale]', e); res.status(500).json({ error: 'Sunucu hatası' }); }
}
