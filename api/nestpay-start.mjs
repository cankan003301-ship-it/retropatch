// POST /api/nestpay-start { group } → { action, fields }  (Ziraat, İş Bankası, Akbank, Halkbank, TEB… 3D Pay Hosting)
import crypto from 'node:crypto';
import { fb } from './_fb.mjs';
import { loadPaySettings, prepareGroup, nestpayHash, siteOrigin, HttpError } from './_pay.mjs';
import { sendErr, authUid, groupOf, bodyOf } from './_http.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });
  try {
    const uid = await authUid(req);
    const group = groupOf(bodyOf(req));
    const { db } = fb();
    const { pub, provider, sec } = await loadPaySettings(db);
    if (!pub.cardEnabled || provider !== 'nestpay') throw new HttpError(400, 'Banka sanal POS ödemesi etkin değil');
    if (!sec.clientId || !sec.storeKey || !sec.gateUrl) throw new HttpError(500, 'Banka sanal POS bilgileri eksik');
    if (!/^https:\/\//i.test(sec.gateUrl)) throw new HttpError(500, '3D Gate adresi https olmalı');

    const g = await prepareGroup(db, group, uid);
    const origin = siteOrigin(req);
    const back = `${origin}/api/nestpay-callback`;
    const fields = {
      clientid: String(sec.clientId),
      storetype: '3d_pay_hosting',
      hashAlgorithm: 'ver3',
      islemtipi: 'Auth',
      amount: g.total.toFixed(2),
      currency: '949',
      oid: group,
      okUrl: back, failUrl: back,
      lang: 'tr',
      rnd: crypto.randomBytes(8).toString('hex'),
      email: g.buyer.email || '',
      BillToName: g.buyer.name
    };
    fields.hash = nestpayHash(fields, sec.storeKey);
    fields.encoding = 'UTF-8';
    res.status(200).json({ action: sec.gateUrl, fields });
  } catch (e) { sendErr(res, e); }
}
