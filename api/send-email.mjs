// api/send-email.js — RetroPatch Email API (Resend)
// Vercel Serverless Function — repo'nun /api/ klasörüne koy

const ADMIN_EMAILS = ['retropatchyama@gmail.com', 'admin@retropatch.com'];
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fbx = async () => (await import('./_fb.mjs')).fb();
async function adminOk(req) {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return false;
    const u = await (await fbx()).auth.verifyIdToken(m[1]);
    return ADMIN_EMAILS.includes(u.email);
  } catch (e) { return false; }
}
// Sipariş onay e-postası: istemcinin gönderdiği içerik KULLANILMAZ. Sipariş koduyla gerçek kayıt bulunur,
// içerik ve alıcı o kayıttan alınır; her sipariş için yalnızca bir kez, yalnızca yeni siparişlerde gönderilir.
async function loadOrderForConfirm(code) {
  const { db } = await fbx();
  const s = await db.collection('orders').where('orderCode', '==', code).limit(1).get();
  if (s.empty) return { err: [404, 'Sipariş bulunamadı'] };
  const doc = s.docs[0], o = doc.data();
  const t = o.createdAt && o.createdAt.toMillis ? o.createdAt.toMillis() : 0;
  if (!t || Date.now() - t > 3 * 3600e3) return { err: [409, 'Sipariş e-posta süresi geçti'] };
  if (o.emailSent && o.emailSent.confirmed) return { err: [200, 'Zaten gönderildi'] };
  const p = o.payment || {};
  if (p.method === 'card' && p.status !== 'paid') return { err: [200, 'Ödeme bekleniyor'] };
  // tek seferlik: önce işaretle (yarış durumunda ikinci istek gönderemesin)
  const ok = await db.runTransaction(async tx => {
    const cur = await tx.get(doc.ref), d = cur.data() || {};
    if (d.emailSent && d.emailSent.confirmed) return false;
    tx.update(doc.ref, { 'emailSent.confirmed': true });
    return true;
  });
  if (!ok) return { err: [200, 'Zaten gönderildi'] };
  const a = o.address || {};
  const isForm = o.orderSource === 'form';
  return { data: {
    orderCode: o.orderCode,
    customerName: o.userName || o.name || a.name || 'Müşteri',
    customerEmail: o.userEmail || o.email || '',
    customerPhone: a.phone || o.phone || '',
    items: (o.items || []).map(i => ({ name: i.name, qty: i.qty || 1, price: isForm ? '—' : (Number(i.price) || 0) * (i.qty || 1) })),
    total: isForm ? '—' : (o.total || 0),
    address: isForm ? '—' : [a.name, a.phone, a.address, a.district, a.city].filter(Boolean).join(', '),
    paymentMethod: isForm ? 'Belirtilmedi' : p.method === 'havale' ? 'Havale/EFT' : p.method === 'kapida' ? 'Kapıda Ödeme' : p.method === 'card' ? 'Kredi/Banka Kartı (ödendi)' : 'Online Ödeme',
    whatsapp: '905375295290'
  } };
}

const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const ADMIN_EMAIL     = process.env.ADMIN_EMAIL || 'admin@retropatch.com';
const FROM_EMAIL      = process.env.FROM_EMAIL  || 'onboarding@resend.dev';
const ALLOWED_ORIGIN  = process.env.ALLOWED_ORIGIN || 'https://retropatch.vercel.app';

// ── Rate limiter (IP başına dakikada maks 5 istek) ──────────
const rateLimitMap = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

// ── Yardımcı doğrulama fonksiyonları ────────────────────────
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidPhone(phone) {
  return typeof phone === 'string' && /^[\d\s\+\-\.\(\)]{7,20}$/.test(phone);
}

function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

// ── İzin verilen type'lar ────────────────────────────────────
const ALLOWED_TYPES = ['order_confirmed', 'cargo_updated', 'order_completed', 'proof_ready'];

export default async function handler(req, res) {
  // CORS — sadece kendi domain
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Origin kontrolü
  const origin = req.headers.origin || '';
  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'Yetkisiz kaynak' });
  }

  // Rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const isAdm = req.headers.authorization ? await adminOk(req) : false;
  if (!isAdm && isRateLimited(ip)) {
    return res.status(429).json({ error: 'Çok fazla istek, lütfen bekleyin' });
  }

  const { type, data } = req.body || {};

  // Type doğrulama
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Geçersiz veya eksik type' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data alanı zorunlu' });
  }

  if (type === 'order_confirmed') {
    const code = String(data.orderCode || '').trim().toUpperCase();
    if (!/^RP-[A-Z0-9]{4,16}$/.test(code)) return res.status(400).json({ error: 'Geçersiz sipariş kodu' });
    let r;
    try { r = await loadOrderForConfirm(code); }
    catch (e) { console.error('[send-email] sipariş okunamadı', e); return res.status(500).json({ error: 'Sipariş doğrulanamadı' }); }
    if (r.err) return res.status(r.err[0]).json(r.err[0] === 200 ? { ok: true, skipped: r.err[1] } : { error: r.err[1] });
    Object.keys(data).forEach(k => delete data[k]);
    Object.assign(data, r.data);
  } else if (!isAdm) {
    return res.status(401).json({ error: 'Yetkisiz' });
  }

  // Zorunlu alan doğrulamaları
  if (!sanitize(data.orderCode)) {
    return res.status(400).json({ error: 'orderCode zorunlu' });
  }
  if (!sanitize(data.customerName)) {
    return res.status(400).json({ error: 'customerName zorunlu' });
  }
  if (data.customerEmail && !isValidEmail(data.customerEmail)) {
    return res.status(400).json({ error: 'Geçersiz customerEmail' });
  }
  if (data.customerPhone && !isValidPhone(data.customerPhone)) {
    return res.status(400).json({ error: 'Geçersiz customerPhone' });
  }

  // Alanları temizle
  data.orderCode    = sanitize(data.orderCode, 50);
  data.customerName = sanitize(data.customerName, 100);
  data.customerEmail = data.customerEmail ? sanitize(data.customerEmail, 254) : '';
  data.customerPhone = data.customerPhone ? sanitize(data.customerPhone, 20) : '';
  data.address      = sanitize(data.address, 500);
  data.paymentMethod = sanitize(data.paymentMethod, 100);
  data.total        = sanitize(String(data.total || ''), 20);
  data.cargoCompany = sanitize(String(data.cargoCompany || ''), 80);
  data.trackingCode = sanitize(String(data.trackingCode || ''), 80);
  data.proofUrl = /^https:\/\/[^\s"'<>]+$/.test(String(data.proofUrl || '')) ? String(data.proofUrl).slice(0, 500) : '';
  data.proofNote = sanitize(String(data.proofNote || ''), 600);
  data.trackingUrl  = /^https:\/\/[^\s"'<>]+$/.test(String(data.trackingUrl || '')) ? String(data.trackingUrl).slice(0, 500) : '';
  // HTML'e giren her alan kaçışlanır (e-postaya kod/bağlantı enjekte edilemesin)
  const rawAddr = data.address, subj = { code: data.orderCode, name: data.customerName.replace(/[\r\n]/g, ' ') }, toEmail = data.customerEmail;
  ['orderCode', 'customerName', 'customerPhone', 'paymentMethod', 'total', 'cargoCompany', 'trackingCode'].forEach(k => { data[k] = esc(data[k]); });
  data.address = esc(rawAddr);
  data.trackingUrl = esc(data.trackingUrl);
  data.proofUrl = esc(data.proofUrl); data.proofNote = esc(data.proofNote).replace(/\n/g, '<br>');
  data.items = (Array.isArray(data.items) ? data.items : []).slice(0, 50).map(i => ({ name: esc(sanitize(String((i && i.name) || ''), 150)), qty: esc(parseInt(i && i.qty, 10) || 1), price: esc(sanitize(String((i && i.price) ?? ''), 20)) }));
  data.whatsapp = '905375295290';
  data.customerEmail = esc(toEmail);

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
        to: toEmail,
        subject: `✅ Siparişiniz Alındı — #${subj.code}`,
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
    <p>Sorularınız için: <a href="https://wa.me/${(data.whatsapp||'05375295290').replace(/\D/g,'').replace(/^0/,'90')}">WhatsApp</a></p>
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
      subject: `🛒 YENİ SİPARİŞ — #${subj.code} — ${subj.name}`,
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
        to: toEmail,
        subject: `📦 Siparişiniz Kargoda — #${subj.code}`,
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
    <p>Sorularınız için: <a href="https://wa.me/${(data.whatsapp||'05375295290').replace(/\D/g,'').replace(/^0/,'90')}">WhatsApp</a></p>
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
        to: toEmail,
        subject: `✅ Siparişiniz Teslim Edildi — #${subj.code}`,
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
    <p>Sorularınız için: <a href="https://wa.me/${(data.whatsapp||'05375295290').replace(/\D/g,'').replace(/^0/,'90')}">WhatsApp</a></p>
    <p style="margin-top:8px;"><a href="https://retropatch.vercel.app">retropatch.vercel.app</a></p>
  </div>
</div>
</body></html>`
      });
    }
  }

  else if (type === 'proof_ready') {
    if (data.customerEmail) {
      emails.push({
        from: FROM_EMAIL,
        to: toEmail,
        subject: `🎨 Tasarımınız onayınızı bekliyor — #${subj.code}`,
        html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;background:#111;border:1px solid #2a2a2a;">
  <div style="background:#0a0a0a;padding:32px 40px;border-bottom:2px solid #c8a96e;text-align:center;font-size:28px;font-weight:900;letter-spacing:4px;color:#c8a96e;">RETRO<span style="color:#e8e8e8;">PATCH</span></div>
  <div style="padding:36px 40px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#e8e8e8;margin-bottom:8px;">TASARIMINIZ HAZIR 🎨</div>
    <div style="font-size:14px;color:#888;margin-bottom:24px;line-height:1.6;">Merhaba <strong style="color:#e8e8e8;">${data.customerName}</strong>, <strong style="color:#c8a96e;">#${data.orderCode}</strong> siparişiniz için tasarım önizlemesi hazırlandı. Onayınızdan sonra üretime başlayacağız.</div>
    ${data.proofUrl ? `<img src="${data.proofUrl}" alt="Tasarım önizlemesi" style="max-width:100%;max-height:360px;border:1px solid #2a2a2a;margin-bottom:20px;">` : ''}
    ${data.proofNote ? `<div style="background:#1a1a1a;border:1px solid #2a2a2a;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#ccc;text-align:left;line-height:1.6;">${data.proofNote}</div>` : ''}
    <a href="https://retropatch.vercel.app/hesap.html#onay" style="display:inline-block;background:#c8a96e;color:#000;padding:13px 32px;font-weight:700;font-size:13px;letter-spacing:2px;text-decoration:none;">TASARIMI İNCELE VE ONAYLA</a>
    <div style="font-size:12px;color:#666;margin-top:16px;">Değişiklik isterseniz aynı sayfadan notunuzu yazabilirsiniz.</div>
  </div>
</div></body></html>`
      });
    }
  }

  else {
    return res.status(400).json({ error: 'Bilinmeyen type' });
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
    return res.status(200).json({ ok: true, sent: results.length });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: 'E-posta gönderilemedi' });
  }
}
