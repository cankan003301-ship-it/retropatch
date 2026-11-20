// api/_proof.mjs — Tasarım onayı: müşteri, admin'in gönderdiği tasarım önizlemesini onaylar ya da değişiklik ister.
// POST /api/track?proof=1   Authorization: Bearer <Firebase ID token>   { orderId, action: 'approve' | 'revise', note }
// Yalnızca siparişin sahibi (userId ya da sipariş e-postası) cevap verebilir; yalnızca "pending" durumdaki önizlemeye.
import { fb } from './_fb.mjs';
import { bodyOf } from './_http.mjs';

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function proofAnswer(req, res) {
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Giriş gerekli' });
    const { db, auth } = fb();
    let u; try { u = await auth.verifyIdToken(m[1]); } catch (e) { return res.status(401).json({ error: 'Oturum doğrulanamadı' }); }
    const b = bodyOf(req);
    const orderId = String(b.orderId || ''), action = b.action, note = String(b.note || '').trim().slice(0, 1000);
    if (!/^[A-Za-z0-9]{10,40}$/.test(orderId)) return res.status(400).json({ error: 'Geçersiz sipariş' });
    if (!['approve', 'revise'].includes(action)) return res.status(400).json({ error: 'Geçersiz işlem' });
    if (action === 'revise' && note.length < 3) return res.status(400).json({ error: 'Lütfen ne değişmesini istediğinizi yazın' });

    const ref = db.collection('orders').doc(orderId);
    const result = await db.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists) return { err: [404, 'Sipariş bulunamadı'] };
      const o = s.data(), mail = String(u.email || '').toLowerCase();
      const owner = o.userId === u.uid || (mail && [o.userEmail, o.email].some(x => String(x || '').toLowerCase() === mail));
      if (!owner) return { err: [403, 'Bu sipariş size ait değil'] };
      const p = o.proof || {};
      if (p.status !== 'pending') return { err: [409, 'Bu tasarım için zaten cevap verilmiş'] };
      const now = new Date();
      const upd = {
        'proof.status': action === 'approve' ? 'approved' : 'revision',
        'proof.customerNote': note, 'proof.answeredAt': now,
        proofHistory: [...(Array.isArray(o.proofHistory) ? o.proofHistory : []).slice(-19), { round: p.round || 1, url: p.url || '', adminNote: p.note || '', status: action === 'approve' ? 'approved' : 'revision', customerNote: note, at: now }],
        production: action === 'approve' ? 'uretim' : 'inceleme', productionAt: now
      };
      if (action === 'approve' && ['yeni', 'hazırlanıyor', '', undefined].includes(o.status)) upd.status = 'üretimde';
      tx.update(ref, upd);
      return { o };
    });
    if (result.err) return res.status(result.err[0]).json({ error: result.err[1] });

    // Admin'e haber ver (e-posta ayarlıysa; başarısızlık cevabı etkilemez)
    try {
      const key = process.env.RESEND_API_KEY, to = process.env.ADMIN_EMAIL;
      if (key && to) {
        const o = result.o, ok = action === 'approve';
        await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6000),
          body: JSON.stringify({
            from: process.env.FROM_EMAIL || 'onboarding@resend.dev', to,
            subject: (ok ? '✅ Tasarım ONAYLANDI — #' : '✏️ Tasarımda DEĞİŞİKLİK istendi — #') + (o.orderCode || orderId),
            html: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">' +
              '<b>' + esc(o.orderCode || orderId) + '</b> — ' + esc(o.userName || o.name || (o.address && o.address.name) || '') + '<br>' +
              (ok ? 'Müşteri tasarımı onayladı. Sipariş "Üretime alındı" aşamasına geçti.' : 'Müşteri değişiklik istedi:') +
              (note ? '<blockquote style="border-left:3px solid #c8a96e;margin:10px 0;padding:6px 12px;background:#f6f1e7">' + esc(note).replace(/\n/g, '<br>') + '</blockquote>' : '') +
              '<a href="https://retropatch.vercel.app/admin.html">Admin paneline git →</a></div>'
          })
        });
      }
    } catch (e) { console.warn('[proof] admin e-postası', e.message); }

    res.status(200).json({ ok: true, status: action === 'approve' ? 'approved' : 'revision' });
  } catch (e) { console.error('[proof]', e); res.status(500).json({ error: 'Sunucu hatası' }); }
}
