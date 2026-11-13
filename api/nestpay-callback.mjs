// POST /api/nestpay-callback — bankanın 3D dönüş adresi (okUrl/failUrl). Tarayıcıyı sepet sayfasına yönlendirir.
import { fb } from './_fb.mjs';
import { loadPaySettings, prepareGroup, markPaid, markFailed, nestpayVerify, nestpayApproved, siteOrigin, GROUP_RE, HttpError } from './_pay.mjs';
import { bodyOf } from './_http.mjs';

export default async function handler(req, res) {
  const origin = siteOrigin(req);
  const go = (u) => { res.setHeader('Location', origin + u); res.status(303).end(); };
  if (req.method !== 'POST') return go('/sepet.html');
  try {
    const p = bodyOf(req);
    const { db, FieldValue } = fb();
    const { sec } = await loadPaySettings(db);
    const group = String(p.oid || '');
    if (!sec.storeKey || !GROUP_RE.test(group) || !nestpayVerify(p, sec.storeKey)) {
      console.error('[nestpay] hash doğrulanamadı');
      return go('/sepet.html?odeme=hata');
    }
    if (!nestpayApproved(p)) {
      await markFailed(db, FieldValue, group, p.ErrMsg || p.mdErrorMsg || 'Banka onaylamadı');
      return go('/sepet.html?odeme=hata');
    }
    let g;
    try { g = await prepareGroup(db, group, null); }
    catch (e) {
      if (e instanceof HttpError && e.status === 409 && /zaten/.test(e.message)) return go('/sepet.html?odeme=ok&kod=' + encodeURIComponent(group));   // yenileme: zaten ödenmiş
      throw e;
    }
    if (Math.round(Number(String(p.amount).replace(',', '.')) * 100) < g.kurus) {
      await markFailed(db, FieldValue, group, 'Tutar uyuşmadı'); return go('/sepet.html?odeme=hata');
    }
    await markPaid(db, FieldValue, group, 'nestpay', g.kurus);
    go('/sepet.html?odeme=ok&kod=' + encodeURIComponent(g.codes.join(' + ')));
  } catch (e) {
    console.error('[nestpay-callback]', e);
    go('/sepet.html?odeme=hata');
  }
}
