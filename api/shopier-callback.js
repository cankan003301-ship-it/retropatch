// Vercel Serverless Function — Shopier Ödeme Geri Bildirimi
// Dosya yolu: api/shopier-callback.js
// Shopier ödeme tamamlandığında bu endpoint'i çağırır

const crypto = require('crypto');

const SHOPIER_API_KEY    = process.env.SHOPIER_API_KEY    || 'SHOPIER_API_KEY_GIRIN';
const SHOPIER_API_SECRET = process.env.SHOPIER_API_SECRET || 'SHOPIER_API_SECRET_GIRIN';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const {
      platform_order_id,
      status,
      installment,
      currency,
      random_nr,
      signature,
    } = req.body;

    // İmzayı doğrula
    const signatureData =
      SHOPIER_API_KEY +
      platform_order_id +
      installment +
      currency +
      random_nr;

    const expectedSig = crypto
      .createHmac('SHA256', SHOPIER_API_SECRET)
      .update(signatureData)
      .digest('base64');

    if (expectedSig !== signature) {
      console.error('Shopier imza hatası!');
      return res.status(400).send('Invalid signature');
    }

    // Ödeme başarılıysa Firebase Admin ile güncelle
    if (status === 'success') {
      // Firebase Admin SDK burada kullanılabilir
      // Ancak bu basit versiyon Firestore'u client-side güncelliyor
      console.log(`✅ Ödeme başarılı — Sipariş: ${platform_order_id}`);
    } else {
      console.log(`❌ Ödeme başarısız — Sipariş: ${platform_order_id}`);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Callback error:', err);
    return res.status(500).send('Error');
  }
};
