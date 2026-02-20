// api/send-email.js — RetroPatch Email API (Resend)
// Vercel Serverless Function — repo'nun /api/ klasörüne koy

const RESEND_API_KEY = process.env.RESEND_API_KEY; // Vercel env variable
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || 'retropatchyama@gmail.com';
const FROM_EMAIL     = process.env.FROM_EMAIL  || 'onboarding@resend.dev';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, data } = req.body || {};
  if (!type || !data) return res.status(400).json({ error: 'type ve data zorunlu' });

  let emails = [];

  // ─────────────────────────────────────────────
  // 1. MÜŞTERİ — SİPARİŞ ONAY MAILI
  // ─────────────────────────────────────────────
  if (type === 'order_confirmed') {
    const itemsHtml = (data.items || []).map(i =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #222;">${i.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:center;">${i.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #222;text-align:right;color:#c8a96e;font-weight:700;">₺${i.price}</td>
      </tr>`
    ).join('');

    // Müşteri maili
    if (data.customerEmail) {
      emails.push({
        from: FROM_EMAIL,
        to: data.customerEmail,
        subject: `✅ Siparişiniz Alındı — #${data.orderCode}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:580px;margin:0 auto;background:#111;border:1px solid #2a2a2a;}
  .header{background:#0a0a0a;padding:32px 40px;border-bottom:2px solid #c8a96e;text-align:center;}
  .logo{font-size:28px;font-weight:900;letter-spacing:4px;color:#c8a96e;}
  .logo span{color:#e8e8e8;}
  .body{padding:40px;}
  .title{font-size:22px;font-weight:700;color:#e8e8e8;margin-bottom:8px;letter-spacing:1px;}
  .sub{font-size:14px;color:#888;margin-bottom:32px;line-height:1.6;}
  .order-code{background:#1a1a1a;border:1px solid #2a2a2a;padding:16px 24px;text-align:center;margin-bottom:32px;}
  .oc-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:6px;}
  .oc-val{font-size:28px;font-weight:900;letter-spacing:4px;color:#c8a96e;}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;}
  thead th{background:#1a1a1a;padding:10px 12px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;text-align:left;border-bottom:1px solid #2a2a2a;}
  .total-row td{padding:12px;font-size:16px;font-weight:700;color:#c8a96e;border-top:2px solid #c8a96e;}
  .info-row{display:flex;gap:0;margin-bottom:24px;}
  .info-box{flex:1;background:#1a1a1a;border:1px solid #2a2a2a;padding:16px;}
  .info-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:6px;}
  .info-val{font-size:13px;color:#e8e8e8;line-height:1.5;}
  .footer{background:#0a0a0a;padding:24px 40px;text-align:center;border-top:1px solid #2a2a2a;}
  .footer p{font-size:11px;color:#555;margin:4px 0;}
  .footer a{color:#c8a96e;text-decoration:none;}
  .btn{display:inline-block;background:#c8a96e;color:#000;padding:12px 32px;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;margin-top:8px;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">RETRO<span>PATCH</span></div>
  </div>
  <div class="body">
    <div class="title">SİPARİŞİNİZ ALINDI 🎉</div>
    <div class="sub">Merhaba <strong style="color:#e8e8e8;">${data.customerName}</strong>, siparişiniz başarıyla oluşturuldu. En kısa sürede hazırlayıp kargoya vereceğiz.</div>

    <div class="order-code">
      <div class="oc-label">Sipariş Kodunuz</div>
      <div class="oc-val">#${data.orderCode}</div>
    </div>

    <table>
      <thead><tr>
        <th>Ürün</th><th style="text-align:center;">Adet</th><th style="text-align:right;">Fiyat</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot><tr class="total-row">
        <td colspan="2">TOPLAM</td>
        <td style="text-align:right;">₺${data.total}</td>
      </tr></tfoot>
    </table>

    <table style="margin-bottom:32px;">
      <tr>
        <td style="padding:12px;background:#1a1a1a;border:1px solid #2a2a2a;vertical-align:top;width:50%;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:6px;">TESLİMAT ADRESİ</div>
          <div style="font-size:13px;color:#e8e8e8;line-height:1.6;">${(data.address || '—').replace(/\n/g,'<br>')}</div>
        </td>
        <td style="padding:12px;background:#1a1a1a;border:1px solid #2a2a2a;border-left:none;vertical-align:top;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:6px;">ÖDEME YÖNTEMİ</div>
          <div style="font-size:13px;color:#e8e8e8;">${data.paymentMethod || '—'}</div>
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin:12px 0 6px;">TAHMİNİ TESLİMAT</div>
          <div style="font-size:13px;color:#e8e8e8;">5–10 iş günü</div>
        </td>
      </tr>
    </table>

    <div style="text-align:center;">
      <a href="https://retropatch.vercel.app/hesap.html" class="btn">SİPARİŞLERİMİ GÖR</a>
    </div>
  </div>
  <div class="footer">
    <p>Sorularınız için: <a href="https://wa.me/${(data.whatsapp||'905000000000').replace(/\D/g,'')}">WhatsApp</a></p>
    <p style="margin-top:8px;"><a href="https://retropatch.vercel.app">retropatch.vercel.app</a></p>
    <p style="margin-top:12px;color:#333;">© 2025 RetroPatch. Tüm hakları saklıdır.</p>
  </div>
</div>
</body></html>`
      });
    }

    // Admin bildirimi
    emails.push({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🛒 YENİ SİPARİŞ — #${data.orderCode} — ${data.customerName}`,
      html: `
<div style="font-family:monospace;background:#0a0a0a;color:#e8e8e8;padding:32px;max-width:500px;">
  <div style="font-size:20px;color:#c8a96e;font-weight:900;letter-spacing:3px;margin-bottom:24px;">YENİ SİPARİŞ 🛒</div>
  <table style="width:100%;border-collapse:collapse;">
    ${[
      ['Sipariş Kodu', `#${data.orderCode}`],
      ['Müşteri', data.customerName],
      ['E-posta', data.customerEmail],
      ['Telefon', data.customerPhone],
      ['Toplam', `₺${data.total}`],
      ['Ödeme', data.paymentMethod],
      ['Adres', (data.address||'—').replace(/\n/g,' ')],
    ].map(([k,v]) => `<tr>
      <td style="padding:8px 12px;color:#888;font-size:12px;letter-spacing:1px;border-bottom:1px solid #222;white-space:nowrap;">${k}</td>
      <td style="padding:8px 12px;color:#e8e8e8;font-size:13px;border-bottom:1px solid #222;">${v||'—'}</td>
    </tr>`).join('')}
  </table>
  <div style="margin-top:24px;font-size:12px;color:#555;">
    <a href="https://retropatch.vercel.app/admin.html" style="color:#c8a96e;">Admin Panele Git →</a>
  </div>
</div>`
    });
  }

  // ─────────────────────────────────────────────
  // 2. MÜŞTERİ — KARGO BİLDİRİMİ
  // ─────────────────────────────────────────────
  else if (type === 'cargo_updated') {
    if (data.customerEmail) {
      emails.push({
        from: FROM_EMAIL,
        to: data.customerEmail,
        subject: `📦 Siparişiniz Kargoda — #${data.orderCode}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:580px;margin:0 auto;background:#111;border:1px solid #2a2a2a;}
  .header{background:#0a0a0a;padding:32px 40px;border-bottom:2px solid #c8a96e;text-align:center;}
  .logo{font-size:28px;font-weight:900;letter-spacing:4px;color:#c8a96e;}
  .logo span{color:#e8e8e8;}
  .body{padding:40px;}
  .title{font-size:22px;font-weight:700;color:#e8e8e8;margin-bottom:8px;}
  .sub{font-size:14px;color:#888;margin-bottom:32px;line-height:1.6;}
  .track-box{background:#1a1a1a;border:1px solid #2a2a2a;padding:24px;margin-bottom:24px;text-align:center;}
  .track-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:8px;}
  .track-val{font-size:24px;font-weight:900;letter-spacing:3px;color:#c8a96e;margin-bottom:16px;}
  .btn{display:inline-block;background:#c8a96e;color:#000;padding:12px 32px;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;}
  .footer{background:#0a0a0a;padding:24px 40px;text-align:center;border-top:1px solid #2a2a2a;}
  .footer p{font-size:11px;color:#555;margin:4px 0;}
  .footer a{color:#c8a96e;text-decoration:none;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><div class="logo">RETRO<span>PATCH</span></div></div>
  <div class="body">
    <div class="title">SİPARİŞİNİZ YOLDA 🚚</div>
    <div class="sub">Merhaba <strong style="color:#e8e8e8;">${data.customerName}</strong>, siparişiniz kargoya verildi!</div>

    <div style="background:#1a1a1a;border:1px solid #2a2a2a;padding:16px;margin-bottom:16px;">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:4px;">SİPARİŞ KODU</div>
      <div style="font-size:18px;font-weight:900;letter-spacing:2px;color:#c8a96e;">#${data.orderCode}</div>
    </div>

    <div class="track-box">
      <div class="track-label">Kargo Firması</div>
      <div style="font-size:16px;color:#e8e8e8;margin-bottom:16px;">${data.cargoCompany}</div>
      <div class="track-label">Takip Numarası</div>
      <div class="track-val">${data.trackingCode}</div>
      ${data.trackingUrl ? `<a href="${data.trackingUrl}" class="btn">KARGOYU TAKİP ET →</a>` : ''}
    </div>
  </div>
  <div class="footer">
    <p>Sorularınız için: <a href="https://wa.me/${(data.whatsapp||'905000000000').replace(/\D/g,'')}">WhatsApp</a></p>
    <p style="margin-top:8px;"><a href="https://retropatch.vercel.app">retropatch.vercel.app</a></p>
  </div>
</div>
</body></html>`
      });
    }
  }

  // ─────────────────────────────────────────────
  // 3. MÜŞTERİ — SİPARİŞ TAMAMLANDI
  // ─────────────────────────────────────────────
  else if (type === 'order_completed') {
    if (data.customerEmail) {
      emails.push({
        from: FROM_EMAIL,
        to: data.customerEmail,
        subject: `✅ Siparişiniz Teslim Edildi — #${data.orderCode}`,
        html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;}
  .wrap{max-width:580px;margin:0 auto;background:#111;border:1px solid #2a2a2a;}
  .header{background:#0a0a0a;padding:32px 40px;border-bottom:2px solid #c8a96e;text-align:center;}
  .logo{font-size:28px;font-weight:900;letter-spacing:4px;color:#c8a96e;}
  .logo span{color:#e8e8e8;}
  .body{padding:40px;text-align:center;}
  .icon{font-size:56px;margin-bottom:16px;}
  .title{font-size:22px;font-weight:700;color:#e8e8e8;margin-bottom:8px;}
  .sub{font-size:14px;color:#888;margin-bottom:32px;line-height:1.6;}
  .btn{display:inline-block;background:#c8a96e;color:#000;padding:12px 32px;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;margin:6px;}
  .btn-out{display:inline-block;border:1px solid #2a2a2a;color:#e8e8e8;padding:12px 32px;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;margin:6px;}
  .footer{background:#0a0a0a;padding:24px 40px;text-align:center;border-top:1px solid #2a2a2a;}
  .footer p{font-size:11px;color:#555;margin:4px 0;}
  .footer a{color:#c8a96e;text-decoration:none;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><div class="logo">RETRO<span>PATCH</span></div></div>
  <div class="body">
    <div class="icon">🎉</div>
    <div class="title">SİPARİŞİNİZ TESLİM EDİLDİ</div>
    <div class="sub">Merhaba <strong style="color:#e8e8e8;">${data.customerName}</strong>,<br>
    <strong style="color:#c8a96e;">#${data.orderCode}</strong> numaralı siparişiniz teslim edildi.<br>
    Umarız beğenirsiniz! 🏷</div>
    <a href="https://retropatch.vercel.app/urunler.html" class="btn">YENİ ÜRÜNLERE BAK</a>
    <a href="https://retropatch.vercel.app/hesap.html" class="btn-out">SİPARİŞLERİM</a>
  </div>
  <div class="footer">
    <p>Sorularınız için: <a href="https://wa.me/${(data.whatsapp||'905000000000').replace(/\D/g,'')}">WhatsApp</a></p>
    <p style="margin-top:8px;"><a href="https://retropatch.vercel.app">retropatch.vercel.app</a></p>
  </div>
</div>
</body></html>`
      });
    }
  }

  else {
    return res.status(400).json({ error: `Bilinmeyen type: ${type}` });
  }

  // ─────────────────────────────────────────────
  // Resend ile gönder
  // ─────────────────────────────────────────────
  try {
    const results = [];
    for (const email of emails) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(email),
      });
      results.push(await r.json());
      if (emails.length > 1) await new Promise(resolve => setTimeout(resolve, 1200));
    }
    console.log('Emails sent:', results);
    return res.status(200).json({ ok: true, sent: results.length, results });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
