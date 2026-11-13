// POST /api/paytr-token  { group }  →  { token }   (PayTR iFrame API)
import { fb } from './_fb.mjs';
import { loadPaySettings, prepareGroup, paytrTokenHash, siteOrigin, HttpError } from './_pay.mjs';
import { sendErr, authUid, groupOf, clientIp, bodyOf } from './_http.mjs';

export default async function handler(req, res) {
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
