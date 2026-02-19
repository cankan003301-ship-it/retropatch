// Vercel Serverless Function — Shopier Ödeme Entegrasyonu
// Dosya yolu: api/shopier.js

const crypto = require('crypto');

// ── BURAYA KENDİ BİLGİLERİNİ GİR ──
const SHOPIER_API_KEY    = process.env.SHOPIER_API_KEY    || 'SHOPIER_API_KEY_GIRIN';
const SHOPIER_API_SECRET = process.env.SHOPIER_API_SECRET || 'SHOPIER_API_SECRET_GIRIN';
const SITE_URL           = process.env.SITE_URL           || 'https://retropatch.vercel.app';
// ────────────────────────────────────

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderCode, total, userName, userEmail, userPhone, items } = req.body;

    if (!orderCode || !total || !userEmail) {
      return res.status(400).json({ error: 'Eksik sipariş bilgisi' });
    }

    // Shopier imza oluştur
    const random_nr   = Math.floor(Math.random() * 9999999) + 1000000;
    const installment = '0';
    const currency    = 'TRY';

    // Ürün açıklaması
    const productName = items && items.length > 0
      ? items.map(i => `${i.name} x${i.qty}`).join(', ').substring(0, 100)
      : 'RetroPatch Sipariş';

    // İmzalanacak veri
    const signatureData =
      SHOPIER_API_KEY +
      userEmail +
      orderCode +
      total.toFixed(2) +
      installment +
      currency +
      random_nr;

    const signature = crypto
      .createHmac('SHA256', SHOPIER_API_SECRET)
      .update(signatureData)
      .digest('base64');

    // Shopier form verisi
    const formData = {
      API_key:            SHOPIER_API_KEY,
      website_index:      '1',
      platform_order_id:  orderCode,
      product_name:       productName,
      product_type:       '0',
      buyer_name:         userName || 'Müşteri',
      buyer_surname:      '',
      buyer_email:        userEmail,
      buyer_account_age:  '0',
      buyer_phone:        userPhone || '',
      billing_address:    'Türkiye',
      billing_city:       'TR',
      billing_country:    'TR',
      billing_postcode:   '00000',
      shipping_address:   'Türkiye',
      shipping_city:      'TR',
      shipping_country:   'TR',
      shipping_postcode:  '00000',
      total_order_value:  total.toFixed(2),
      currency:           currency,
      modul_version:      '1.0.4',
      random_nr:          String(random_nr),
      installment:        installment,
      current_language:   'tr',
      callback_url:       `${SITE_URL}/api/shopier-callback`,
      return_url:         `${SITE_URL}/tesekkur.html?order=${orderCode}`,
      cancel_url:         `${SITE_URL}/sepet.html?cancelled=1`,
      signature:          signature,
    };

    return res.status(200).json({
      success: true,
      shopierUrl: 'https://www.shopier.com/ShowProduct/api_pay4.php',
      formData,
    });

  } catch (err) {
    console.error('Shopier error:', err);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
};
