// POST /api/paytr-callback  — PayTR "Bildirim URL"si (PayTR panelinde bu adresi tanımlayın)
// Her zaman düz metin "OK" döner; aksi halde PayTR bildirimi tekrar tekrar gönderir.
import { fb } from './_fb.mjs';
import { loadPaySettings, prepareGroup, markPaid, markFailed, paytrVerify, GROUP_RE, HttpError } from './_pay.mjs';
import { bodyOf } from './_http.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  if (req.method !== 'POST') return res.status(405).send('POST gerekli');
  try {
    const p = bodyOf(req);
    const { db, FieldValue } = fb();
    const { sec } = await loadPaySettings(db);
    if (!sec.merchant_key || !sec.merchant_salt || !paytrVerify(p, sec.merchant_salt, sec.merchant_key)) {
      console.error('[paytr] hash doğrulanamadı');
      return res.status(400).send('PAYTR notification failed: bad hash');   // sahte istek
    }
    const group = String(p.merchant_oid || '');
    if (!GROUP_RE.test(group)) return res.status(200).send('OK');
    if (p.status === 'success') {
      let g;
      try { g = await prepareGroup(db, group, null); }
      catch (e) { if (e instanceof HttpError && e.status === 409 && /zaten/.test(e.message)) return res.status(200).send('OK'); throw e; }   // zaten işlendi
      if (Number(p.total_amount) < g.kurus) { console.error('[paytr] tutar eksik', p.total_amount, g.kurus); await markFailed(db, FieldValue, group, 'Tutar uyuşmadı'); }
      else await markPaid(db, FieldValue, group, 'paytr', Number(p.total_amount));
    } else {
      await markFailed(db, FieldValue, group, p.failed_reason_msg || 'Ödeme başarısız');
    }
    res.status(200).send('OK');
  } catch (e) {
    console.error('[paytr-callback]', e);
    res.status(500).send('ERROR');   // PayTR tekrar dener
  }
}
