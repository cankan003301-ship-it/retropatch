// Vercel Cron (günlük): 2 saatten eski, ödenmemiş kart siparişlerini iptal eder.
// Vercel → Environment Variables: CRON_SECRET = uzun rastgele bir metin (Vercel cron çağrısına otomatik ekler)
import { fb } from './_fb.mjs';

export function cronAuthorized(req) {
  const sec = process.env.CRON_SECRET;
  return !!sec && req.headers.authorization === 'Bearer ' + sec;
}
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'CRON_SECRET tanımlı değil' });
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Yetkisiz' });
  try {
    const { db } = fb();
    const cutoff = new Date(Date.now() - 2 * 3600 * 1000);
    let n = 0;
    for (const col of ['orders', 'digital_orders']) {
      const s = await db.collection(col).where('payment.status', '==', 'awaiting_card').get();
      for (const d of s.docs) {
        const t = d.data().createdAt;
        if (t && t.toDate && t.toDate() < cutoff) {
          await d.ref.update({ 'payment.status': 'abandoned', status: 'iptal' });
          n++;
        }
      }
    }
    res.status(200).json({ cancelled: n });
  } catch (e) { console.error('[cron-cleanup]', e); res.status(500).json({ error: 'Sunucu hatası' }); }
}
