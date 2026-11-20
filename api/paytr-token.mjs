// POST /api/paytr-token  { group }  →  { token }   (PayTR iFrame API)
import { fb } from './_fb.mjs';
import { loadPaySettings, prepareGroup, paytrTokenHash, siteOrigin, HttpError } from './_pay.mjs';
import crypto from 'node:crypto';
import { sendErr, authUid, groupOf, clientIp, bodyOf } from './_http.mjs';

// GET /api/paytr-token?rates=1 → hangi karta kaç taksit (PayTR taksit oranları servisi, 1 saat önbellekli)
let ratesCache = { t: 0, key: '', data: null };
const CARD_NAMES = { axess: 'Axess (Akbank)', world: 'World (Yapı Kredi)', maximum: 'Maximum (İş Bankası)', bonus: 'Bonus (Garanti BBVA)', cardfinans: 'CardFinans (QNB)', paraf: 'Paraf (Halkbank)', advantage: 'Advantage', saglamkart: 'Sağlam Kart' };
async function rates(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { db } = fb();
    const { pub, provider, sec } = await loadPaySettings(db);
    if (!pub.cardEnabled || provider !== 'paytr' || pub.noInstallment || !sec.merchant_id) return res.status(200).json({ cards: [], why: 'ayar', cardEnabled: !!pub.cardEnabled, provider, noInstallment: !!pub.noInstallment, merchant: !!sec.merchant_id });
    const cap = parseInt(pub.maxInstallment, 10) || 0, key = String(cap);
    if (ratesCache.data && ratesCache.key === key && Date.now() - ratesCache.t < 3600e3) return res.status(200).json(ratesCache.data);
    const rid = 'r' + Date.now();
    const tok = crypto.createHmac('sha256', sec.merchant_key).update(String(sec.merchant_id) + rid + sec.merchant_salt).digest('base64');
    const r = await fetch('https://www.paytr.com/odeme/taksit-oranlari', { method: 'POST', body: new URLSearchParams({ merchant_id: String(sec.merchant_id), request_id: rid, paytr_token: tok }) });
    const j = await r.json().catch(() => ({}));
    const o = j.oranlar || {};
    const cards = Object.keys(o).map(k => {
      const inst = Object.keys(o[k] || {}).map(x => /^taksit_(\d+)$/.exec(x)).filter(Boolean).map(m => +m[1]).filter(n => n >= 2 && (!cap || n <= cap)).sort((a, b) => a - b);
      return { key: k, name: CARD_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)), inst };
    }).filter(c => c.inst.length);
    const data = { cards };
    if (!cards.length) { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ cards: [], why: 'paytr', status: j.status, reason: j.reason || j.err_msg || '', keys: Object.keys(j), sample: JSON.stringify(j).slice(0, 400) }); }
    if (cards.length) ratesCache = { t: Date.now(), key, data };
    res.status(200).json(data);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ cards: [], why: 'hata', msg: String(e && e.message || e).slice(0, 200) }); }
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query && req.query.rates) return rates(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });
  try {
    const uid = await authUid(req);
    const group = groupOf(bodyOf(req));
    const { db } = fb();
    const { pub, provider, sec } = await loadPaySettings(db);
    if (!pub.cardEnabled || provider !== 'paytr') throw new HttpError(400, 'PayTR ödemesi etkin değil');
    if (!sec.merchant_id || !sec.merchant_key || !sec.merchant_salt) throw new HttpError(500, 'PayTR anahtarları eksik');

    const g = await prepareGroup(db, group, uid);
    const origin = siteOrigin(req);
    const p = {
      merchant_id: String(sec.merchant_id),
      user_ip: clientIp(req),
      merchant_oid: group,
      email: g.buyer.email || 'musteri@retropatch.com',
      payment_amount: String(g.kurus),
      user_basket: Buffer.from(JSON.stringify(g.basket)).toString('base64'),
      no_installment: pub.noInstallment ? '1' : '0',
      max_installment: String(parseInt(pub.maxInstallment, 10) || 0),
      currency: 'TL',
      test_mode: pub.testMode ? '1' : '0'
    };
    const form = new URLSearchParams({
      ...p,
      paytr_token: paytrTokenHash(p, sec.merchant_salt, sec.merchant_key),
      user_name: g.buyer.name, user_address: g.buyer.address, user_phone: g.buyer.phone || '05000000000',
      merchant_ok_url: `${origin}/sepet.html?odeme=ok&kod=${encodeURIComponent(g.codes.join(' + '))}`,
      merchant_fail_url: `${origin}/sepet.html?odeme=hata`,
      timeout_limit: '30', debug_on: '0', lang: 'tr'
    });
    const r = await fetch('https://www.paytr.com/odeme/api/get-token', { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (j.status !== 'success' || !j.token) {
      console.error('[paytr] token hatası', j.reason);
      throw new HttpError(502, 'PayTR token alınamadı' + (pub.testMode && j.reason ? ': ' + j.reason : ''));
    }
    res.status(200).json({ token: j.token });
  } catch (e) { sendErr(res, e); }
}
