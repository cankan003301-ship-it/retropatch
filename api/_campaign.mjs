// api/_campaign.mjs — Aylık ürün kampanyası (seçili ürünlerde % indirim + slayt), onaylı yayın.
//  • Her ayın 25'inde (günlük cron) gelecek ay için TASLAK hazırlanır, yöneticiye e-posta gider.
//  • Admin "Yayınla" deyince ürün fiyatları düşer (eski fiyat oldPrice'ta saklanır), slayt açılır.
//  • Bitiş günü geçince (günlük cron) fiyatlar eski haline döner, slayt kapanır.
// Uç nokta: POST /api/track?campaign=draft|publish|end|save  (Authorization: Bearer <admin ID token>)
import { fb } from './_fb.mjs';
import { bodyOf } from './_http.mjs';

const ADMIN_EMAILS = ['retropatchyama@gmail.com', 'admin@retropatch.com'];
const MAX_PCT = 10;            // kullanıcı kararı: en fazla %10
const PICK = 10;               // taslakta önerilen ürün sayısı
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const BG = [
  ['https://ik.imagekit.io/qqsmrt6nv/slides/slayt-havale-masaustu_nijJS33ab.jpg', 'https://ik.imagekit.io/qqsmrt6nv/slides/slayt-havale-telefon_3wDnTCGPo.jpg'],
  ['https://ik.imagekit.io/qqsmrt6nv/slides/slayt-ozel-arma-masaustu_xXRG8pT48.jpg', 'https://ik.imagekit.io/qqsmrt6nv/slides/slayt-ozel-arma-telefon_yc8W2lVrK.jpg'],
  ['https://ik.imagekit.io/qqsmrt6nv/slides/slayt-toplu-masaustu_YGLAbuz9o.jpg', 'https://ik.imagekit.io/qqsmrt6nv/slides/slayt-toplu-telefon_JyFrF9SZf.jpg']
];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const trToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);   // Türkiye günü (YYYY-MM-DD)
function monthOf(y, m) {   // m: 1-12
  const mm = String(m).padStart(2, '0'), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { id: `${y}-${mm}`, start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}`, name: AYLAR[m - 1] };
}
function targetMonth() {   // ayın 20'sinden sonra → gelecek ay; önce → bu ay
  const t = trToday(), y = +t.slice(0, 4), m = +t.slice(5, 7), d = +t.slice(8, 10);
  return d >= 20 ? (m === 12 ? monthOf(y + 1, 1) : monthOf(y, m + 1)) : monthOf(y, m);
}

async function mail(subject, html) {
  const key = process.env.RESEND_API_KEY, to = process.env.ADMIN_EMAIL, from = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'onboarding@resend.dev';
  if (!key || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ from, to, subject, html }) });
    return r.ok;
  } catch (e) { return false; }
}

// Ürün seçimi: stokta, görselli, kampanyada olmayan; çok bakılıp az satılanlar öne; geçen kampanyadakiler tekrar edilmez;
// maliyeti girilmiş ürünlerde indirimli fiyat maliyetin en az %20 üstünde kalmalı.
async function pickProducts(db, pct, excludeIds) {
  const [ps, cs] = await Promise.all([db.collection('products').get(), db.collection('payment_secrets').doc('costs').get().catch(() => null)]);
  const costs = (cs && cs.exists && cs.data().c) || {};
  const ex = new Set(excludeIds || []);
  const list = ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.image && p.status !== 'Tükendi' && (Number(p.price) || 0) >= 80 && !p.campaignId && !ex.has(p.id))
    .filter(p => { const c = Number(costs[p.id]); if (!(c > 0)) return true; return Math.round(p.price * (1 - pct / 100)) >= c * 1.2; })
    .map(p => ({ id: p.id, name: p.name, price: Number(p.price), s: (Number(p.views) || 0) + (Number(p.favorites) || 0) * 6 - (Number(p.sales) || 0) * 4 + Math.random() * 3 }))
    .sort((a, b) => b.s - a.s);
  return list.slice(0, PICK);
}

export async function createDraft(db, opts = {}) {
  const M = targetMonth(), ref = db.collection('campaigns').doc(M.id), ex = await ref.get();
  if (ex.exists && !opts.force) return { id: M.id, existed: true, status: ex.data().status };
  if (ex.exists && ex.data().status === 'active') return { id: M.id, existed: true, status: 'active' };
  const prev = await db.collection('campaigns').orderBy('createdAt', 'desc').limit(1).get();
  const prevIds = prev.empty ? [] : (prev.docs[0].data().productIds || []);
  const pct = MAX_PCT, picks = await pickProducts(db, pct, prevIds);
  if (!picks.length) return { id: M.id, error: 'Uygun ürün bulunamadı' };
  const n = +M.id.slice(5, 7), bg = BG[n % BG.length];
  const slide = {
    active: false, campaignId: M.id, image: bg[0], bg: bg[0], imageMobile: bg[1],
    tag: 'AYIN FIRSATI', title: `${M.name.toLocaleUpperCase('tr')} FIRSATI: SEÇİLİ YAMALARDA %${pct}`,
    desc: `${M.name} boyunca seçili ${picks.length} üründe %${pct} indirim. Stoklar sınırlı.`, subtitle: '', name: '',
    btn1Text: 'İndirimli Ürünler', btn1Link: 'urunler.html?indirim=1', btn2Text: '', btn2Link: '', link: 'urunler.html?indirim=1',
    startDate: M.start, endDate: M.end, order: -1000 + n, createdAt: new Date()
  };
  slide.subtitle = slide.name = slide.desc;
  let slideId = ex.exists && ex.data().slideId;
  if (slideId) await db.collection('slides').doc(slideId).set(slide, { merge: true }).catch(() => { slideId = null; });
  if (!slideId) slideId = (await db.collection('slides').add(slide)).id;
  const doc = { status: 'draft', month: M.id, monthName: M.name, pct, startDate: M.start, endDate: M.end, productIds: picks.map(p => p.id), slideId, createdAt: new Date() };
  await ref.set(doc);
  await mail(`🗓 ${M.name} kampanyası taslağı hazır — onayınızı bekliyor`,
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:560px">
     <h2 style="color:#b8934a;margin:0 0 8px">${esc(M.name)} kampanyası (taslak)</h2>
     <p>Seçili <b>${picks.length} üründe %${pct} indirim</b>, ${esc(M.start.split('-').reverse().join('.'))} – ${esc(M.end.split('-').reverse().join('.'))}. Anasayfa slaytı da hazır.</p>
     <table style="border-collapse:collapse;width:100%;font-size:13px">${picks.map(p => `<tr><td style="padding:4px 0;border-bottom:1px solid #eee">${esc(p.name)}</td><td style="text-align:right;border-bottom:1px solid #eee"><s style="color:#999">₺${p.price}</s> → <b>₺${Math.round(p.price * (1 - pct / 100))}</b></td></tr>`).join('')}</table>
     <p>Yayına girmesi için onayınız gerekiyor: <a href="https://retropatch.vercel.app/admin.html">Admin → Kuponlar → Aylık Kampanya</a> bölümünden ürünleri düzenleyip <b>Yayınla</b>'ya basın. Onaylamazsanız hiçbir fiyat değişmez.</p></div>`);
  return { id: M.id, created: true, count: picks.length };
}

export async function publish(db, id) {
  const ref = db.collection('campaigns').doc(id), s = await ref.get();
  if (!s.exists) throw new Error('Kampanya bulunamadı');
  const c = s.data();
  if (c.status !== 'draft') throw new Error('Yalnızca taslak yayınlanabilir');
  const today = trToday();
  if (c.endDate < today) throw new Error('Kampanyanın bitiş tarihi geçmiş');
  const pct = Math.min(MAX_PCT, Math.max(1, Number(c.pct) || MAX_PCT));
  let n = 0;
  for (const pid of c.productIds || []) {
    const pr = db.collection('products').doc(pid);
    await db.runTransaction(async tx => {
      const ps = await tx.get(pr); if (!ps.exists) return;
      const p = ps.data(); if (p.campaignId || !(Number(p.price) > 0)) return;
      const old = Number(p.price), sale = Math.round(old * (1 - pct / 100));
      tx.update(pr, { price: sale, oldPrice: old, campaignId: id, campaignSale: sale });
      n++;
    });
  }
  if (c.slideId) await db.collection('slides').doc(c.slideId).update({ active: true, startDate: c.startDate > today ? c.startDate : today }).catch(() => {});
  await ref.update({ status: 'active', publishedAt: new Date(), applied: n });
  return { published: true, applied: n };
}

export async function endCampaign(db, id, reason) {
  const ref = db.collection('campaigns').doc(id), s = await ref.get();
  if (!s.exists) throw new Error('Kampanya bulunamadı');
  const c = s.data();
  const ps = await db.collection('products').where('campaignId', '==', id).get();
  let n = 0;
  for (const d of ps.docs) {
    await db.runTransaction(async tx => {
      const cur = await tx.get(d.ref); const p = cur.data() || {};
      if (p.campaignId !== id) return;
      const FV = fb().FieldValue;
      // Kampanya sırasında fiyat elle değiştirilmediyse eski fiyata dön; değiştirildiyse yeni fiyat kalsın
      const upd = { oldPrice: FV.delete(), campaignId: FV.delete(), campaignSale: FV.delete() };
      if (Number(p.price) === Number(p.campaignSale) && Number(p.oldPrice) > 0) upd.price = Number(p.oldPrice);
      tx.update(d.ref, upd); n++;
    });
  }
  if (c.slideId) await db.collection('slides').doc(c.slideId).update({ active: false }).catch(() => {});
  await ref.update({ status: c.status === 'draft' ? 'cancelled' : 'ended', endedAt: new Date(), endReason: reason || 'manual', restored: n });
  return { ended: true, restored: n };
}

// Günlük cron: süresi biten kampanyaları kapat, ayın 25'inde gelecek ayın taslağını hazırla
export async function campaignCron(db) {
  const today = trToday(), out = {};
  const act = await db.collection('campaigns').where('status', '==', 'active').get();
  for (const d of act.docs) if (d.data().endDate < today) { await endCampaign(db, d.id, 'auto'); (out.ended = out.ended || []).push(d.id); }
  const drafts = await db.collection('campaigns').where('status', '==', 'draft').get();
  for (const d of drafts.docs) if (d.data().endDate < today) { await endCampaign(db, d.id, 'expired-draft'); (out.expiredDrafts = out.expiredDrafts || []).push(d.id); }
  if (+today.slice(8, 10) === 25) out.draft = await createDraft(db);
  return out;
}

export async function campaignApi(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Giriş gerekli' });
    const { db, auth } = fb();
    let u; try { u = await auth.verifyIdToken(m[1]); } catch (e) { return res.status(401).json({ error: 'Oturum doğrulanamadı' }); }
    if (!ADMIN_EMAILS.includes(u.email)) return res.status(403).json({ error: 'Yetkisiz' });
    const act = String(req.query.campaign), b = bodyOf(req), id = String(b.id || '');
    if (act === 'draft') return res.status(200).json(await createDraft(db, { force: !!b.force }));
    if (act === 'list') {
      const q = await db.collection('campaigns').orderBy('createdAt', 'desc').limit(6).get();
      return res.status(200).json({ list: q.docs.map(d => { const x = d.data(); const t = v => (v && v.toDate ? v.toDate().toISOString() : v || null); return { id: d.id, ...x, createdAt: t(x.createdAt), publishedAt: t(x.publishedAt), endedAt: t(x.endedAt) }; }) });
    }
    if (!/^\d{4}-\d{2}$/.test(id)) return res.status(400).json({ error: 'Geçersiz kampanya' });
    if (act === 'publish') return res.status(200).json(await publish(db, id));
    if (act === 'end') return res.status(200).json(await endCampaign(db, id, 'manual'));
    if (act === 'save') {   // taslakta ürün listesi / oran düzenleme
      const ref = db.collection('campaigns').doc(id), s = await ref.get();
      if (!s.exists || s.data().status !== 'draft') return res.status(409).json({ error: 'Yalnızca taslak düzenlenebilir' });
      const ids = (Array.isArray(b.productIds) ? b.productIds : []).map(String).filter(x => /^[A-Za-z0-9]{10,40}$/.test(x)).slice(0, 60);
      const pct = Math.min(MAX_PCT, Math.max(1, parseInt(b.pct, 10) || MAX_PCT));
      await ref.update({ productIds: ids, pct });
      const c = s.data();
      if (c.slideId) await db.collection('slides').doc(c.slideId).update({ title: `${String(c.monthName || '').toLocaleUpperCase('tr')} FIRSATI: SEÇİLİ YAMALARDA %${pct}`, desc: `${c.monthName} boyunca seçili ${ids.length} üründe %${pct} indirim. Stoklar sınırlı.`, subtitle: `${c.monthName} boyunca seçili ${ids.length} üründe %${pct} indirim. Stoklar sınırlı.`, name: '' }).catch(() => {});
      return res.status(200).json({ saved: true, count: ids.length, pct });
    }
    return res.status(400).json({ error: 'Bilinmeyen işlem' });
  } catch (e) { console.error('[campaign]', e); res.status(400).json({ error: e.message || 'Hata' }); }
}
